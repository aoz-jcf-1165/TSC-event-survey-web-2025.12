// /functions/api/submit.js
// =========================================================
// Cloudflare Pages Functions: POST /api/submit
// - Handles CORS + OPTIONS preflight
// - Validates payload
// - Creates GitHub Issue via REST API
// =========================================================

function parseAllowedOrigins(env) {
  const raw = (env.ALLOWED_ORIGINS || "").trim();
  if (!raw) return null; // allow all
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = parseAllowedOrigins(env);

  if (!allowed) {
    // no allowlist set => allow any origin (safe enough for this use case)
    return origin || "*";
  }

  if (origin && allowed.includes(origin)) return origin;
  // If not allowed, do not reflect origin (CORS will block)
  return allowed[0] || "null";
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(status, obj, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
  });
}

function requireEnv(env, key) {
  const v = (env[key] || "").trim();
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

function sanitizeText(s, maxLen = 2000) {
  const t = (s == null ? "" : String(s)).replace(/\r/g, "").trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen) + "…";
}

function buildIssueBody(payload) {
  // keep it simple and parseable
  return [
    "TSC Event Survey Submission",
    "",
    `timestamp: ${payload.timestamp || ""}`,
    `language: ${payload.language || ""}`,
    `player_name: ${payload.player_name || ""}`,
    `Q2_time: ${payload.Q2_time || ""}`,
    `Q3_time: ${payload.Q3_time || ""}`,
    `Q4_day: ${payload.Q4_day || ""}`,
    "",
    "raw_json:",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "",
  ].join("\n");
}

async function createGithubIssue({ owner, repo, token, title, body, labels }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "tsc-event-survey-web-2025-12",
    },
    body: JSON.stringify({
      title,
      body,
      labels: labels && labels.length ? labels : undefined,
    }),
  });

  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (_) {}

  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      (text ? text.slice(0, 400) : "GitHub API error");
    const err = new Error(msg);
    err.githubStatus = res.status;
    throw err;
  }

  return data;
}

export async function onRequestOptions({ request, env }) {
  const origin = pickOrigin(request, env);
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function onRequestPost({ request, env }) {
  const origin = pickOrigin(request, env);

  try {
    // ---- validate env ----
    const token = requireEnv(env, "GITHUB_TOKEN");
    const owner = requireEnv(env, "GITHUB_OWNER");
    const repo = requireEnv(env, "GITHUB_REPO");

    const labels = (env.GITHUB_LABELS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // ---- parse body ----
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return json(400, { ok: false, error: "Invalid JSON body" }, origin);
    }

    // ---- required fields ----
    const required = ["player_name", "language", "Q2_time", "Q3_time", "Q4_day"];
    const missing = required.filter((k) => !payload[k]);
    if (missing.length) {
      return json(400, { ok: false, missing }, origin);
    }

    // ---- sanitize ----
    const clean = {
      timestamp: sanitizeText(payload.timestamp || new Date().toISOString(), 64),
      language: sanitizeText(payload.language, 32),
      player_name: sanitizeText(payload.player_name, 80),
      Q2_time: sanitizeText(payload.Q2_time, 10),
      Q3_time: sanitizeText(payload.Q3_time, 10),
      Q4_day: sanitizeText(payload.Q4_day, 12),
    };

    // ---- build issue ----
    const title = sanitizeText(
      `Survey: ${clean.player_name} (${clean.language})`,
      120
    );
    const body = buildIssueBody(clean);

    const issue = await createGithubIssue({
      owner,
      repo,
      token,
      title,
      body,
      labels,
    });

    return json(
      200,
      {
        ok: true,
        message: "Submitted.",
        issue: {
          number: issue.number,
          url: issue.html_url,
        },
        time: new Date().toISOString(),
      },
      origin
    );
  } catch (err) {
    const githubStatus = err && err.githubStatus ? err.githubStatus : null;

    return json(
      500,
      {
        ok: false,
        stage: githubStatus ? "github" : "server",
        githubStatus,
        error: err && err.message ? err.message : String(err),
        time: new Date().toISOString(),
      },
      origin
    );
  }
}
