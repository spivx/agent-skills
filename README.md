# Agent Skills

A collection of skills for AI coding agents. Skills are packaged instructions and scripts that extend agent capabilities with specialized knowledge and live integrations.

## Available Skills

### GSC — Google Search Console

Connects directly to the Google Search Console API to fetch live search performance data and deliver actionable SEO insights.

**Use when:**
- "How is my site performing in Google?"
- "Check my rankings"
- "What keywords am I ranking for?"
- "Run a search console report"
- "Show me my organic traffic"

**What you get:**
- Live metrics — clicks, impressions, CTR, average position
- Top queries and pages with performance categorization
- Opportunity detection — high-impression/low-CTR keywords, page-2 ranking targets
- Actionable recommendations prioritized by effort vs impact
- Period-over-period trend analysis
- RTL-aware — Hebrew/Arabic sites get a formatted HTML report that auto-opens in your browser

### GSC Submit — Google Indexing API

Submits URLs to Google for crawling via the Indexing API. Supports three input modes: direct URLs, file imports (txt, CSV, sitemap.xml), and automatic route detection from your codebase.

**Use when:**
- "Submit these pages to Google for indexing"
- "Tell Google to crawl my new pages"
- "Scan my project routes and submit them to Google"
- "Check which URLs Google already knows about"
- "Notify Google that I removed a page"

**What you get:**
- Instant Google notification — no waiting for the next crawl cycle
- Pre-submission status check — see which URLs were already submitted
- Automatic route scanning — detects Next.js, React Router, Express, Astro, and more
- Smart route classification — excludes API routes, auth pages, and admin dashboards by default
- Terminal summary + HTML report with per-URL success/failure details
- Reuses existing GSC OAuth credentials — just add the Indexing API scope

## Installation

Install all skills:

```bash
npx skills add spivx/agent-skills
```

Install a specific skill:

```bash
npx skills add spivx/agent-skills --skill gsc
npx skills add spivx/agent-skills --skill gsc-submit
```

## Usage

Skills activate automatically when your prompt matches their trigger conditions. Just ask naturally:

**GSC (Search Console):**
- "How is my site doing in Google search?"
- "Show me my top keywords for the last 3 months"
- "What pages are underperforming in organic search?"

**GSC Submit (Indexing API):**
- "Submit my new blog posts to Google for indexing"
- "Scan my routes and submit them to Google"
- "Check which URLs Google already knows about"

## Skill Structure

Each skill follows a standard layout:

```
skill-name/
├── SKILL.md              # Instructions and configuration
└── scripts/              # Helper scripts for data fetching
    └── script.mjs
```

## License

MIT
