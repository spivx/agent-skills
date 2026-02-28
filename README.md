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

## Installation

Install all skills:

```bash
npx skills add spivx/agent-skills
```

Install a specific skill:

```bash
npx skills add spivx/agent-skills --skill gsc
```

## Usage

Skills activate automatically when your prompt matches their trigger conditions. Just ask naturally:

- "How is my site doing in Google search?"
- "Show me my top keywords for the last 3 months"
- "What pages are underperforming in organic search?"

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
