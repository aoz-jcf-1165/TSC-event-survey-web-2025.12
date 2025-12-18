export async function onRequest(context) {
  const { request, env } = context;

  /* ===============================
     CORS
  =============================== */
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  /* ===============================
     GET: 動作確認用
  =============================== */
  if (request.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        message: "Pages Functions is alive",
        hasToken: !!env.GITHUB_TOKEN,
        time: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }

  /* ===============================
     POST only beyond this point
  =============================== */
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Use POST only." }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }

  /* ===============================
     Env check
  =============================== */
  if (!env.GITHUB_TOKEN) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "GITHUB_TOKEN is missing in Pages environment",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }

  /* ===============================
     Parse body
  =============================== */
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Invalid JSON body",
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }

  /* ===============================
     GitHub Issue create
  =============================== */
  const owner = "aoz-jcf-1165";
  const repo = "TSC-event-survey-web-2025.12";

  const issueBody =
    "### Survey submission\n\n```json\n" +
    JSON.stringify(payload, null, 2) +
    "\n```";

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "cloudflare-pages-survey",
      },
      body: JSON.stringify({
        title: `Survey response - ${new Date().toISOString()}`,
        body: issueBody,
      }),
    }
  );

  const text = await res.text();

  if (!res.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "GitHub API error",
        status: res.status,
        response: text,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: "Issue created",
      githubStatus: res.status,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    }
  );
}
