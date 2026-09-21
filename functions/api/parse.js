const GEMINI_URL = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
// فري تير 2026: gemini-3-flash — لو مش متاح في منطقتك جرّب gemini-2.5-flash أو gemini-3.1-flash-lite
const MODEL = "gemini-3-flash";

const hits = new Map();
const RATE_LIMIT_PER_MIN = 8;
function rateLimit(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  if (arr.length >= RATE_LIMIT_PER_MIN) return false;
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return true;
}

function cors(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

const SYSTEM_PROMPT = `You are a maritime shipping document OCR expert.
Extract fields from the shipping document image and return STRICT JSON only (no markdown, no explanation) in this exact format:
{
  "ok": true,
  "summary": "One short sentence describing the shipment in English",
  "data": {
    "bl_reference": "", "shipper": "", "shipper_phone": "", "shipper_tax": "",
    "consignee": "", "consignee_tax": "", "notify_name": "", "notify_phone": "",
    "vessel": "", "pol": "", "pod": "", "destination_port": "",
    "container_no": "", "container_type": "", "description": "", "hs_code": "",
    "incoterms": "", "terms": "", "date_of_issue": "", "issue_place": "", "forwarder": "", "signatory": ""
  }
}
Rules:
- Keep original values exactly as written (names, numbers, codes).
- If a field is missing, set it to null (not empty string).
- date_of_issue as YYYY-MM-DD.
- hs_code keep dots.
- The user message may contain 1 or 2 document page images (page 1 first, page 2 second). Merge info from all pages.
- Return ONLY the JSON object.`;

export async function onRequestOptions() {
  return cors({ ok: true });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = request.headers.get("CF-Connecting-IP") || "anon";
  if (!rateLimit(ip)) return cors({ ok: false, error: "Too many requests — wait a minute and retry." }, 429);
  if (!env.GEMINI_API_KEY) return cors({ ok: false, error: "GEMINI_API_KEY is not set in Cloudflare Pages settings." }, 500);

  try {
    const form = await request.formData();
    const file = form.get("file");
    const file2 = form.get("file2");
    if (!file) return cors({ ok: false, error: "No file uploaded." }, 400);

    const toB64 = async (f) => {
      const m = f.type || "image/png";
      if (!m.startsWith("image/")) {
        throw new Error("Demo mode: please upload a PDF or an IMAGE (PNG/JPG/WEBP) of the shipping document.");
      }
      const b = new Uint8Array(await f.arrayBuffer());
      let bin = "";
      for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode(...b.subarray(i, i + 8192));
      return { mime: m, b64: btoa(bin) };
    };

    const img1 = await toB64(file);
    const img2 = file2 ? await toB64(file2) : null;

    const geminiRes = await fetch(GEMINI_URL(MODEL), {
      method: "POST",
      headers: {
        "x-goog-api-key": env.GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  SYSTEM_PROMPT +
                  "\n\nExtract the shipping document fields from the page image(s). Page 1 first, page 2 second (if present). Merge info from all pages.",
              },
              { inline_data: { mime_type: img1.mime, data: img1.b64 } },
              ...(img2 ? [{ inline_data: { mime_type: img2.mime, data: img2.b64 } }] : []),
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 2048 },
      }),
    });

    if (!geminiRes.ok) {
      const errJson = await geminiRes.json().catch(() => null);
      const msg = errJson?.error?.message || `AI provider error (${geminiRes.status}). Try again.`;
      return cors({ ok: false, error: msg }, geminiRes.status === 429 ? 429 : 502);
    }

    const geminiJson = await geminiRes.json();
    let raw = geminiJson.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "{}";
    raw = raw.replace(/```(?:json)?/gi, "").trim();
    const parsed = JSON.parse(raw);

    if (!parsed.data || typeof parsed.data !== "object") {
      return cors({ ok: false, error: "AI could not read this document clearly. Try a sharper image." }, 422);
    }

    const data = {};
    for (const [k, v] of Object.entries(parsed.data)) data[k] = v ?? "";

    return cors({ ok: true, summary: parsed.summary || "Shipping data extracted successfully.", data });
  } catch (e) {
    return cors({ ok: false, error: "Parse failed: " + (e.message || e) }, 500);
  }
}
