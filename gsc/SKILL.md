---
name: gsc
description: >-
  Fetch and analyze Google Search Console data. Use when the user asks about
  GSC, Google Search Console, SEO performance, search performance, impressions,
  clicks, CTR, average position, keywords, rankings, organic traffic, top pages,
  top queries, "how is my site performing in Google", "check rankings",
  "what keywords am I ranking for", or "search console report".
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
  "siteUrl": "sc-domain:yourdomain.com",
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
    "siteUrl": "sc-domain:yourdomain.com",
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
| `CONFIG_NOT_FOUND` | `.gsc-config.json` doesn't exist | Guide the user through Setup (above). The file must be in the repository root. |
| `CONFIG_INCOMPLETE` | One or more required fields are missing | The error lists each missing field with a hint. Tell the user exactly which fields to add and where to get the values (refer to the relevant Setup step). |
| `TOKEN_REFRESH_FAILED` (401/403) | OAuth credentials are invalid or the refresh token has expired | Ask the user to regenerate the refresh token (Step 3). If using Testing mode, tokens expire after 7 days — suggest publishing to Production. |
| `GSC_API_ERROR` (403) | The Google account doesn't have access to this Search Console property | Verify the account used in Step 3 is the same one that owns/has access to the property in GSC. |
| `GSC_API_ERROR` (400) | `siteUrl` format is wrong | Try `sc-domain:domain.com` for Domain properties or `https://domain.com/` (with trailing slash) for URL-prefix properties. |

The script also prints a **warning to stderr** if `.gsc-config.json` is not listed in the project's `.gitignore`. If you see this warning, immediately add `.gsc-config.json` to the user's `.gitignore` file to prevent credentials from being committed.

## Analysis Framework

After fetching data, provide insights using this structure. Do not simply restate the numbers — interpret them, compare against benchmarks, and surface what matters.

### 1. Executive Summary

Present key metrics clearly:
- Total clicks, impressions, average CTR (as percentage), average position
- **Health assessment**: Is the CTR reasonable for the position range? Compare to the benchmarks below.
- **Context**: What these numbers mean for a site at this stage — growing, stable, or declining.

### 2. Top Queries Analysis

Categorize queries by actionability:
- **High-impression, low-click queries**: Getting seen but not clicked. Ranking too low or title/description needs improvement. These are your top optimization candidates.
- **Position 4-10 (bottom of page 1)**: Small ranking improvements here yield disproportionate traffic gains. Highest priority targets.
- **Position 11-20 (page 2)**: Worth targeting for a page-1 push with content improvements.
- **Position 20+**: Low priority unless impression volume is high.
- **Brand vs non-brand**: Separate queries containing the brand/company name from generic search terms.

### 3. Top Pages Analysis

- **Best performers**: High clicks, good CTR relative to position. Identify what makes them work.
- **Underperforming pages**: High impressions but low CTR — candidates for title and meta description rewrites.
- **Poorly ranking pages**: High position number (low ranking) despite having a dedicated page. Need content improvement.
- **Content gaps**: Important topics or services with no page appearing in results.

### 4. CTR Benchmarks

Compare actual CTR against these organic search benchmarks:

| Position | Expected CTR |
|----------|-------------|
| 1 | 25-35% |
| 2 | 12-18% |
| 3 | 8-12% |
| 4-5 | 5-8% |
| 6-10 | 2-5% |
| 11+ | <2% |

Flag queries or pages significantly **above** these ranges (strong title/snippet — learn from them) or **below** (needs optimization).

### 5. Actionable Recommendations

Prioritize by effort vs impact:
1. **Quick wins**: Title and meta description rewrites for high-impression, low-CTR queries. Minimal effort, immediate potential.
2. **Content improvements**: Pages ranking 5-15 that could move up with better, more comprehensive content.
3. **New content opportunities**: Queries appearing in results where no dedicated page exists.
4. **Technical issues**: Anomalies like zero clicks despite many impressions at good positions.

### 6. Period Comparison

If the user asks for trends or comparisons, run the script twice with different `--range` values and compare:
- Clicks and impressions change (absolute and percentage)
- Position movement per query
- New queries appearing vs queries that dropped off

## Important Notes

- CTR and position values are **averages** across the entire period, not point-in-time snapshots.
- GSC data has a 2-3 day lag. The script accounts for this automatically by excluding the most recent 3 days.
- Position is 1-indexed: position 1 = the top organic result.
- The `ctr` field in the output is a ratio (0.0 to 1.0). Always multiply by 100 when presenting to the user.
