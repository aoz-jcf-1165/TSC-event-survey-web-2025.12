// functions/api/submit.js
// Cloudflare Pages Functions - /api/submit
// JSON を受け取り、GitHub Issues に保存（キー名をCSV側と完全一致させる）
// 追加: language の欠損補完 / 正規化（en事故を抑止）
//
// 重要:
// - Pages の Environment variables / Secrets に「GITHUB_TOKEN」を設定してください
// - 同一ドメイン運用なので CORS は基本不要ですが、互換のため OPTIONS も返します

const GITHUB_REPO = "aoz-jcf-1165/TSC-event-survey-web-2025.12";

// 許容する言語コード（フロントのLANGUAGE_LABELSと合わせる）
const ALLOWED_LANGS = new Set([
  "en","de","nl","fr","ru","es","pt","it","zh-hans","ja","ko","zh-hant","ar","th","vi","tr","pl","ms","id"
]);

function corsHeaders() {
  // 同一オリジンなら本来不要。ただし将来の利用や一部ブラウザ挙動のために残す。
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  const s = normalizeText(v).toLowerCase();
  return s;
}

function inferLangFromAcceptLanguage(headerValue) {
  const h = normalizeText(headerValue).toLowerCase();
  if (!h) return "";
  // 例: "ja,en-US;q=0.9,en;q=0.8"
  const first = h.split(",")[0]?.trim() || "";
  const base = first.split(";")[0]?.trim() || "";
  // "en-us" -> "en"
  const primary = base.split("-")[0] || "";
  return primary;
}

async function ghFetch(url, env, options = {}) {
  const token = env?.GITHUB_TOKEN;
  if (!token) {
    // 環境変数未設定はここで止める（分かりやすく）
    return new Response("Missing GITHUB_TOKEN in Pages environment variables.", { status: 500 });
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "tsc-survey-pages-functions",
      ...(options.headers || {}),
    },
  });

  return res;
}

// OPTIONS (preflight)
export async function onRequestOptions(context) {
  return new Response("", { status: 204, headers: corsHeaders() });
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

  // ★ language: payload優先、無ければ Accept-Language から推定、最後に en
  let language = normalizeLang(payload?.language);
  if (!language) {
    language = inferLangFromAcceptLanguage(request.headers.get("Accept-Language"));
  }
  if (language === "zh") {
    // zh は雑なので、フロントで送る想定。ここでは en にせず zh-hans に寄せる
    language = "zh-hans";
  }
  if (!ALLOWED_LANGS.has(language)) {
    // 未知は en に落とす（ただしここに来る時点でかなり例外）
    language = "en";
  }

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

  if (!player_name) {
    return jsonResp({ ok: false, error: "player_name is required" }, 400);
  }

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
    const CLOSE_OLD_ISSUES = true;

    if (CLOSE_OLD_ISSUES) {
      const listUrl = `https://api.github.com/repos/${GITHUB_REPO}/issues?state=open&per_page=100`;
      const listRes = await ghFetch(listUrl, env, { method: "GET" });

      if (listRes.ok) {
        const issues = await listRes.json();
        const targets = (issues || []).filter((it) => it?.title === issueTitle);

        for (const it of targets) {
          await ghFetch(`https://api.github.com/repos/${GITHUB_REPO}/issues/${it.number}`, env, {
            method: "PATCH",
            body: JSON.stringify({ state: "closed" }),
          });
        }
      }
    }

    const createRes = await ghFetch(
      `https://api.github.com/repos/${GITHUB_REPO}/issues`,
      env,
      {
        method: "POST",
        body: JSON.stringify({ title: issueTitle, body: issueBody }),
      }
    );

    if (!createRes.ok) {
      const errorText = await createRes.text();
      return jsonResp(
        { ok: false, githubStatus: createRes.status, githubBody: errorText },
        502
      );
    }

    const ghData = await createRes.json();
    return jsonResp({ ok: true, issueNumber: ghData.number }, 200);
  } catch (err) {
    return jsonResp({ ok: false, error: String(err) }, 500);
  }
}

// それ以外のメソッドは拒否
export async function onRequest(context) {
  const method = context.request.method || "GET";
  if (method === "POST") return onRequestPost(context);
  if (method === "OPTIONS") return onRequestOptions(context);
  return jsonResp({ ok: false, error: "Use POST only." }, 405);
}
