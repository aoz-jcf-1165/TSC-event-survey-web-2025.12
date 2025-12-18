/* =========================================================
   TSC Event Survey - survey.js (FULL REPLACE)
   - Uses Cloudflare Pages Functions endpoint (absolute URL)
   - Handles i18n TSV loading
   - Handles query params (lang, q02, q03, q04)
   - Submits JSON to /api/submit with robust error messaging
   ========================================================= */

// ==== Cloudflare Pages Functions API (ABSOLUTE URL) ====
const API_URL = "https://tsc-event-survey-web-2025-12.pages.dev/api/submit";

// ==== i18n TSV ====
const TRANSLATION_FILE = "translations.tsv";

// ===== CDN PDF link =====
const CDN_PDF_URL =
  "https://cdn.jsdelivr.net/gh/aoz-jcf-1165/TSC-event-survey-web-2025.12@main/share_document/TSC-event-survey-2025-12.pdf";

// ==== Language labels ====
const LANGUAGE_LABELS = {
  en: "English",
  de: "Deutsch",
  nl: "Nederlands",
  fr: "Français",
  ru: "Русский",
  es: "Español",
  pt: "Português",
  it: "Italiano",
  "zh-Hans": "简体中文",
  ja: "日本語",
  ko: "한국어",
  "zh-Hant": "繁體中文",
  ar: "العربية",
  th: "ไทย",
  vi: "Tiếng Việt",
  tr: "Türkçe",
  pl: "Polski",
  ms: "Bahasa Melayu",
  id: "Bahasa Indonesia",
};

// ==== State ====
let translations = {};     // key -> { lang -> text }
let availableLangs = [];   // list of langs from header
let currentLang = "en";

// ==== Utils ====
function qs(sel, root = document) {
  return root.querySelector(sel);
}
function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

function getQueryParams() {
  const p = new URLSearchParams(location.search);
  const obj = {};
  for (const [k, v] of p.entries()) obj[k] = v;
  return obj;
}

function setText(el, text) {
  if (!el) return;
  el.textContent = text == null ? "" : String(text);
}

function setError(idOrEl, msg) {
  const el = typeof idOrEl === "string" ? document.getElementById(idOrEl) : idOrEl;
  if (!el) return;
  el.style.display = msg ? "block" : "none";
  el.textContent = msg || "";
}

function setFormDisabled(disabled) {
  const form = document.getElementById("surveyForm");
  if (!form) return;
  qsa("input, select, textarea, button", form).forEach((x) => (x.disabled = !!disabled));
}

function setSubmitEnabled(enabled) {
  const btn = document.getElementById("submitBtn") || qs('button[type="submit"]');
  if (btn) btn.disabled = !enabled;
}

function scrollToBottomSmooth() {
  try {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  } catch (_) {
    window.scrollTo(0, document.body.scrollHeight);
  }
}

// ==== TSV loader ====
async function loadTranslationsTSV() {
  const res = await fetch(TRANSLATION_FILE, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load translations.tsv (${res.status})`);
  const text = await res.text();

  // TSV: key <tab> en <tab> de ...
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error("translations.tsv is empty");

  const header = lines[0].split("\t").map((s) => s.trim());
  if (!header.length || header[0] !== "key") {
    throw new Error('translations.tsv header must start with "key"');
  }

  availableLangs = header.slice(1);
  const map = {};

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const key = (cols[0] || "").trim();
    if (!key) continue;

    const entry = {};
    for (let j = 1; j < header.length; j++) {
      const lang = header[j];
      entry[lang] = cols[j] != null ? cols[j] : "";
    }
    map[key] = entry;
  }

  translations = map;
}

// ==== i18n ====
function t(key) {
  const entry = translations[key];
  if (!entry) return null;
  return entry[currentLang] || entry["en"] || null;
}

function applyLanguage(lang) {
  currentLang = (lang || "en").toString().trim() || "en";
  localStorage.setItem("tsc_lang", currentLang);

  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === "ar" ? "rtl" : "ltr";

  // Replace text by data-i18n key
  qsa("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const val = t(key);
    if (val != null) el.textContent = val;
  });

  // Replace placeholders
  qsa("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    const val = t(key);
    if (val != null) el.setAttribute("placeholder", val);
  });

  // Replace html (rare; keep safe)
  qsa("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    const val = t(key);
    if (val != null) el.innerHTML = val;
  });

  // Update language label (if present)
  const langLabel = document.getElementById("currentLangLabel");
  if (langLabel) {
    langLabel.textContent = LANGUAGE_LABELS[currentLang] || currentLang;
  }

  // Update hidden language input if exists
  const langInput = document.getElementById("language") || qs('input[name="language"]');
  if (langInput) langInput.value = currentLang;
}

function buildLanguageSelector() {
  const sel =
    document.getElementById("langSelect") ||
    qs('select[name="lang"]') ||
    qs('select[data-role="lang"]');

  if (!sel) return;

  // Rebuild options
  sel.innerHTML = "";
  const langs = availableLangs.length ? availableLangs : Object.keys(LANGUAGE_LABELS);

  for (const code of langs) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = LANGUAGE_LABELS[code] || code;
    sel.appendChild(opt);
  }

  sel.value = currentLang;
  sel.addEventListener("change", () => applyLanguage(sel.value));
}

// ==== Form helpers ====
function getCheckedValue(name) {
  const el = qs(`input[name="${CSS.escape(name)}"]:checked`);
  return el ? el.value : "";
}

function setCheckedValue(name, value) {
  if (!value) return;
  const el = qs(`input[name="${CSS.escape(name)}"][value="${CSS.escape(value)}"]`);
  if (el) el.checked = true;
}

function getTextValue(idOrName) {
  const el = document.getElementById(idOrName) || qs(`[name="${CSS.escape(idOrName)}"]`);
  return el ? (el.value || "").trim() : "";
}

function setTextValue(idOrName, value) {
  const el = document.getElementById(idOrName) || qs(`[name="${CSS.escape(idOrName)}"]`);
  if (el) el.value = value != null ? String(value) : "";
}

function validatePayload(payload) {
  const missing = [];
  for (const k of ["player_name", "language", "Q2_time", "Q3_time", "Q4_day"]) {
    if (!payload[k]) missing.push(k);
  }
  return missing;
}

// ==== Submit ====
async function submitSurvey(payload) {
  // NOTE: JSON POST triggers CORS preflight on cross-origin. Server must handle OPTIONS.
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    // try to parse detail json
    let detail = null;
    try {
      detail = await res.json();
    } catch (_) {}

    // show more helpful error
    const stage = detail && detail.stage ? ` [${detail.stage}]` : "";
    const gh = detail && detail.githubStatus ? ` GitHub:${detail.githubStatus}` : "";
    const err = detail && detail.error ? ` - ${detail.error}` : "";

    throw new Error(`Server error (${res.status}).${stage}${gh}${err}`.trim());
  }

  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    throw new Error("API error. Please try again.");
  }
  return data;
}

// ==== Init ====
async function init() {
  // PDF link wiring (if exists)
  const pdfLink = document.getElementById("pdfLink");
  if (pdfLink) {
    pdfLink.setAttribute("href", CDN_PDF_URL);
    pdfLink.setAttribute("target", "_blank");
    pdfLink.setAttribute("rel", "noopener noreferrer");
  }

  // Load translations
  try {
    await loadTranslationsTSV();
  } catch (e) {
    console.error(e);
    // still allow form submission even if i18n fails
  }

  // Determine initial lang
  const qp = getQueryParams();
  const saved = localStorage.getItem("tsc_lang");
  const initialLang = (qp.lang || saved || "en").toString().trim() || "en";

  applyLanguage(initialLang);
  buildLanguageSelector();

  // Prefill from query params (your URLs like ?q02=A&q03=A&q04=A&lang=en)
  if (qp.q02) setCheckedValue("Q2_time", qp.q02);
  if (qp.q03) setCheckedValue("Q3_time", qp.q03);
  if (qp.q04) setCheckedValue("Q4_day", qp.q04);

  // Ensure hidden language field exists/updated
  if (document.getElementById("language") || qs('input[name="language"]')) {
    setTextValue("language", currentLang);
  }

  // Hook form submit
  const form = document.getElementById("surveyForm");
  if (!form) {
    console.warn('surveyForm not found. Ensure <form id="surveyForm"> exists.');
    return;
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();

    setError("form-error", "");
    setError("form-success", "");
    const resultBox = document.getElementById("result");
    if (resultBox) resultBox.style.display = "none";

    // Gather payload
    const payload = {
      timestamp: new Date().toISOString(),
      language: currentLang,
      player_name: getTextValue("player_name"),
      Q2_time: getCheckedValue("Q2_time"),
      Q3_time: getCheckedValue("Q3_time"),
      Q4_day: getCheckedValue("Q4_day"),
    };

    // Validate
    const missing = validatePayload(payload);
    if (missing.length) {
      setError("form-error", `Please fill in required fields: ${missing.join(", ")}`);
      return;
    }

    // Lock UI
    setFormDisabled(true);
    setSubmitEnabled(false);

    try {
      const data = await submitSurvey(payload);

      // show success
      setError("form-success", data.message || "Submitted.");
      const resultBox2 = document.getElementById("result");
      if (resultBox2) resultBox2.style.display = "block";

      scrollToBottomSmooth();
      form.reset();

      // keep language after reset
      applyLanguage(currentLang);
      setCheckedValue("Q2_time", "");
      setCheckedValue("Q3_time", "");
      setCheckedValue("Q4_day", "");
    } catch (err) {
      console.error("Submit failed:", err);
      setError("form-error", err && err.message ? err.message : "Network error. Please try again.");
    } finally {
      setFormDisabled(false);
      setSubmitEnabled(true);
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
