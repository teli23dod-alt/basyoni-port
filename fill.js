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

export async function onRequestOptions() {
  return cors({ ok: true });
}

export async function onRequestPost(context) {
  try {
    const { url: target, data } = await context.request.json();
    if (!target) return cors({ ok: false, error: "Target URL is required." }, 400);
    if (!data || typeof data !== "object") return cors({ ok: false, error: "No extracted data provided." }, 400);

    const filledFields = Object.entries(data)
      .filter(([, v]) => v && String(v).trim() !== "")
      .map(([k]) => k);

    const rows = filledFields
      .slice(0, 12)
      .map(
        (k, i) =>
          `<text x="30" y="${110 + i * 26}" font-family="monospace" font-size="13" fill="#0F2A3D"><tspan fill="#0E7BB8" font-weight="bold">${k}</tspan> : ${String(
            data[k]
          )
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")}</text>`
      )
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="${140 + Math.min(filledFields.length, 12) * 26}">
      <rect width="100%" height="100%" fill="#F4F7FA"/>
      <rect x="10" y="10" width="620" height="60" rx="10" fill="#0F2A3D"/>
      <text x="30" y="47" font-family="sans-serif" font-size="18" font-weight="bold" fill="#12B8A6">✅ Demo Discharge — Basyouni AI</text>
      ${rows}
      <text x="30" y="${140 + Math.min(filledFields.length, 12) * 26 - 14}" font-family="sans-serif" font-size="11" fill="#93A5B8">Target: ${String(
        target
      )
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}</text>
    </svg>`;
    const screenshot = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));

    return cors({ ok: true, fields: filledFields, screenshot });
  } catch (e) {
    return cors({ ok: false, error: "Fill failed: " + (e.message || e) }, 500);
  }
}
