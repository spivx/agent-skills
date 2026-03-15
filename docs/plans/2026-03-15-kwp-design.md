# Keyword Planner Skill (`kwp`) — Design Doc

**Date:** 2026-03-15
**Status:** Approved

## Goal

A Claude skill that calls the Google Keyword Planner API to discover keyword opportunities for organic content/SEO, then generates a prioritized content calendar with specific article ideas mapped to keyword clusters.

## Architecture

```
User invokes /kwp [seeds/url/topic] [options]
       ↓
kwp-fetch.mjs  — calls Google Ads API KeywordPlanIdeaService
       ↓
JSON output (keywords + metrics)
       ↓
Claude analyzes: priority ranking + content calendar
       ↓
HTML report (full data) + terminal (action items + calendar)
```

Two scripts, zero npm dependencies:
- `kwp-fetch.mjs` — handles OAuth, calls the API, outputs keyword JSON to stdout
- Claude reads the JSON and performs analysis + calendar generation

## Inputs

Any combination of the following:

| Mode | Example |
|------|---------|
| Seed keywords | `/kwp "content marketing", "SEO tools"` |
| Domain/URL | `/kwp url:https://myblog.com` |
| Topic | `/kwp topic:"email marketing"` |

Options:
- `--limit N` — max keywords to return (default: 50)
- `--lang` — language code (default: `en`)
- `--country` — location target (default: `US`)

## Script Output (JSON)

```json
{
  "metadata": {
    "seeds": ["content marketing"],
    "fetchedAt": "2026-03-15T12:00:00.000Z",
    "language": "en",
    "country": "US"
  },
  "keywords": [
    {
      "keyword": "content marketing strategy",
      "avgMonthlySearches": 5400,
      "competition": "LOW",
      "competitionIndex": 12,
      "lowTopOfPageBid": 1.20,
      "highTopOfPageBid": 3.80
    }
  ]
}
```

## Authentication & Setup

**Reuses existing GSC OAuth credentials** (`GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`) with a new refresh token scope. Two additional env vars required:

| Variable | Description |
|----------|-------------|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | From Google Ads API Center |
| `GOOGLE_ADS_CUSTOMER_ID` | 10-digit Google Ads account ID (digits only, no dashes) |

**Setup flow for fresh start:**
1. Create a free Google Ads account at ads.google.com (no campaigns needed)
2. Apply for a developer token in Google Ads API Center (test access is sufficient for personal SEO research)
3. Regenerate `GSC_REFRESH_TOKEN` adding the `https://www.googleapis.com/auth/adwords` scope (keep `webmasters.readonly` to preserve existing GSC skills)
4. Set the two new env vars

**Note on developer token tiers:**
- Test access: returns real keyword data, sufficient for personal/research use
- Basic access: requires a live campaign; needed for production/client use

## Analysis Framework

### Keyword Prioritization

| Signal | Priority |
|--------|----------|
| High volume + LOW competition | Top |
| Medium volume + LOW/MEDIUM competition | High |
| High volume + HIGH competition | Low (hard to rank) |
| Volume < 100/mo | Filtered out (unless `--all` flag) |

### Content Calendar Generation

1. **Group** related keywords into article clusters
2. **Assign format** by intent: "how to X" → tutorial, "best X" → roundup, "what is X" → explainer
3. **Order** by quick wins first (low competition + decent volume), then medium-effort, then long-term
4. **Output** per article: title, primary keyword, secondary keywords, format, difficulty, week number

## Terminal Output

After analysis, in this order:
1. `Full report written to kwp-report.html` + absolute path
2. Numbered content calendar (one article idea per line, concise)
3. Ask: "Which of these would you like me to start drafting?"

No raw stats or tables in the terminal — everything except the numbered calendar lives in the HTML report.

## HTML Report

Generated at `kwp-report.html` in the project root. Contains:
- Summary card (total keywords found, date, seeds/inputs)
- Full keyword table (keyword, volume, competition, CPC range)
- Prioritized content calendar with keyword groupings and publishing order

Follows the same HTML structure as `gsc-report.html` (same CSS, same summary-card grid).

## Skill Metadata

- **Name:** `kwp`
- **Argument hint:** `[seeds|url:URL|topic:TOPIC] [--limit N] [--lang XX] [--country XX]`
- **Trigger phrases:** "keyword research", "keyword ideas", "what should I write about", "content ideas", "keyword planner", `/kwp`

## Files to Create

```
kwp/
  SKILL.md          — skill definition and instructions for Claude
  scripts/
    kwp-fetch.mjs   — Google Ads API client script
```

## Out of Scope

- Paid ads planning (bid strategy, budgets, ad copy)
- Competitor keyword analysis
- Automated content drafting (skill asks which articles to draft, then hands off)
