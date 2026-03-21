#!/usr/bin/env node

import { readFileSync } from "fs";
import { resolve } from "path";

// --- CLI argument parsing ---
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return defaultVal;
}

const type = getArg("type", "all");
const siteUrlOverride = getArg("siteUrl", null);

// --- Load .env file if present (searches cwd and parent dirs) ---
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
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
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

// --- Load ~/.zshrc as fallback (only sets vars not already in env) ---
function loadZshrc() {
  try {
    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home) return;
    const lines = readFileSync(resolve(home, ".zshrc"), "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const key = match[1];
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch { /* .zshrc not found or not readable — ignore */ }
}
loadZshrc();

// --- Credentials from environment variables (required) ---
const client_id = process.env.GSC_CLIENT_ID;
const client_secret = process.env.GSC_CLIENT_SECRET;
const refresh_token = process.env.GSC_REFRESH_TOKEN;
const envSiteUrl = process.env.GSC_SITE_URL;

// --- Optional config file for siteUrl and defaults ---
function loadConfigFile() {
  let dir = process.cwd();
  while (true) {
    try {
      const configPath = resolve(dir, ".gsc-config.json");
      const raw = readFileSync(configPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      const parent = resolve(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

const fileConfig = loadConfigFile();

// --- Validate required credentials ---
const missingEnvVars = [
  !client_id && "GSC_CLIENT_ID",
  !client_secret && "GSC_CLIENT_SECRET",
  !refresh_token && "GSC_REFRESH_TOKEN",
].filter(Boolean);

if (missingEnvVars.length > 0) {
  console.log(JSON.stringify({
    error: "CREDENTIALS_MISSING",
    message: `Missing required environment variable(s): ${missingEnvVars.join(", ")}. Set them in your shell profile or .env file.`,
    missingEnvVars,
  }));
  process.exit(1);
}

// siteUrl: env var > CLI arg > config file
const siteUrl = siteUrlOverride || envSiteUrl || (fileConfig && fileConfig.siteUrl);

if (!siteUrl) {
  console.log(JSON.stringify({
    error: "SITE_URL_MISSING",
    message: "No site URL found. Set GSC_SITE_URL env var, pass --siteUrl, or add siteUrl to .gsc-config.json. Use sc-domain:yourdomain.com for Domain properties or https://yourdomain.com/ for URL-prefix properties.",
  }));
  process.exit(1);
}

// --- Apply config defaults, CLI args override ---
const configDefaults = (fileConfig && fileConfig.defaults) || {};
const range = getArg("range", configDefaults.range || "28d");
const limit = parseInt(getArg("limit", String(configDefaults.limit || 25)), 10);

// --- Date range calculation ---
function getDateRange(rangeStr) {
  // Custom range: YYYY-MM-DD,YYYY-MM-DD
  if (rangeStr.includes(",")) {
    const [startDate, endDate] = rangeStr.split(",");
    return { startDate, endDate };
  }

  const now = new Date();
  // GSC data has ~3 day lag
  const end = new Date(now);
  end.setDate(end.getDate() - 3);

  const start = new Date(end);
  switch (rangeStr) {
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "28d":
      start.setDate(start.getDate() - 28);
      break;
    case "3m":
      start.setMonth(start.getMonth() - 3);
      break;
    case "6m":
      start.setMonth(start.getMonth() - 6);
      break;
    case "12m":
      start.setFullYear(start.getFullYear() - 1);
      break;
    default:
      start.setDate(start.getDate() - 28);
  }

  const fmt = (d) => d.toISOString().split("T")[0];
  return { startDate: fmt(start), endDate: fmt(end) };
}

const dateRange = getDateRange(range);

// --- OAuth2 token refresh ---
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
  return data.access_token;
}

// --- GSC API calls ---
async function queryGSC(accessToken, dimension, rowLimit) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

  const body = {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    dimensions: [dimension],
    rowLimit,
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`GSC API error (${resp.status}): ${errBody}`);
  }

  const data = await resp.json();
  return (data.rows || []).map((row) => ({
    keys: row.keys,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 10000) / 10000,
    position: Math.round(row.position * 10) / 10,
  }));
}

async function querySummary(accessToken) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

  const body = {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`GSC API error (${resp.status}): ${errBody}`);
  }

  const data = await resp.json();
  if (!data.rows || data.rows.length === 0) {
    return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  }

  const row = data.rows[0];
  return {
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 10000) / 10000,
    position: Math.round(row.position * 10) / 10,
  };
}

// --- Sanitize errors (strip credential values) ---
function sanitizeError(message) {
  let sanitized = message;
  if (client_secret) sanitized = sanitized.replaceAll(client_secret, "[REDACTED]");
  if (refresh_token) sanitized = sanitized.replaceAll(refresh_token, "[REDACTED]");
  if (client_id) sanitized = sanitized.replaceAll(client_id, "[REDACTED]");
  return sanitized;
}

// --- Main ---
async function main() {
  let accessToken;
  try {
    accessToken = await refreshAccessToken();
  } catch (err) {
    console.log(JSON.stringify({ error: "TOKEN_REFRESH_FAILED", message: sanitizeError(err.message) }));
    process.exit(1);
  }

  const result = {
    metadata: {
      siteUrl,
      dateRange,
      range,
      fetchedAt: new Date().toISOString(),
    },
  };

  try {
    if (type === "summary" || type === "all") {
      result.summary = await querySummary(accessToken);
    }

    if (type === "query" || type === "all") {
      result.topQueries = await queryGSC(accessToken, "query", limit);
    }

    if (type === "page" || type === "all") {
      result.topPages = await queryGSC(accessToken, "page", limit);
    }
  } catch (err) {
    console.log(JSON.stringify({ error: "GSC_API_ERROR", message: sanitizeError(err.message) }));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
