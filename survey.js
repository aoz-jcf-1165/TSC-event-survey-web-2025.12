// =====================
// survey.js (FULL REPLACE / original-compatible)
// =====================

// ★ 正しいハイフン版（確定）
const API_URL = "https://tsc-event-survey-web-2025-12.pages.dev/api/submit";

// ==== 多言語翻訳設定 ====
const TRANSLATION_FILE = "translations.tsv";

// ===== CDN PDF link =====
const CDN_PDF_URL =
  "https://cdn.jsdelivr.net/gh/aoz-jcf-1165/TSC-event-survey-web-2025.12@main/share_document/TSC-event-survey-2025-12.pdf";

const LANGUAGE_LABELS = {
  "en": "English",
  "de": "Deutsch",
  "nl": "Nederlands",
  "fr": "Français",
  "ru": "Русский",
  "es": "Español",
  "pt": "Português",
  "it": "Italiano",
  "zh-Hans": "简体中文",
  "ja": "日本語",
  "ko": "한국어",
  "zh-Hant": "繁體中文",
  "ar": "العربية",
  "th": "ไทย",
  "vi": "Tiếng Việt",
  "tr": "Türkçe",
  "pl": "Polski",
  "ms": "Bahasa Melayu",
  "id": "Bahasa Indonesia"
};

let translations = {};
let availableLangs = [];

// 言語は localStorage 優先（無ければ en）
let currentLang = (localStorage.getItem("tsc_lang") || "en").trim() || "en";

// 翻訳ロード完了フラグ（ただし「未完了でも送信可能」に変更）
let isAppReady = false;

function parseTSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
  if (lines.length < 2) return;

  const headerCols = lines[0].split("\t");
  const langs = headerCols.slice(1);
  availableLangs = langs;

  const data = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const key = cols[0];
    if (!key) continue;
    data[key] = {};
    langs.forEach((lang, idx) => {
      data[key][lang] = cols[idx + 1] || "";
    });
  }
  translations = data;
}

function t(key) {
  const entry = translations[key];
  if (!entry) return null;
  return entry[currentLang] || entry["en"] || null;
}

function applyLanguage(lang) {
  currentLang = (lang || "en").toString().trim() || "en";
  localStorage.setItem("tsc_lang", currentLang);

  document.documentElement.lang = currentLang;
  document.documentElement.dir = (currentLang === "ar") ? "rtl" : "ltr";

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    const translated = t(key);
    if (translated != null) el.textContent = translated;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    const translated = t(key);
    if (translated != null) el.placeholder = translated;
  });
}

function populateLanguageSelect() {
  const select = document.getElementById("languageSelect");
  if (!select) return;

  select.innerHTML = "";
  const ordered = ["en", ...availableLangs.filter(l => l !== "en")];

  if (!availableLangs.includes(currentLang)) currentLang = "en";

  ordered.forEach(code => {
    if (!availableLangs.includes(code)) return;
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = LANGUAGE_LABELS[code] || code;
    if (code === currentLang) opt.selected = true;
    select.appendChild(opt);
  });

  // 既存の change ハンドラを重複登録しない
  select.onchange = () => applyLanguage(select.value);
}

function wireCdnLink() {
  const a = document.getElementById("cdnPdfLink");
  if (a) a.href = CDN_PDF_URL;
}

function setSubmitEnabled(enabled
