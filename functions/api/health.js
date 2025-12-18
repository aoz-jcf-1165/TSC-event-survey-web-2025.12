export async function onRequest(context) {
  const { request, env } = context;

  const url = new URL(request.url);
  const cf = request.cf || {};
  const ray = request.headers.get("cf-ray") || "";
  const method = request.method || "GET";

  // iPhone Safari で開いても “必ずJSON” になるように固定
  return json(
    200,
    {
      ok: true,
      message: "Pages Functions is alive",
      method,
      path: url.pathname,
      hasToken: !!env.GITHUB_TOKEN,
      time: new Date().toISOString(),
      ray,
      colo: cf.colo || null,
      country: cf.country || null,
    },
    {
      // CORS（必要なら）
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    }
  );
}

function json(status, obj, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}
