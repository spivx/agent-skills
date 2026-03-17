#!/usr/bin/env node

import { readFileSync } from "fs";
import { resolve } from "path";

// --- CLI argument parsing ---
const args = process.argv.slice(2);

function getArg(name, defaultVal = null) {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return defaultVal;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

// --- Load .env file (searches cwd and parent dirs) ---
function loadDotEnv() {
  let dir = process.cwd();
  while (true) {
    try {
      const envPath = resolve(dir, ".env");
      const lines = readFileSync(envPath, "utf-8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = val;
      }
      break;
    } catch {
      const parent = resolve(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  }
}
loadDotEnv();

// --- Credentials ---
const login = process.env.DATAFORSEO_LOGIN;
const password = process.env.DATAFORSEO_PASSWORD;

const missingEnvVars = [
  !login && "DATAFORSEO_LOGIN",
  !password && "DATAFORSEO_PASSWORD",
].filter(Boolean);

if (missingEnvVars.length > 0) {
  console.log(
    JSON.stringify({
      error: "CREDENTIALS_MISSING",
      message: `Missing required environment variable(s): ${missingEnvVars.join(", ")}.`,
      missingEnvVars,
    })
  );
  process.exit(1);
}

const authHeader =
  "Basic " + Buffer.from(`${login}:${password}`).toString("base64");

// --- Input mode ---
const seedsRaw = getArg("seeds");
const topicInput = getArg("topic");

// Auto-detect site URL from common env vars if --url not provided
const SITE_URL_VARS = [
  "SITE_URL",
  "APP_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NUXT_PUBLIC_SITE_URL",
  "URL",
  "VERCEL_URL",
  "BASE_URL",
  "WEBSITE_URL",
  "PUBLIC_URL",
];
function detectSiteUrl() {
  for (const key of SITE_URL_VARS) {
    const val = process.env[key];
    if (val && val.startsWith("http")) return val;
  }
  return null;
}

const urlInput = getArg("url") || (!seedsRaw && !topicInput ? detectSiteUrl() : null);

if (!seedsRaw && !urlInput && !topicInput) {
  console.log(
    JSON.stringify({
      error: "NO_INPUT",
      message:
        "Provide at least one of: --seeds 'kw1,kw2', --url 'https://example.com', --topic 'your topic'. " +
        "Or set a site URL env var (SITE_URL, APP_URL, NEXT_PUBLIC_SITE_URL, etc.) to auto-detect from your project.",
    })
  );
  process.exit(1);
}

// --- Location and language maps ---
const LOCATION_MAP = {
  US: 2840,
  GB: 2826,
  CA: 2124,
  AU: 2036,
  DE: 2276,
  FR: 2250,
  ES: 2724,
  IT: 2380,
  BR: 2076,
  IN: 2356,
  JP: 2392,
  IL: 2376,
  NL: 2528,
  PL: 2616,
};

const langCode = getArg("lang", "en");
const countryCode = getArg("country", "US").toUpperCase();
const limit = parseInt(getArg("limit", "50"), 10);
const locationCode = LOCATION_MAP[countryCode] || 2840;

const BASE_URL = "https://api.dataforseo.com/v3/dataforseo_labs/google";

// --- API helper ---
async function apiPost(endpoint, body) {
  const resp = await fetch(`${BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`DataForSEO API error (${resp.status}): ${text}`);
  }
  return resp.json();
}

// --- Parse keyword items from live response ---
function parseItems(data) {
  const items = [];
  for (const task of data.tasks || []) {
    for (const r of task.result || []) {
      items.push(...(r.items || []));
    }
  }
  return items;
}

// --- Map DataForSEO Labs fields to kwp output format ---
function mapKeyword(item) {
  const info = item.keyword_info || {};
  const competitionFloat = info.competition ?? null;

  let competitionIndex = 0;
  if (competitionFloat != null) {
    // Labs returns competition as 0–1 float; multiply to get 0–100 index
    competitionIndex =
      competitionFloat > 1
        ? Math.round(competitionFloat) // already 0–100
        : Math.round(competitionFloat * 100);
  }

  const competitionLevel = info.competition_level || "UNKNOWN";

  return {
    keyword: item.keyword,
    avgMonthlySearches: info.search_volume || 0,
    competition: competitionLevel,
    competitionIndex,
    cpc: info.cpc ?? null,
  };
}

// --- Main ---
async function main() {
  const seeds = [];
  if (seedsRaw) seeds.push(...seedsRaw.split(",").map((k) => k.trim()).filter(Boolean));
  if (topicInput) seeds.push(topicInput.trim());

  let data;
  let endpoint;

  try {
    if (urlInput && seeds.length === 0) {
      // URL-only: use keywords_for_site/live
      endpoint = "keywords_for_site";
      const domain = urlInput
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "");
      data = await apiPost("keywords_for_site/live", [
        {
          target: domain,
          language_code: langCode,
          location_code: locationCode,
        },
      ]);
    } else {
      // Seeds / topic: use keyword_ideas/live
      endpoint = "keyword_ideas";
      data = await apiPost("keyword_ideas/live", [
        {
          keywords: seeds,
          language_code: langCode,
          location_code: locationCode,
        },
      ]);
    }
  } catch (err) {
    const msg = err.message;
    let errorCode = "API_ERROR";
    if (msg.includes("401") || msg.includes("403")) errorCode = "PERMISSION_DENIED";
    if (msg.includes("400")) errorCode = "INVALID_REQUEST";
    console.log(JSON.stringify({ error: errorCode, message: msg }));
    process.exit(1);
  }

  // Check for DataForSEO-level errors (can arrive with HTTP 200)
  const statusCode = data.tasks?.[0]?.status_code;
  if (statusCode && statusCode !== 20000) {
    const msg = data.tasks?.[0]?.status_message || "Unknown error";
    console.log(
      JSON.stringify({ error: "API_ERROR", statusCode, message: msg })
    );
    process.exit(1);
  }

  const rawItems = parseItems(data);
  const keywords = rawItems
    .map(mapKeyword)
    .filter((k) => hasFlag("all") || k.avgMonthlySearches >= 100)
    .sort((a, b) => b.avgMonthlySearches - a.avgMonthlySearches)
    .slice(0, limit);

  console.log(
    JSON.stringify(
      {
        metadata: {
          endpoint,
          language: langCode,
          country: countryCode,
          limit,
          totalResults: rawItems.length,
          filteredResults: keywords.length,
          fetchedAt: new Date().toISOString(),
        },
        keywords,
      },
      null,
      2
    )
  );
}

main();
