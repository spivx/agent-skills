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

const urlsArg = getArg("urls", null);
const fileArg = getArg("file", null);
const action = getArg("action", "URL_UPDATED");
const checkOnly = args.includes("--check");
const skipPrevious = args.includes("--force");

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

// --- Credentials from environment variables (required) ---
const client_id = process.env.GSC_CLIENT_ID;
const client_secret = process.env.GSC_CLIENT_SECRET;
const refresh_token = process.env.GSC_REFRESH_TOKEN;

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

// --- Validate action ---
const validActions = ["URL_UPDATED", "URL_DELETED"];
if (!validActions.includes(action)) {
  console.log(JSON.stringify({
    error: "INVALID_ACTION",
    message: `Invalid action "${action}". Must be one of: ${validActions.join(", ")}`,
  }));
  process.exit(1);
}

// --- Collect URLs ---
let urls = [];

if (urlsArg) {
  urls = urlsArg.split(",").map(u => u.trim()).filter(Boolean);
}

if (fileArg) {
  try {
    const filePath = resolve(fileArg);
    const content = readFileSync(filePath, "utf-8");
    const ext = filePath.toLowerCase();

    if (ext.endsWith(".xml")) {
      // Basic sitemap XML parsing — extract <loc> values
      const locMatches = content.match(/<loc>(.*?)<\/loc>/gi) || [];
      const sitemapUrls = locMatches.map(m => m.replace(/<\/?loc>/gi, "").trim());
      urls = urls.concat(sitemapUrls);
    } else {
      // Plain text or CSV: one URL per line (first column if CSV)
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const fileUrls = lines
        .filter(l => !l.startsWith("#")) // skip comments
        .map(l => l.split(",")[0].trim()) // first column if CSV
        .filter(l => l.startsWith("http://") || l.startsWith("https://"));
      urls = urls.concat(fileUrls);
    }
  } catch (err) {
    console.log(JSON.stringify({
      error: "FILE_READ_ERROR",
      message: `Failed to read file "${fileArg}": ${err.message}`,
    }));
    process.exit(1);
  }
}

// Deduplicate
urls = [...new Set(urls)];

if (urls.length === 0) {
  console.log(JSON.stringify({
    error: "NO_URLS",
    message: "No URLs provided. Use --urls (comma-separated) or --file (path to .txt, .csv, or sitemap .xml).",
  }));
  process.exit(1);
}

// --- Validate URL format ---
const invalidUrls = urls.filter(u => {
  try {
    const parsed = new URL(u);
    return !["http:", "https:"].includes(parsed.protocol);
  } catch {
    return true;
  }
});

if (invalidUrls.length > 0) {
  console.log(JSON.stringify({
    error: "INVALID_URLS",
    message: `Invalid URL(s) found: ${invalidUrls.join(", ")}. All URLs must be fully qualified (https://...).`,
    invalidUrls,
  }));
  process.exit(1);
}

// --- OAuth2 token refresh (with indexing scope) ---
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

// --- Indexing API: check notification status ---
async function checkUrlStatus(accessToken, url) {
  const endpoint = `https://indexing.googleapis.com/v3/urlNotifications/metadata?url=${encodeURIComponent(url)}`;
  const resp = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (resp.status === 404) {
    return { url, previouslySubmitted: false };
  }

  if (!resp.ok) {
    let body;
    try { body = await resp.json(); } catch { body = await resp.text(); }
    return { url, previouslySubmitted: null, checkError: true, status: resp.status, response: body };
  }

  const data = await resp.json();
  return {
    url,
    previouslySubmitted: true,
    latestUpdate: data.latestUpdate || null,
    latestRemove: data.latestRemove || null,
  };
}

// --- Indexing API submission ---
async function submitUrl(accessToken, url, notificationType) {
  const resp = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, type: notificationType }),
  });

  const status = resp.status;
  let body;
  try {
    body = await resp.json();
  } catch {
    body = await resp.text();
  }

  return { url, status, success: resp.ok, response: body };
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
    console.log(JSON.stringify({
      error: "TOKEN_REFRESH_FAILED",
      message: sanitizeError(err.message),
    }));
    process.exit(1);
  }

  // --- Check mode: only report notification status, don't submit ---
  if (checkOnly) {
    const statuses = [];
    for (const url of urls) {
      try {
        statuses.push(await checkUrlStatus(accessToken, url));
      } catch (err) {
        statuses.push({ url, previouslySubmitted: null, checkError: true, response: { error: sanitizeError(err.message) } });
      }
    }

    const alreadySubmitted = statuses.filter(s => s.previouslySubmitted === true).length;
    const neverSubmitted = statuses.filter(s => s.previouslySubmitted === false).length;
    const checkErrors = statuses.filter(s => s.checkError).length;

    console.log(JSON.stringify({
      metadata: {
        mode: "check",
        totalUrls: urls.length,
        alreadySubmitted,
        neverSubmitted,
        checkErrors,
        checkedAt: new Date().toISOString(),
      },
      statuses,
    }, null, 2));
    return;
  }

  // --- Submit mode: optionally pre-check, then submit ---
  const results = [];
  for (const url of urls) {
    try {
      // Pre-check unless --force is passed
      let priorStatus = null;
      if (!skipPrevious) {
        try {
          priorStatus = await checkUrlStatus(accessToken, url);
        } catch {
          // If check fails, proceed with submission anyway
        }
      }

      const result = await submitUrl(accessToken, url, action);
      result.priorStatus = priorStatus;
      results.push(result);
    } catch (err) {
      results.push({
        url,
        status: 0,
        success: false,
        priorStatus: null,
        response: { error: sanitizeError(err.message) },
      });
    }
  }

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const resubmissions = results.filter(r => r.priorStatus && r.priorStatus.previouslySubmitted).length;

  console.log(JSON.stringify({
    metadata: {
      action,
      totalUrls: urls.length,
      succeeded,
      failed,
      resubmissions,
      submittedAt: new Date().toISOString(),
    },
    results,
  }, null, 2));
}

main();
