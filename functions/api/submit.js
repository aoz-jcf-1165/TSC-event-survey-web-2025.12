// =====================
// /functions/api/submit.js (FULL REPLACE)
// =====================
export async function onRequest(context) {
  const { request, env } = context;

  // --- CORS (same-origin運用なら不要だが、保険で付与) ---
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
  const ray = request.headers.get("cf-ray") || "";
  const requestId = crypto.randomUUID();

  try {
    // --- env ---
    const token = (env?.GITHUB_TOKEN || "").trim();
    const owner = (env?.GITHUB_OWNER || "").trim();
    const repo  = (env?.GITHUB_REPO  || "").trim();

    if (!token) {
      return json(500, { ok: false, message: "Missing GITHUB_TOKEN", requestId, time: now, ray }, corsHeaders);
    }
    if (!owner || !repo) {
      return json(500, { ok: false, message: "Missing GITHUB_OWNER or GITHUB_REPO", requestId, time: now, ray }, corsHeaders);
    }

    // --- body ---
    const body = await request.json().catch(() => null);
    const missing = [];
    const player_name = cleanStr(body?.player_name);
    const language    = cleanStr(body?.language);
    const Q2_time      = cleanStr(body?.Q2_time);
    const Q3_time      = cleanStr(body?.Q3_time);
    const Q4_day       = cleanStr(body?.Q4_day);

    if (!player_name) missing.push("player_name");
    if (!language)    missing.push("language");
    if (!Q2_time)     missing.push("Q2_time");
    if (!Q3_time)     missing.push("Q3_time");
    if (!Q4_day)      missing.push("Q4_day");

    if (missing.length) {
      return json(400, { ok: false, message: "Missing fields", missing, requestId, time: now, ray }, corsHeaders);
    }

    // --- GitHub API helpers ---
    const gh = githubClient(token);

    // 1) 同じ player_name の既存 issue を探して close（履歴として残す）
    //    ※ここは "Survey Response: <name>" タイトル運用前提
    //    タイトルに依存したくない場合は body JSON を検索する別方式にできますが、まずは安定重視。
    const searchQuery = `repo:${owner}/${repo} is:issue is:open in:title "Survey Response: ${escapeSearch(player_name)}"`;
    const found = await gh.searchIssues(searchQuery);

    // close (最大50件程度だけ処理で十分：同名を大量に作ることは通常ない)
    for (const it of found.items.slice(0, 50)) {
      // 自分が今から作る新issueと被る前提で、既存openはcloseして「最新だけopen」にする
      await gh.updateIssue(owner, repo, it.number, { state: "closed" });
    }

    // 2) 新しい issue を作成（survey ラベルを付ける）
    const title = `Survey Response: ${player_name}`;
    const payload = {
      timestamp: now,
      language,
      player_name,
      Q2_time,
      Q3_time,
      Q4_day,
    };

    const issueBody =
      [
        `Auto-submitted from Cloudflare Pages Functions.`,
        ``,
        `---`,
        `DATA (JSON):`,
        "```json",
        JSON.stringify(payload, null, 2),
        "```",
        ``,
      ].join("\n");

    const created = await gh.createIssue(owner, repo, {
      title,
      body: issueBody,
      labels: ["survey"],
    });

    return json(
      200,
      {
        ok: true,
        message: "Submitted.",
        requestId,
        time: now,
        ray,
        issue: {
          number: created.number,
          url: created.html_url,
        },
      },
      corsHeaders
    );
  } catch (err) {
    return json(
      500,
      {
        ok: false,
        message: "Server error",
        error: String(err?.message || err),
        requestId,
        time: now,
      },
      corsHeaders
    );
  }
}

function cleanStr(v) {
  if (v == null) return "";
  return String(v).trim();
}

function escapeSearch(s) {
  // GitHub search query 安全化（最低限）
  return String(s).replace(/"/g, '\\"');
}

function json(status, data, extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  };
  return new Response(data == null ? null : JSON.stringify(data, null, 2), { status, headers });
}

function githubClient(token) {
  const base = "https://api.github.com";

  async function request(path, init = {}) {
    const res = await fetch(base + path, {
      ...init,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });

    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }

    if (!res.ok) {
      const msg = json?.message || text || `HTTP ${res.status}`;
      throw new Error(`${msg} (${res.status})`);
    }
    return json;
  }

  return {
    async searchIssues(q) {
      return await request(`/search/issues?q=${encodeURIComponent(q)}&per_page=100`, { method: "GET" });
    },
    async updateIssue(owner, repo, number, data) {
      return await request(`/repos/${owner}/${repo}/issues/${number}`, { method: "PATCH", body: JSON.stringify(data) });
    },
    async createIssue(owner, repo, data) {
      return await request(`/repos/${owner}/${repo}/issues`, { method: "POST", body: JSON.stringify(data) });
    },
  };
}
