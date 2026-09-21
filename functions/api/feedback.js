function cors(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function onRequestOptions() {
  return cors({ ok: true });
}

// ─────────── POST: استقبال تقييم جديد ───────────
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.FEEDBACK) return cors({ ok: false, error: "KV binding FEEDBACK is not set." }, 500);
  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.rating || body.rating < 1 || body.rating > 5) {
      return cors({ ok: false, error: "Rating (1-5) is required." }, 400);
    }
    const ip = request.headers.get("CF-Connecting-IP") || "anon";
    const id = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    const item = {
      rating: body.rating,
      comment: String(body.comment || "").slice(0, 500),
      lang: String(body.lang || "").slice(0, 10),
      ts: new Date().toISOString(),
      ip,
    };
    await env.FEEDBACK.put(id, JSON.stringify(item));
    return cors({ ok: true });
  } catch (e) {
    return cors({ ok: false, error: "Feedback failed: " + (e.message || e) }, 500);
  }
}

// ─────────── GET: صفحة الأدمن — تشوف كل التقييمات ───────────
export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.FEEDBACK) return cors({ ok: false, error: "KV binding FEEDBACK is not set." }, 500);
  const url = new URL(request.url);
  if (!env.ADMIN_KEY || url.searchParams.get("key") !== env.ADMIN_KEY) {
    return cors({ ok: false, error: "Unauthorized. Add ?key=YOUR_ADMIN_KEY" }, 401);
  }

  const listed = await env.FEEDBACK.list();
  const items = (await Promise.all(listed.keys.map((k) => env.FEEDBACK.get(k.name, "json")))).filter((x) => !!x);

  items.sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));

  const avg = items.length ? (items.reduce((s, x) => s + (x.rating || 0), 0) / items.length).toFixed(2) : "0";
  const rows = items
    .map(
      (x) =>
        `<tr><td>${x.rating}⭐</td><td>${(x.comment || "").replace(/</g, "&lt;")}</td><td>${x.lang || ""}</td><td>${
          x.ts || ""
        }</td></tr>`
    )
    .join("");
  const page = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Basyouni Feedback</title>
  <style>body{font-family:sans-serif;max-width:900px;margin:30px auto;padding:0 16px}
  h1{font-size:20px}table{width:100%;border-collapse:collapse;font-size:13px}
  td,th{border:1px solid #ddd;padding:8px;text-align:start}th{background:#f4f7fa}
  .avg{background:#12B8A6;color:#fff;padding:6px 16px;border-radius:20px;display:inline-block;font-weight:bold}</style>
  </head><body><h1>📊 Basyouni Demo Feedback (${items.length} تقييم)</h1>
  <p class="avg">متوسط التقييم: ${avg} ⭐</p>
  <table><tr><th>التقييم</th><th>الرأي</th><th>اللغة</th><th>الوقت</th></tr>${rows}</table>
  </body></html>`;
  return new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
