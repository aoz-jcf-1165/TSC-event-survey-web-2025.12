// =====================
// /functions/api/submit.js (FULL REPLACE / FINAL)
// =====================
export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json(405, { ok: false, message: "Method not allowed" }, corsHeaders);
  }

  const now = new Date().toISOString();
  const requestId = crypto.randomUUID();

  try {
    const token = (env.GITHUB_TOKEN || "").trim();
    const owner = (env.GITHUB_OWNER || "").trim();
    const repo  = (env.GITHUB_REPO  || "").trim();

    if (!token || !owner || !repo) {
      return json(500, { ok: false, message: "Missing GitHub env" }, corsHeaders);
    }

    const body = await request.json();
    const player_name = clean(body.player_name);
    const language    = clean(body.language);
    const Q2_time     = clean(body.Q2_time);
    const Q3_time     = clean(body.Q3_time);
    const Q4_day      = clean(body.Q4_day);

    if (!player_name || !language || !Q2_time || !Q3_time || !Q4_day) {
      return json(400, { ok: false, message: "Missing fields" }, corsHeaders);
    }

    const gh = github(token);

    // --- close old issues (same player) ---
    const q = `repo:${owner}/${repo} is:issue is:open in:title "Survey Response: ${escape(player_name)}"`;
    const found = await gh.search(q);

    for (const it of found.items) {
      await gh.update(owner, repo, it.number, { state: "closed" });
    }

    // --- create new issue (ONLY ONE with survey) ---
    const issue = await gh.create(owner, repo, {
      title: `Survey Response: ${player_name}`,
      labels: ["survey"],
      body: [
        "Auto-submitted survey",
        "",
        "```json",
        JSON.stringify({ timestamp: now, language, player_name, Q2_time, Q3_time, Q4_day }, null, 2),
        "```",
      ].join("\n"),
    });

    return json(200, {
      ok: true,
      issue: { number: issue.number, url: issue.html_url },
    }, corsHeaders);

  } catch (e) {
    return json(500, { ok: false, error: String(e) }, corsHeaders);
  }
}

function clean(v) {
  return String(v || "").trim();
}
function escape(s) {
  return s.replace(/"/g, '\\"');
}
function json(status, data, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function github(token) {
  const base = "https://api.github.com";
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "cf-pages-survey-function"
  };

  async function req(path, init = {}) {
    const r = await fetch(base + path, { ...init, headers });
    const t = await r.text();
    if (!r.ok) throw new Error(t);
    return t ? JSON.parse(t) : null;
  }

  return {
    search: q => req(`/search/issues?q=${encodeURIComponent(q)}`),
    update: (o, r, n, d) => req(`/repos/${o}/${r}/issues/${n}`, { method: "PATCH", body: JSON.stringify(d) }),
    create: (o, r, d) => req(`/repos/${o}/${r}/issues`, { method: "POST", body: JSON.stringify(d) }),
  };
}
