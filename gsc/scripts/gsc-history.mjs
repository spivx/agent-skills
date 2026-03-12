#!/usr/bin/env node

/**
 * GSC History — stores daily snapshots and compares them.
 *
 * Usage:
 *   node gsc-history.mjs store              # reads JSON from stdin, stores as today's snapshot
 *   node gsc-history.mjs list               # lists available snapshot dates
 *   node gsc-history.mjs get <date>         # prints snapshot for a given date
 *   node gsc-history.mjs compare [date1] [date2]  # compares two snapshots (defaults: yesterday vs today)
 *   node gsc-history.mjs weekly             # weekly comparison if >=7 days of data
 *
 * Storage: .gsc-data/<YYYY-MM-DD>.json in the project root (cwd).
 * If a snapshot already exists for the date, it is overwritten (last write wins).
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "fs";
import { resolve, join, dirname } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const DATA_DIR = resolve(process.cwd(), ".gsc-data");
const args = process.argv.slice(2);

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function listDates() {
  if (!existsSync(DATA_DIR)) return [];
  return readdirSync(DATA_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(".json", ""))
    .sort();
}

function readSnapshot(date) {
  const fp = join(DATA_DIR, `${date}.json`);
  if (!existsSync(fp)) return null;
  return JSON.parse(readFileSync(fp, "utf-8"));
}

function writeSnapshot(date, data) {
  ensureDir();
  writeFileSync(join(DATA_DIR, `${date}.json`), JSON.stringify(data, null, 2));
}

// --- Comparison helpers ---

function pctChange(oldVal, newVal) {
  if (oldVal === 0) return newVal === 0 ? 0 : Infinity;
  return Math.round(((newVal - oldVal) / oldVal) * 10000) / 100; // two decimals
}

function compareSummaries(oldSnap, newSnap) {
  const o = oldSnap.summary;
  const n = newSnap.summary;
  if (!o || !n) return null;
  return {
    clicks:      { old: o.clicks,      new: n.clicks,      change: n.clicks - o.clicks,      pct: pctChange(o.clicks, n.clicks) },
    impressions: { old: o.impressions, new: n.impressions, change: n.impressions - o.impressions, pct: pctChange(o.impressions, n.impressions) },
    ctr:         { old: o.ctr,         new: n.ctr,         change: Math.round((n.ctr - o.ctr) * 10000) / 10000 },
    position:    { old: o.position,    new: n.position,    change: Math.round((n.position - o.position) * 10) / 10 },
  };
}

function compareQueries(oldSnap, newSnap) {
  if (!oldSnap.topQueries || !newSnap.topQueries) return null;
  const oldMap = new Map(oldSnap.topQueries.map((q) => [q.keys[0], q]));
  const newMap = new Map(newSnap.topQueries.map((q) => [q.keys[0], q]));

  const allKeys = new Set([...oldMap.keys(), ...newMap.keys()]);
  const improved = [];
  const declined = [];
  const newQueries = [];
  const dropped = [];

  for (const key of allKeys) {
    const o = oldMap.get(key);
    const n = newMap.get(key);
    if (!o && n) {
      newQueries.push({ query: key, ...n });
    } else if (o && !n) {
      dropped.push({ query: key, ...o });
    } else {
      const posDelta = Math.round((o.position - n.position) * 10) / 10; // positive = improved
      const clickDelta = n.clicks - o.clicks;
      const entry = {
        query: key,
        old: { clicks: o.clicks, impressions: o.impressions, position: o.position, ctr: o.ctr },
        new: { clicks: n.clicks, impressions: n.impressions, position: n.position, ctr: n.ctr },
        positionDelta: posDelta,
        clickDelta,
      };
      if (posDelta > 0 || clickDelta > 0) improved.push(entry);
      else if (posDelta < 0 || clickDelta < 0) declined.push(entry);
    }
  }

  improved.sort((a, b) => b.clickDelta - a.clickDelta);
  declined.sort((a, b) => a.clickDelta - b.clickDelta);

  return { improved, declined, newQueries, dropped };
}

function comparePages(oldSnap, newSnap) {
  if (!oldSnap.topPages || !newSnap.topPages) return null;
  const oldMap = new Map(oldSnap.topPages.map((p) => [p.keys[0], p]));
  const newMap = new Map(newSnap.topPages.map((p) => [p.keys[0], p]));

  const allKeys = new Set([...oldMap.keys(), ...newMap.keys()]);
  const improved = [];
  const declined = [];
  const newPages = [];
  const dropped = [];

  for (const key of allKeys) {
    const o = oldMap.get(key);
    const n = newMap.get(key);
    if (!o && n) {
      newPages.push({ page: key, ...n });
    } else if (o && !n) {
      dropped.push({ page: key, ...o });
    } else {
      const clickDelta = n.clicks - o.clicks;
      const entry = {
        page: key,
        old: { clicks: o.clicks, impressions: o.impressions, position: o.position, ctr: o.ctr },
        new: { clicks: n.clicks, impressions: n.impressions, position: n.position, ctr: n.ctr },
        clickDelta,
      };
      if (clickDelta > 0) improved.push(entry);
      else if (clickDelta < 0) declined.push(entry);
    }
  }

  improved.sort((a, b) => b.clickDelta - a.clickDelta);
  declined.sort((a, b) => a.clickDelta - b.clickDelta);

  return { improved, declined, newPages, dropped };
}

function buildComparison(oldDate, newDate) {
  const oldSnap = readSnapshot(oldDate);
  const newSnap = readSnapshot(newDate);
  if (!oldSnap) return { error: `No snapshot for ${oldDate}` };
  if (!newSnap) return { error: `No snapshot for ${newDate}` };

  return {
    comparison: {
      oldDate,
      newDate,
      oldRange: oldSnap.metadata?.range,
      newRange: newSnap.metadata?.range,
      oldDateRange: oldSnap.metadata?.dateRange,
      newDateRange: newSnap.metadata?.dateRange,
    },
    summary: compareSummaries(oldSnap, newSnap),
    queries: compareQueries(oldSnap, newSnap),
    pages: comparePages(oldSnap, newSnap),
  };
}

// --- Watchlist helpers ---

function loadWatchlist() {
  const configPaths = [
    resolve(process.cwd(), ".gsc-config.json"),
    resolve(process.cwd(), "gsc-config.json"),
  ];
  for (const cp of configPaths) {
    if (existsSync(cp)) {
      try {
        const cfg = JSON.parse(readFileSync(cp, "utf-8"));
        if (Array.isArray(cfg.watchlist) && cfg.watchlist.length > 0) {
          return cfg.watchlist.map((q) => q.toLowerCase());
        }
      } catch { /* ignore parse errors */ }
    }
  }
  return null;
}

// --- Trends helpers ---

function buildQueryHistory(dates, filterQuery, watchlist) {
  const queryMap = new Map(); // query -> [{date, position, clicks, impressions, ctr}]

  for (const date of dates) {
    const snap = readSnapshot(date);
    if (!snap || !snap.topQueries) continue;
    for (const q of snap.topQueries) {
      const query = q.keys[0];
      if (filterQuery && query.toLowerCase() !== filterQuery.toLowerCase()) continue;
      if (!filterQuery && watchlist && !watchlist.includes(query.toLowerCase())) continue;

      if (!queryMap.has(query)) queryMap.set(query, []);
      queryMap.get(query).push({
        date,
        position: q.position,
        clicks: q.clicks,
        impressions: q.impressions,
        ctr: q.ctr,
      });
    }
  }

  return queryMap;
}

function detectAlerts(queryMap) {
  const alerts = [];
  for (const [query, history] of queryMap) {
    if (history.length < 2) continue;
    const latest = history[history.length - 1];
    const prev = history[history.length - 2];
    const posDelta = Math.round((prev.position - latest.position) * 10) / 10;

    // Dropped off page 1 (was <=10, now >10)
    if (prev.position <= 10 && latest.position > 10) {
      alerts.push({ query, type: "dropped_page1", from: prev.position, to: latest.position, date: latest.date });
    }
    // Entered page 1 (was >10, now <=10)
    else if (prev.position > 10 && latest.position <= 10) {
      alerts.push({ query, type: "entered_page1", from: prev.position, to: latest.position, date: latest.date });
    }
    // Big position jump (5+ positions in either direction)
    else if (Math.abs(posDelta) >= 5) {
      alerts.push({
        query,
        type: posDelta > 0 ? "big_improvement" : "big_decline",
        from: prev.position,
        to: latest.position,
        delta: posDelta,
        date: latest.date,
      });
    }
  }
  return alerts;
}

function buildTrendsOutput(queryMap, alerts, filterQuery, watchlist) {
  const trends = [];
  for (const [query, history] of queryMap) {
    const first = history[0];
    const latest = history[history.length - 1];
    const overallDelta = history.length >= 2
      ? Math.round((first.position - latest.position) * 10) / 10
      : 0;
    trends.push({
      query,
      dataPoints: history.length,
      firstSeen: first.date,
      lastSeen: latest.date,
      currentPosition: latest.position,
      currentClicks: latest.clicks,
      currentImpressions: latest.impressions,
      overallPositionDelta: overallDelta,
      history,
    });
  }

  // Sort by current clicks descending
  trends.sort((a, b) => b.currentClicks - a.currentClicks);

  return {
    totalQueries: trends.length,
    filter: filterQuery || (watchlist ? "watchlist" : "all (top queries from each snapshot)"),
    alerts,
    trends,
  };
}

// --- Commands ---

const command = process.argv[2];

if (command === "store") {
  const input = readFileSync(0, "utf-8"); // stdin
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    console.log(JSON.stringify({ error: "INVALID_JSON", message: "Could not parse stdin as JSON" }));
    process.exit(1);
  }
  const date = todayStr();
  writeSnapshot(date, data);

  // After storing, check what comparisons are available
  const dates = listDates();
  const result = { stored: date, totalSnapshots: dates.length, availableDates: dates };

  // Auto-compare with previous snapshot if available
  if (dates.length >= 2) {
    const prevDate = dates[dates.length - 2];
    result.comparisonAvailable = true;
    result.previousDate = prevDate;
    result.dayComparison = buildComparison(prevDate, date);
  }

  // Check for weekly comparison (snapshots spanning 7+ days)
  if (dates.length >= 2) {
    const oldest = new Date(dates[0]);
    const newest = new Date(dates[dates.length - 1]);
    const daySpan = Math.round((newest - oldest) / (1000 * 60 * 60 * 24));
    if (daySpan >= 7) {
      // Find the snapshot closest to 7 days ago
      const targetDate = new Date(newest);
      targetDate.setDate(targetDate.getDate() - 7);
      const targetStr = targetDate.toISOString().split("T")[0];
      // Find closest date <= targetStr
      const weekAgoDate = dates.filter((d) => d <= targetStr).pop() || dates[0];
      result.weeklyComparisonAvailable = true;
      result.weeklyComparison = buildComparison(weekAgoDate, dates[dates.length - 1]);
    }
  }

  console.log(JSON.stringify(result, null, 2));

} else if (command === "list") {
  const dates = listDates();
  console.log(JSON.stringify({ totalSnapshots: dates.length, dates }, null, 2));

} else if (command === "get") {
  const date = process.argv[3];
  if (!date) {
    console.log(JSON.stringify({ error: "MISSING_DATE", message: "Usage: gsc-history.mjs get <YYYY-MM-DD>" }));
    process.exit(1);
  }
  const snap = readSnapshot(date);
  if (!snap) {
    console.log(JSON.stringify({ error: "NOT_FOUND", message: `No snapshot for ${date}`, available: listDates() }));
    process.exit(1);
  }
  console.log(JSON.stringify(snap, null, 2));

} else if (command === "compare") {
  const dates = listDates();
  let oldDate = process.argv[3];
  let newDate = process.argv[4];

  if (!oldDate && !newDate) {
    // Default: compare two most recent snapshots
    if (dates.length < 2) {
      console.log(JSON.stringify({ error: "NOT_ENOUGH_DATA", message: "Need at least 2 snapshots to compare", available: dates }));
      process.exit(1);
    }
    oldDate = dates[dates.length - 2];
    newDate = dates[dates.length - 1];
  } else if (oldDate && !newDate) {
    newDate = dates[dates.length - 1];
  }

  const result = buildComparison(oldDate, newDate);
  console.log(JSON.stringify(result, null, 2));

} else if (command === "weekly") {
  const dates = listDates();
  if (dates.length < 2) {
    console.log(JSON.stringify({ error: "NOT_ENOUGH_DATA", message: "Need at least 2 snapshots for weekly comparison", available: dates }));
    process.exit(1);
  }

  const newest = dates[dates.length - 1];
  const newestDate = new Date(newest);
  const oldest = new Date(dates[0]);
  const daySpan = Math.round((newestDate - oldest) / (1000 * 60 * 60 * 24));

  if (daySpan < 7) {
    console.log(JSON.stringify({
      error: "NOT_ENOUGH_HISTORY",
      message: `Only ${daySpan} days of history (need 7). Keep running reports daily.`,
      firstSnapshot: dates[0],
      latestSnapshot: newest,
      daySpan,
    }));
    process.exit(1);
  }

  // Find snapshot closest to 7 days ago
  const targetDate = new Date(newestDate);
  targetDate.setDate(targetDate.getDate() - 7);
  const targetStr = targetDate.toISOString().split("T")[0];
  const weekAgoDate = dates.filter((d) => d <= targetStr).pop() || dates[0];

  const result = buildComparison(weekAgoDate, newest);
  result.note = `Comparing ${weekAgoDate} to ${newest} (${Math.round((newestDate - new Date(weekAgoDate)) / (1000 * 60 * 60 * 24))} days apart)`;
  console.log(JSON.stringify(result, null, 2));

} else if (command === "fetch") {
  // Convenience command: fetches queries from GSC with a high limit and stores the snapshot.
  // Single command for rank tracking — no manual watchlist needed.
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const fetchScript = join(scriptDir, "gsc-fetch.mjs");

  // Read trackLimit from config, default 500
  const cfg = (() => {
    try { return JSON.parse(readFileSync(resolve(process.cwd(), ".gsc-config.json"), "utf-8")); }
    catch { return {}; }
  })();
  const trackLimit = cfg.trackLimit || 500;

  // Pass through any extra CLI args (e.g. --range 7d)
  const extraArgs = args.slice(1).join(" ");

  try {
    const fetchOutput = execSync(
      `node "${fetchScript}" --type all --limit ${trackLimit} ${extraArgs}`,
      { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 }
    );

    // Check if fetch returned an error
    let fetchData;
    try {
      fetchData = JSON.parse(fetchOutput);
    } catch {
      console.log(JSON.stringify({ error: "FETCH_PARSE_ERROR", message: "Could not parse fetch output as JSON" }));
      process.exit(1);
    }

    if (fetchData.error) {
      console.log(JSON.stringify(fetchData));
      process.exit(1);
    }

    // Store the snapshot
    const date = todayStr();
    writeSnapshot(date, fetchData);

    const dates = listDates();
    const result = {
      stored: date,
      totalSnapshots: dates.length,
      queriesFetched: (fetchData.topQueries || []).length,
      pagesFetched: (fetchData.topPages || []).length,
    };

    // Auto-compare with previous snapshot
    if (dates.length >= 2) {
      const prevDate = dates[dates.length - 2];
      result.previousDate = prevDate;
      result.dayComparison = buildComparison(prevDate, date);
    }

    // Check for alerts via trends
    const watchlist = loadWatchlist();
    const queryMap = buildQueryHistory(dates, null, watchlist);
    const alerts = detectAlerts(queryMap);
    if (alerts.length > 0) result.alerts = alerts;

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.log(JSON.stringify({ error: "FETCH_FAILED", message: err.message }));
    process.exit(1);
  }

} else if (command === "trends") {
  const dates = listDates();
  if (dates.length === 0) {
    console.log(JSON.stringify({ error: "NO_DATA", message: "No snapshots found. Run 'store' first." }));
    process.exit(1);
  }

  const filterQuery = process.argv[3] || null;
  const watchlist = filterQuery ? null : loadWatchlist();

  const queryMap = buildQueryHistory(dates, filterQuery, watchlist);

  if (queryMap.size === 0) {
    const msg = filterQuery
      ? `Query "${filterQuery}" not found in any snapshot.`
      : watchlist
        ? "No watchlist queries found in snapshots. Check your watchlist in .gsc-config.json."
        : "No query data found in snapshots.";
    console.log(JSON.stringify({ error: "NO_MATCHES", message: msg, availableDates: dates }));
    process.exit(1);
  }

  const alerts = detectAlerts(queryMap);
  const result = buildTrendsOutput(queryMap, alerts, filterQuery, watchlist);
  console.log(JSON.stringify(result, null, 2));

} else {
  console.log(JSON.stringify({
    error: "UNKNOWN_COMMAND",
    message: "Usage: gsc-history.mjs <fetch|store|list|get|compare|weekly|trends>",
    commands: {
      fetch: "Fetches queries from GSC (up to trackLimit, default 500), stores snapshot, and shows alerts",
      store: "Reads GSC JSON from stdin, stores as today's snapshot",
      list: "Lists all available snapshot dates",
      get: "get <YYYY-MM-DD> — prints a stored snapshot",
      compare: "compare [date1] [date2] — compares two snapshots",
      weekly: "Shows weekly comparison if 7+ days of data exist",
      trends: "trends [query] — per-query rank history over time (uses watchlist if configured)",
    },
  }));
  process.exit(1);
}
