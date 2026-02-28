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

// --- Load config ---
function loadConfig() {
  // Walk up from cwd to find .gsc-config.json
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

const config = loadConfig();

if (!config) {
  console.log(JSON.stringify({ error: "CONFIG_NOT_FOUND", message: ".gsc-config.json not found in project root or any parent directory." }));
  process.exit(1);
}

// --- Validate required fields individually ---
const requiredFields = [
  { key: "siteUrl", label: "siteUrl", hint: "The GSC property URL. Use sc-domain:yourdomain.com for Domain properties or https://yourdomain.com/ for URL-prefix properties." },
  { key: "client_id", label: "client_id", hint: "OAuth2 Client ID from Google Cloud Console (APIs & Services > Credentials)." },
  { key: "client_secret", label: "client_secret", hint: "OAuth2 Client Secret from Google Cloud Console (APIs & Services > Credentials)." },
  { key: "refresh_token", label: "refresh_token", hint: "Refresh token obtained via https://developers.google.com/oauthplayground/ using the Search Console API v3 scope." },
];

const missingFields = requiredFields.filter((f) => !siteUrlOverride || f.key !== "siteUrl").filter((f) => !config[f.key]);

if (missingFields.length > 0) {
  const details = missingFields.map((f) => `  - ${f.label}: ${f.hint}`).join("\n");
  console.log(JSON.stringify({
    error: "CONFIG_INCOMPLETE",
    message: `Missing required field(s) in .gsc-config.json:\n${details}`,
    missingFields: missingFields.map((f) => f.key),
  }));
  process.exit(1);
}

const { client_id, client_secret, refresh_token } = config;
const siteUrl = siteUrlOverride || config.siteUrl;

// --- Check .gitignore ---
function checkGitignore() {
  let dir = process.cwd();
  while (true) {
    try {
      const gitignorePath = resolve(dir, ".gitignore");
      const content = readFileSync(gitignorePath, "utf-8");
      if (!content.includes(".gsc-config.json")) {
        console.error("WARNING: .gsc-config.json is not in your .gitignore. This file contains credentials and should never be committed. Add .gsc-config.json to your .gitignore file.");
      }
      return;
    } catch {
      const parent = resolve(dir, "..");
      if (parent === dir) return; // no .gitignore found, skip check
      dir = parent;
    }
  }
}

checkGitignore();

// --- Apply config defaults, CLI args override ---
const configDefaults = config.defaults || {};
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

// --- Main ---
async function main() {
  let accessToken;
  try {
    accessToken = await refreshAccessToken();
  } catch (err) {
    console.log(JSON.stringify({ error: "TOKEN_REFRESH_FAILED", message: err.message }));
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
    console.log(JSON.stringify({ error: "GSC_API_ERROR", message: err.message }));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
