// =====================
// /functions/api/submit.js (FULL REPLACE)
// =====================
export async function onRequest(context) {
  const { request, env } = context;

  const ray = request.headers.get("cf-ray") || "";
  const requestId = crypto.randomUUID();
  const now = new Date().toISOString();

  // --- CORS / preflight ---
  if (request.method === "OPTIONS") {
    return json(204, null, corsHeaders());
  }

  // --- GETは “使い方” をJSONで返す（iPhoneで見やすい） ---
  if (request.method !== "POST") {
    return json(
      405,
      {
        ok: false,
        error: "Use POST only.",
        hint: {
          url: "/api/submit",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body_example: {
            language: "en",
            player_name: "TEST",
            Q2_time: "A",
            Q3_time: "B",
            Q4_day: "C",
          },
        },
        requestId,
        time: now,
        ray,
      },
      { ...corsHeaders(), "Cache-Control": "no-store" }
    );
  }

  // --- 必須ENVチェック ---
  const token = (env.GITHUB_TOKEN || "").trim();
  const owner = (env.GITHUB_OWNER || "aoz-jcf-1165").trim();
  const repo  = (env.GITHUB_REPO  || "TSC-event-survey-web-2025.12").trim();

  if (!token) {
    return json(
      500,
      {
        ok: false,
        error: "Missing GITHUB_TOKEN in Pages project variables (secret).",
        requestId,
        time: now,
        ray,
      },
      { ...corsHeaders(), "Cache-Control": "no-store" }
    );
  }

  // --- JSON受け取り（失敗しても必ずJSON返す） ---
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return json(
      400,
      {
        ok: false,
        error: "Invalid JSON body.",
        detail: safeErr(e),
        requestId,
        time: now,
        ray,
      },
      { ...corsHeaders(), "Cache-Control": "no-store" }
    );
  }

  // --- バリデーション ---
  const language = str(payload.language);
  const player_name = str(payload.player_name);
  const Q2_time = str(payload.Q2_time);
  const Q3_time = str(payload.Q3_time);
  const Q4_day = str(payload.Q4_day);

  const missing = [];
  if (!player_name) missing.push("player_name");
  if (!language) missing.push("language");
  if (!Q2_time) missing.push("Q2_time");
  if (!Q3_time) missing.push("Q3_time");
  if (!Q4_day) missing.push("Q4_day");

  if (missing.length) {
    return json(
      400,
      {
        ok: false,
        error: "Missing required fields.",
        missing,
        received: { language, player_name, Q2_time, Q3_time, Q4_day },
        requestId,
        time: now,
        ray,
      },
      { ...corsHeaders(), "Cache-Control": "no-store" }
    );
  }

  // --- 送信内容（GitHub Issue に入れる） ---
  const stamp = now;
  const issueTitle = `survey:${player_name}`;
  const issueBody = [
    `timestamp: ${stamp}`,
    `language: ${language}`,
    `player_name: ${player_name}`,
    `Q2_time: ${Q2_time}`,
    `Q3_time: ${Q3_time}`,
    `Q4_day: ${Q4_day}`,
    "",
    "```json",
    JSON.stringify({ timestamp: stamp, language, player_name, Q2_time, Q3_time, Q4_day }, null, 2),
    "```",
  ].join("\n");

  const ghUrl = `https://api.github.com/repos/${owner}/${repo}/issues`;

  const controller = new AbortController();
  const timeoutMs = 15000;
  const t = setTimeout(() => controller.abort(), timeoutMs);

  let ghRes, ghText;
  try {
    ghRes = await fetch(ghUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "cf-pages-functions-survey",
      },
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels: ["survey"],
      }),
    });
    ghText = await ghRes.text();
  } catch (e) {
    clearTimeout(t);
    return json(
      503,
      {
        ok: false,
        error: "Upstream request failed (fetch/GitHub).",
        detail: safeErr(e),
        timeoutMs,
        ghUrl,
        requestId,
        time: now,
        ray,
      },
      { ...corsHeaders(), "Cache-Control": "no-store" }
    );
  } finally {
    clearTimeout(t);
  }

  if (!ghRes.ok) {
    return json(
      502,
      {
        ok: false,
        error: "GitHub API returned error.",
        gh: {
          status: ghRes.status,
          statusText: ghRes.statusText,
          body: limitText(ghText, 4000),
        },
        hint: [
          "1) token権限 (repo / issues write) を確認",
          "2) owner/repo 名が正しいか確認",
          "3) GitHub側のレート制限・障害の可能性",
        ],
        requestId,
        time: now,
        ray,
      },
      { ...corsHeaders(), "Cache-Control": "no-store" }
    );
  }

  let ghJson = null;
  try { ghJson = JSON.parse(ghText); } catch (_) {}

  return json(
    200,
    {
      ok: true,
      message: "Submitted.",
      issue: ghJson ? { number: ghJson.number, url: ghJson.html_url } : null,
      requestId,
      time: now,
      ray,
    },
    { ...corsHeaders(), "Cache-Control": "no-store" }
  );
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(status, obj, headers = {}) {
  if (status === 204) return new Response(null, { status, headers });
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function str(v) { return (v == null ? "" : String(v)).trim(); }
function safeErr(e) { return { name: e?.name || "Error", message: e?.message || String(e) }; }
function limitText(s, max) { if (!s) return ""; return s.length > max ? s.slice(0, max) + "…(truncated)" : s; }
