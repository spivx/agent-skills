---
name: gsc
description: >-
  Live Google Search Console analytics — fetches real SEO data (clicks,
  impressions, CTR, rankings) and delivers actionable insights with CTR
  benchmarking and opportunity detection. Zero dependencies. Use when the user
  asks about GSC, Google Search Console, SEO performance, search performance,
  keywords, rankings, organic traffic, top pages, top queries, "how is my site
  performing in Google", "check rankings", or "search console report".
metadata:
  version: "1.0.0"
  argument-hint: "[7d|28d|3m|6m|12m] [query|page|summary|all]"
---

# GSC

You are an expert SEO analyst. Fetch Google Search Console data and deliver actionable insights about a site's organic search performance.

## Why This Skill

- **Live API data** — Connects directly to the Google Search Console API and fetches real performance metrics. No manual data pasting, no CSV uploads.
- **Zero dependencies** — Pure Node.js script using built-in `fetch` and `fs`. No `npm install`, no Python, no MCP server to configure.
- **Built-in analysis engine** — Goes beyond raw numbers. Benchmarks CTR against industry standards, flags ranking opportunities, and delivers prioritized recommendations you can act on immediately.

## What You Get

When you run this skill, the AI fetches your live GSC data and delivers:

- **Executive summary** — Total clicks, impressions, average CTR and position with a health assessment against CTR benchmarks
- **Top queries breakdown** — Your best keywords categorized by performance tier, with brand vs non-brand separation
- **Top pages analysis** — Which pages drive traffic, which underperform, and where content gaps exist
- **Opportunity detection** — High-impression/low-CTR keywords ripe for title rewrites, page-2 rankings one push away from page 1
- **Actionable recommendations** — Prioritized by effort vs impact: quick wins first, then content improvements, then new content opportunities
- **Trend analysis** — Period-over-period comparison on request to track momentum

## Setup

This skill requires a one-time setup to connect to Google Search Console. If the config file is missing or incomplete, guide the user through these steps.

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **Search Console API**: go to APIs & Services > Library, search for "Google Search Console API", and enable it

### Step 2: Create OAuth2 Credentials

1. Go to APIs & Services > Credentials
2. Click **Create Credentials** > **OAuth client ID**
3. Application type: **Desktop app**
4. Note down the **Client ID** and **Client Secret**

### Step 3: Get a Refresh Token

1. Go to [Google OAuth Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (top right) and check **Use your own OAuth credentials**
3. Enter your Client ID and Client Secret from Step 2
4. In Step 1 of the playground, find **Search Console API v3** and select the scope: `https://www.googleapis.com/auth/webmasters.readonly`
5. Click **Authorize APIs** and grant access with the Google account that owns the Search Console property
6. In Step 2, click **Exchange authorization code for tokens**
7. Copy the **Refresh Token** from the response

### Step 4: Create the Config File

Create a file called `.gsc-config.json` **in the root of your repository** — the same directory where your `.git` folder or `package.json` lives. This file must be at the top level of your project, not inside any subdirectory.

```json
{
  "siteUrl": "https://yourdomain.com/",
  "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "client_secret": "YOUR_CLIENT_SECRET",
  "refresh_token": "YOUR_REFRESH_TOKEN",
  "defaults": {
    "range": "28d",
    "limit": 25
  }
}
```

**Config fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `siteUrl` | Yes | Your GSC property. Use `sc-domain:yourdomain.com` for Domain properties or `https://yourdomain.com/` for URL-prefix properties. |
| `client_id` | Yes | OAuth2 Client ID from Step 2 |
| `client_secret` | Yes | OAuth2 Client Secret from Step 2 |
| `refresh_token` | Yes | Refresh token from Step 3 |
| `defaults.range` | No | Default time range when no argument is passed. Options: `7d`, `28d`, `3m`, `6m`, `12m`. Default: `28d` |
| `defaults.limit` | No | Default max rows per dimension. Default: `25` |

### Step 5: Add to `.gitignore`

This file contains OAuth credentials. **You must add it to `.gitignore` before committing anything.** Open your `.gitignore` (or create one) and add:

```
.gsc-config.json
```

The script will warn you if this step is skipped.

**Note:** If your Google Cloud project is in **Testing** mode, refresh tokens expire after 7 days. To avoid this, publish the app to **Production** in the OAuth consent screen. For personal use, no Google verification is needed.

## How to Fetch Data

Run the helper script:

```bash
node <skill-path>/scripts/gsc-fetch.mjs [options]
```

Replace `<skill-path>` with the installed skill location (e.g., `.claude/skills/gsc` or `.agents/skills/gsc`).

### Options

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `--range` | `7d`, `28d`, `3m`, `6m`, `12m`, or `YYYY-MM-DD,YYYY-MM-DD` | `28d` (or config default) | Time range to query |
| `--type` | `query`, `page`, `summary`, `all` | `all` | Which data to fetch |
| `--limit` | number | `25` (or config default) | Max rows per dimension |
| `--siteUrl` | GSC property URL | from config | Override the site URL |

### Parsing Arguments from User Input

When the user triggers this skill with arguments like `/gsc 3m` or `/gsc 7d query`:
- First argument matching a range pattern (`7d`, `28d`, `3m`, `6m`, `12m`): use as `--range`
- Second argument matching a type (`query`, `page`, `summary`, `all`): use as `--type`
- If no arguments provided, use the defaults from config or the built-in defaults (28d, all)

### Example Commands

```bash
# Default: last 28 days, all data
node .claude/skills/gsc/scripts/gsc-fetch.mjs

# Last 3 months, top 50 queries only
node .claude/skills/gsc/scripts/gsc-fetch.mjs --range 3m --type query --limit 50

# Custom date range, pages only
node .claude/skills/gsc/scripts/gsc-fetch.mjs --range 2025-01-01,2025-01-31 --type page
```

## Output Format

The script outputs JSON to stdout:

```json
{
  "metadata": {
    "siteUrl": "https://yourdomain.com/",
    "dateRange": { "startDate": "2025-01-01", "endDate": "2025-01-28" },
    "range": "28d",
    "fetchedAt": "2025-01-31T12:00:00.000Z"
  },
  "summary": {
    "clicks": 320,
    "impressions": 8500,
    "ctr": 0.0376,
    "position": 12.4
  },
  "topQueries": [
    { "keys": ["keyword"], "clicks": 45, "impressions": 1200, "ctr": 0.0375, "position": 6.2 }
  ],
  "topPages": [
    { "keys": ["https://yourdomain.com/page"], "clicks": 30, "impressions": 900, "ctr": 0.0333, "position": 8.1 }
  ]
}
```

**Note:** `ctr` is a ratio between 0.0 and 1.0, **not** a percentage. Multiply by 100 when displaying to the user (e.g., `0.0376` → `3.76%`).

## Error Handling

If the script outputs an error JSON, diagnose and guide the user. The error response includes a `missingFields` array when applicable so you can tell the user exactly what needs to be fixed.

| Error Code | Meaning | Resolution |
|------------|---------|------------|
| `CONFIG_NOT_FOUND` | `.gsc-config.json` doesn't exist | Automatically create the config file using the template below, then guide the user through Setup to fill in real values. |
| `CONFIG_INCOMPLETE` | One or more required fields are missing | The error lists each missing field with a hint. Tell the user exactly which fields to add and where to get the values (refer to the relevant Setup step). |
| `TOKEN_REFRESH_FAILED` (401/403) | OAuth credentials are invalid or the refresh token has expired | Ask the user to regenerate the refresh token (Step 3). If using Testing mode, tokens expire after 7 days — suggest publishing to Production. |
| `GSC_API_ERROR` (403) | The Google account doesn't have access to this Search Console property | Verify the account used in Step 3 is the same one that owns/has access to the property in GSC. |
| `GSC_API_ERROR` (400) | `siteUrl` format is wrong | Try `sc-domain:domain.com` for Domain properties or `https://domain.com/` (with trailing slash) for URL-prefix properties. |

The script also prints a **warning to stderr** if `.gsc-config.json` is not listed in the project's `.gitignore`. If you see this warning, immediately add `.gsc-config.json` to the user's `.gitignore` file to prevent credentials from being committed.

## Automated First-Run Setup

When this skill is triggered and `.gsc-config.json` does not exist (or `CONFIG_NOT_FOUND` error is returned), **automatically perform these steps**:

### 1. Create the Config File

Create `.gsc-config.json` in the user's project root with this template:

```json
{
  "siteUrl": "https://yourdomain.com/",
  "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "client_secret": "YOUR_CLIENT_SECRET",
  "refresh_token": "YOUR_REFRESH_TOKEN",
  "defaults": {
    "range": "28d",
    "limit": 25
  }
}
```

### 2. Add to .gitignore

Check if `.gitignore` exists in the project root:
- If it exists, append `.gsc-config.json` and `gsc-report.html` to it (unless already present)
- If it doesn't exist, create `.gitignore` with:

```
# GSC credentials - contains OAuth secrets
.gsc-config.json

# GSC generated report
gsc-report.html
```

### 3. Guide the User

After creating both files, inform the user:
1. The config file has been created with placeholder values
2. Walk them through the Setup section above to obtain their OAuth credentials
3. Remind them to replace the placeholder values before running the skill

## Analysis Framework

Interpret the data — don't just restate numbers. Compare against benchmarks and surface what matters.

### CTR Benchmarks

| Position | Expected CTR |
|----------|-------------|
| 1 | 25-35% |
| 2 | 12-18% |
| 3 | 8-12% |
| 4-5 | 5-8% |
| 6-10 | 2-5% |
| 11+ | <2% |

Flag queries significantly above (learn from them) or below (needs optimization) these ranges.

### Analysis Structure

1. **Executive Summary** — Total clicks, impressions, avg CTR (as %), avg position. Assess health against the CTR benchmarks above. Note whether the site is growing, stable, or declining.
2. **Top Queries** — Categorize by actionability: high-impression/low-click (optimization candidates), position 4-10 (highest priority — small gains = big traffic), position 11-20 (page-1 push candidates), 20+ (low priority unless high volume). Separate brand vs non-brand.
3. **Top Pages** — Best performers (why they work), underperformers (high impressions, low CTR — rewrite titles/descriptions), poorly ranking despite dedicated pages (content improvement needed), content gaps (important topics with no page in results).
4. **Recommendations** — Prioritize by effort vs impact: quick wins (title/meta rewrites), content improvements (pages ranking 5-15), new content opportunities (queries with no dedicated page), technical anomalies (zero clicks at good positions).
5. **Period Comparison** (on request) — Run the script twice with different `--range` values. Compare clicks/impressions change, position movement per query, new vs dropped queries.

## RTL Text Handling (Hebrew, Arabic, etc.)

Terminals cannot render Right-to-Left text (Hebrew, Arabic, Farsi, etc.) correctly — characters appear reversed/inverted, and no combination of Unicode control characters or formatting tricks can reliably fix this through an LLM's text output.

**When any query or page URL in the JSON data contains RTL characters (Hebrew `\u0590-\u05FF`, Arabic `\u0600-\u06FF`, etc.), you MUST write the full analysis to an HTML file instead of rendering it in the terminal.**

### How to detect RTL

Check every string in `topQueries[].keys[]` and `topPages[].keys[]`. If ANY string contains characters in the Hebrew, Arabic, or Farsi Unicode ranges, the site has RTL content and you must use the HTML report flow.

### HTML report flow

1. **Write the full analysis to `gsc-report.html` in the project root.** Use the HTML structure below. This file contains the complete analysis — executive summary, queries, pages, and recommendations — with proper RTL rendering.
2. **Add `gsc-report.html` to `.gitignore`** (unless already present). This is a generated file and should not be committed.
3. **Auto-open the report in the browser.** After writing the HTML file, run the platform-appropriate open command:
   - **macOS** (`darwin`): `open gsc-report.html`
   - **Linux**: `xdg-open gsc-report.html`
   - **Windows**: `start gsc-report.html`
   Detect the platform from the system environment and use the correct command. This opens the report instantly in the user's default browser — no manual navigation needed.
4. **In the terminal, print only a short summary** (total clicks, impressions, avg CTR, avg position) followed by: `Full report written to gsc-report.html — opened in your default browser.`
5. **Do NOT attempt to render RTL query text in the terminal.** Not in tables, not in lists, not on standalone lines. The terminal summary should only contain LTR text (numbers, English labels).

### HTML structure

```html
<!DOCTYPE html>
<html lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GSC Report — SITE_NAME</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; line-height: 1.6; }
    h1 { font-size: 1.5rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; }
    h2 { font-size: 1.2rem; margin-top: 2rem; color: #374151; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { padding: 0.5rem 0.75rem; border: 1px solid #e5e7eb; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
    .rtl { direction: rtl; text-align: right; unicode-bidi: bidi-override; }
    .metric { font-variant-numeric: tabular-nums; }
    .priority-high { color: #059669; font-weight: 600; }
    .priority-medium { color: #d97706; }
    .priority-low { color: #6b7280; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin: 1rem 0; }
    .summary-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; text-align: center; }
    .summary-card .value { font-size: 1.5rem; font-weight: 700; }
    .summary-card .label { font-size: 0.85rem; color: #6b7280; }
    .note { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 0.75rem 1rem; margin: 1rem 0; font-size: 0.9rem; }
  </style>
</head>
<body>
  <!-- CONTENT GOES HERE -->
</body>
</html>
```

**Key rules for the HTML content:**
- Set `<html lang="he">` for Hebrew sites, `lang="ar"` for Arabic sites.
- Apply the `rtl` class to every `<td>` or element that contains RTL query text.
- Use standard `<table>` elements — tables render perfectly in browsers with proper `dir`/`class` attributes.
- Metrics cells (clicks, impressions, CTR, position) stay LTR — do NOT add the `rtl` class to them.
- Include the analysis commentary (priority labels, benchmark comparisons, recommendations) as normal LTR paragraphs.
- The `<title>` should include the site domain and date range.

### Mixed LTR + RTL sites

If the site has both LTR and RTL queries, still write the HTML report (for the RTL queries). In the terminal summary, you may include LTR queries in standard markdown tables as usual — only RTL text is banned from terminal output.

## Important Notes

- CTR and position values are **averages** across the entire period, not point-in-time snapshots.
- GSC data has a 2-3 day lag. The script accounts for this automatically by excluding the most recent 3 days.
- Position is 1-indexed: position 1 = the top organic result.
- The `ctr` field in the output is a ratio (0.0 to 1.0). Always multiply by 100 when presenting to the user.
