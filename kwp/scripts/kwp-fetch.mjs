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

// --- Credentials from environment variables ---
const client_id = process.env.GSC_CLIENT_ID;
const client_secret = process.env.GSC_CLIENT_SECRET;
const refresh_token = process.env.GSC_REFRESH_TOKEN;
const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
const rawCustomerId = process.env.GOOGLE_ADS_CUSTOMER_ID;

// Validate credentials
const missingEnvVars = [
  !client_id && "GSC_CLIENT_ID",
  !client_secret && "GSC_CLIENT_SECRET",
  !refresh_token && "GSC_REFRESH_TOKEN",
  !developerToken && "GOOGLE_ADS_DEVELOPER_TOKEN",
  !rawCustomerId && "GOOGLE_ADS_CUSTOMER_ID",
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

// Normalize customer ID: strip dashes (123-456-7890 → 1234567890)
const customerId = rawCustomerId.replace(/-/g, "");

// --- Parse input mode ---
// --seeds "keyword1,keyword2"
// --url "https://example.com"
// --topic "email marketing"
const seedsRaw = getArg("seeds");
const urlInput = getArg("url");
const topicInput = getArg("topic");

if (!seedsRaw && !urlInput && !topicInput) {
  console.log(
    JSON.stringify({
      error: "NO_INPUT",
      message:
        "Provide at least one of: --seeds 'kw1,kw2', --url 'https://example.com', --topic 'your topic'",
    })
  );
  process.exit(1);
}

// --- Language and geo constants ---
// Google Ads language resource names
const LANGUAGE_MAP = {
  en: "languageConstants/1000",
  de: "languageConstants/1001",
  fr: "languageConstants/1002",
  es: "languageConstants/1003",
  pt: "languageConstants/1004",
  it: "languageConstants/1005",
  ja: "languageConstants/1009",
  ko: "languageConstants/1012",
  zh: "languageConstants/1017",
  he: "languageConstants/1027",
  ar: "languageConstants/1019",
  ru: "languageConstants/1049",
  nl: "languageConstants/1010",
  pl: "languageConstants/1030",
};

// Google Ads geo target constants (country-level)
const GEO_MAP = {
  US: "geoTargetConstants/2840",
  GB: "geoTargetConstants/2826",
  CA: "geoTargetConstants/2124",
  AU: "geoTargetConstants/2036",
  DE: "geoTargetConstants/2276",
  FR: "geoTargetConstants/2250",
  ES: "geoTargetConstants/2724",
  IT: "geoTargetConstants/2380",
  BR: "geoTargetConstants/2076",
  IN: "geoTargetConstants/2356",
  JP: "geoTargetConstants/2392",
  IL: "geoTargetConstants/2376",
  NL: "geoTargetConstants/2528",
  PL: "geoTargetConstants/2616",
};

const langCode = getArg("lang", "en");
const countryCode = getArg("country", "US").toUpperCase();
const limit = parseInt(getArg("limit", "50"), 10);

const languageResource = LANGUAGE_MAP[langCode.toLowerCase()] || `languageConstants/1000`;
const geoResource = GEO_MAP[countryCode] || `geoTargetConstants/2840`;

// --- Sanitize errors (strip credentials) ---
function sanitizeError(message) {
  let s = message;
  if (client_secret) s = s.replaceAll(client_secret, "[REDACTED]");
  if (refresh_token) s = s.replaceAll(refresh_token, "[REDACTED]");
  if (client_id) s = s.replaceAll(client_id, "[REDACTED]");
  if (developerToken) s = s.replaceAll(developerToken, "[REDACTED]");
  return s;
}

// --- OAuth2 token refresh (adwords scope) ---
async function refreshAccessToken() {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id,
      client_secret,
      refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token refresh failed (${resp.status}): ${body}`);
  }

  const data = await resp.json();
  if (!data.access_token) {
    throw new Error(`No access_token in token response: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

// --- Build request body ---
function buildRequestBody() {
  const body = {
    language: languageResource,
    geoTargetConstants: [geoResource],
    includeAdultKeywords: false,
    keywordPlanNetwork: "GOOGLE_SEARCH",
    pageSize: Math.min(limit, 1000),
  };

  // Build seed — combine all provided inputs
  const keywords = [];
  if (seedsRaw) {
    keywords.push(...seedsRaw.split(",").map((k) => k.trim()).filter(Boolean));
  }
  if (topicInput) {
    keywords.push(topicInput.trim());
  }

  if (urlInput && keywords.length > 0) {
    // Both URL and keywords provided
    body.keywordAndUrlSeed = { url: urlInput, keywords };
  } else if (urlInput) {
    // URL only — check if it's a domain or a full URL
    const isFullUrl = urlInput.includes("/") && urlInput.split("/").length > 3;
    if (isFullUrl) {
      body.urlSeed = { url: urlInput };
    } else {
      // Domain only — strip protocol if present
      const domain = urlInput.replace(/^https?:\/\//, "").replace(/\/$/, "");
      body.siteSeed = { site: domain };
    }
  } else if (keywords.length > 0) {
    body.keywordSeed = { keywords };
  }

  return body;
}

// --- Call Google Ads API ---
async function generateKeywordIdeas(accessToken) {
  const url = `https://googleads.googleapis.com/v17/customers/${customerId}:generateKeywordIdeas`;

  const requestBody = buildRequestBody();

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Google Ads API error (${resp.status}): ${errBody}`);
  }

  const data = await resp.json();
  return data.results || [];
}

// --- Parse competition level ---
function parseCompetition(value) {
  // API returns "LOW", "MEDIUM", "HIGH", or "UNSPECIFIED"
  if (!value || value === "UNSPECIFIED" || value === "UNKNOWN") return "UNKNOWN";
  return value;
}

// --- Main ---
async function main() {
  let accessToken;
  try {
    accessToken = await refreshAccessToken();
  } catch (err) {
    const msg = sanitizeError(err.message);
    if (msg.includes("401") || msg.includes("403") || msg.includes("invalid_grant")) {
      console.log(
        JSON.stringify({
          error: "TOKEN_REFRESH_FAILED",
          message: `OAuth token refresh failed. Check your credentials or regenerate your refresh token with the adwords scope. Details: ${msg}`,
        })
      );
    } else {
      console.log(
        JSON.stringify({ error: "TOKEN_REFRESH_FAILED", message: msg })
      );
    }
    process.exit(1);
  }

  let rawResults;
  try {
    rawResults = await generateKeywordIdeas(accessToken);
  } catch (err) {
    const msg = sanitizeError(err.message);
    let errorCode = "ADS_API_ERROR";
    if (msg.includes("403")) errorCode = "PERMISSION_DENIED";
    if (msg.includes("400")) errorCode = "INVALID_REQUEST";
    console.log(JSON.stringify({ error: errorCode, message: msg }));
    process.exit(1);
  }

  // Transform results
  const keywords = rawResults
    .filter((r) => r.keywordIdeaMetrics)
    .map((r) => {
      const m = r.keywordIdeaMetrics;
      const avgMonthly = parseInt(m.avgMonthlySearches || "0", 10);
      const competitionIndex = parseInt(m.competitionIndex || "0", 10);
      const lowBidMicros = parseInt(m.lowTopOfPageBidMicros || "0", 10);
      const highBidMicros = parseInt(m.highTopOfPageBidMicros || "0", 10);

      return {
        keyword: r.text,
        avgMonthlySearches: avgMonthly,
        competition: parseCompetition(m.competition),
        competitionIndex,
        lowTopOfPageBid: lowBidMicros > 0 ? Math.round(lowBidMicros / 10000) / 100 : null,
        highTopOfPageBid: highBidMicros > 0 ? Math.round(highBidMicros / 10000) / 100 : null,
      };
    })
    // Filter out very low volume unless --all flag
    .filter((k) => hasFlag("all") || k.avgMonthlySearches >= 100)
    // Sort by volume descending
    .sort((a, b) => b.avgMonthlySearches - a.avgMonthlySearches);

  const output = {
    metadata: {
      seeds: seedsRaw ? seedsRaw.split(",").map((k) => k.trim()) : [],
      url: urlInput || null,
      topic: topicInput || null,
      language: langCode,
      country: countryCode,
      limit,
      totalResults: rawResults.length,
      filteredResults: keywords.length,
      fetchedAt: new Date().toISOString(),
    },
    keywords,
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
