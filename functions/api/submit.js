// functions/api/submit.js
// Cloudflare Pages Functions - /api/submit
// JSON を受け取り、GitHub Issues に保存
//
// 必須: Pages (tsc-event-survey-web-2025-12) の Environment variables / Secrets に
//   - GITHUB_TOKEN
//
// NOTE:
// - 同一ドメイン運用なら CORS は不要ですが、将来互換のため残します
// - GET は動作確認用(health)として200を返します

const GITHUB_REPO = "aoz-jcf-1165/TSC-event-survey-web-2025.12";

// フロント側の言語コードと合わせる（小文字正規化前提）
const ALLOWED_LANGS = new Set([
  "en", "de", "nl", "fr", "ru", "es", "pt", "it",
  "zh-hans", "ja", "ko", "zh-hant",
  "ar", "th", "vi", "tr", "pl", "ms", "id"
]);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResp(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function normalizeText(v) {
  if (v == null) return "";
  return String(v).trim();
}

function normalizeLang(v) {
  return normalizeText(v).toLowerCase();
}

function inferLangFromAcceptLanguage(headerValue) {
  const h = normalizeText(headerValue).toLowerCase();
  if (!h) return "";
  const first = h.split(",")[0]?.trim() || "";
  const base = first.split(";")[0]?.trim() || "";
  const primary = base.split("-")[0] || "";
  return primary;
}

async function ghFetch(url, env, options = {}) {
  const token = env?.GITHUB_TOKEN;
  if (!token) {
    // Pages 側の Secrets 未設定（または Production に入っていない）
    return new Response(
      "Missing GITHUB_TOKEN in Pages environment variables (Production).",
      { status: 500 }
    );
  }

  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "tsc-survey-pages-functions",
      ...(options.headers || {}),
    },
  });
}

// OPTIONS (preflight)
export async function onRequestOptions() {
  return new Response("", { status: 204, headers: corsHeaders() });
}

// GET /api/submit (health check)
export async function onRequestGet(context) {
  const hasToken = !!context?.env?.GITHUB_TOKEN;
  return jsonResp(
    { ok: true, message: "Pages Functions is alive", hasToken },
    200
  );
}

// POST /api/submit
export async function onRequestPost(context) {
  const { request, env } = context;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResp({ ok: false, error: "Invalid JSON" }, 400);
  }

  const timestamp = normalizeText(payload?.timestamp) || new Date().toISOString();

  // language: payload優先 → Accept-Language 推定 → en
  let language = normalizeLang(payload?.language);
  if (!language) {
    language = inferLangFromAcceptLanguage(request.headers.get("Accept-Language"));
  }
  if (language === "zh") language = "zh-hans"; // zh は曖昧なので寄せる
  if (!ALLOWED_LANGS.has(language)) language = "en";

  const player_name = normalizeText(payload?.player_name);

  const Q2_time =
    normalizeText(payload?.Q2_time) ||
    normalizeText(payload?.Q02_time) ||
    normalizeText(payload?.q02) ||
    "";
  const Q3_time =
    normalizeText(payload?.Q3_time) ||
    normalizeText(payload?.Q03_time) ||
    normalizeText(payload?.q03) ||
    "";
  const Q4_day =
    normalizeText(payload?.Q4_day) ||
    normalizeText(payload?.Q04_day) ||
    normalizeText(payload?.q04) ||
    "";

  if (!player_name) return jsonResp({ ok: false, error: "player_name is required" }, 400);

  const issueTitle = `Survey response from: ${player_name}`;
  const issueBody = [
    "| Field | Value |",
    "| --- | --- |",
    `| timestamp | ${timestamp} |`,
    `| language | ${language} |`,
    `| player_name | ${player_name} |`,
    `| Q2_time | ${Q2_time} |`,
    `| Q3_time | ${Q3_time} |`,
    `| Q4_day | ${Q4_day} |`,
    "",
    "_Generated automatically from Cloudflare Pages Functions._",
  ].join("\n");

  try {
    // (任意) 同名のオープンIssueがあれば閉じる
    const CLOSE_OLD_ISSUES = true;

    if (CLOSE_OLD_ISSUES) {
      const listUrl = `https://api.github.com/repos/${GITHUB_REPO}/iss_
