"use client";
import React, { useMemo, useState, useEffect } from "react";
import { format, addDays, startOfWeek, endOfWeek, isWithinInterval, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, parse, parseISO, getISOWeek, getYear, getMonth, isSameDay } from "date-fns";
import Papa from "papaparse";
import { CalendarDays, Mail, MessageSquare, Voicemail, Upload, AlertTriangle, CheckCircle2, Filter } from "lucide-react";
// Replace alias imports with relative paths to ensure proper module resolution on Vercel
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Input } from "./components/ui/input";
import { Progress } from "./components/ui/progress";

/**
 * MARKETING SCHEDULE TRACKER (Single-file React app)
 *
 * What it does
 * - Import your Google Sheet CSV and auto-compute follow‑ups (Text + VM at T+13 days)
 * - Top reminders for THIS WEEK and NEXT WEEK (with completion checkboxes for Text/VM)
 * - Month summary against 9k–10k target (green = in range)
 * - Weekly mail count table per month
 * - Calendar view with icons (✉️ 💬 🎙️) and Part/Batch badges
 * - "No‑Mail" campaigns supported via a Channels/Tags column or inline toggle
 *
 * CSV Schema (flexible, case-insensitive match):
 * REQUIRED: Date, Campaign, Count
 * OPTIONAL: Month and Year, Week, Category, Part, Batch, Cost, Red - Adjusted Dates,
 *           Channels (e.g. "Mail,Text,Voicemail" or "Text,Voicemail"),
 *           Tags (include "No Mail" or "NoMail" to mark text/VM-only campaigns)
 * Date formats accepted: yyyy-MM-dd, MMM d, yyyy, M/d/yyyy, M/d/yy
 */

// -------------------- Utilities --------------------
const currency = (n) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n || 0);

const ordinal = (n) => {
  const s = ["th","st","nd","rd"], v = n % 100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
};

const inferBatchNum = (part, batch) => {
  // Extract the first numeric portion from part/batch text (e.g., "Batch 3" => 3)
  const pick = String(part || "") + " " + String(batch || "");
  let digits = "";
  for (const ch of pick) { if (ch >= '0' && ch <= '9') digits += ch; }
  const num = parseInt(digits, 10);
  return Number.isFinite(num) ? num : null;
};

const stageForBatch = (n) => {
  if (!n || n <= 1) return "Initial";
  if (n >= 5) return "Final";
  return ordinal(n) + " Follow-up";
};

const tryParseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const asStr = String(value).trim();
  const tryFormats = [
    "yyyy-MM-dd",
    "MMM d, yyyy",
    "MMMM d, yyyy",
    "M/d/yyyy",
    "MM/dd/yyyy",
    "M/d/yy",
    "MM/dd/yy",
  ];
  for (const f of tryFormats) {
    try {
      const d = parse(asStr, f, new Date());
      if (!isNaN(d)) return d;
    } catch {}
  }
  const iso = parseISO(asStr);
  if (!isNaN(iso)) return iso;
  const loose = new Date(asStr);
  if (!isNaN(loose)) return loose;
  return null;
};

// -------------------- Mini runtime checks (dev) --------------------
if (typeof window !== "undefined" && !window.__MARKETING_TRACKER_TESTED__) {
  window.__MARKETING_TRACKER_TESTED__ = true;
  try {
    console.assert(stageForBatch(1) === "Initial", "stage 1 should be Initial");
    console.assert(/2nd/.test(stageForBatch(2)), "stage 2 should be 2nd follow-up");
    console.assert(stageForBatch(5) === "Final", "stage 5 should be Final");
    const mock = "https://docs.google.com/spreadsheets/d/ABCDEF/edit#gid=0";
    const out = (function toCsvUrlTestOnly(input){
      try {
        const url = new URL(input);
        const idMatch = url.pathname.match(/\/d\/([^/]+)/);
        const id = idMatch?.[1];
        const gid = url.searchParams.get("gid");
        if (id) return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
      } catch {}
      return input;
    })(mock);
    console.assert(/export\?format=csv/.test(out), "should convert to CSV export URL");
    // Added tests
    console.assert(!!tryParseDate("7/29/2025"), "US short date should parse");
    console.assert(typeof currency(1234) === "string", "currency returns string");
    // Tag parsing sanity checks
    console.assert(/\bmail\b/i.test('Mail,Text,Voicemail') === true, 'detect mail token');
    console.assert(/\bmail\b/i.test('voicemail') === false, 'do not treat voicemail as mail');
    console.assert(/\b(voicemail|voice\s*mail|vm|vmail)\b/i.test('Voice Mail') === true, 'detect voice mail spaced');
    console.assert(/\b(text|sms)\b/i.test('SMS') === true, 'detect SMS as text');
    // Cadence label rule: Part letter overrides campaign suffix
    (function(){
      const build = (campaign, part) => {
        let base = String(campaign || '').trim();
        const idx = base.lastIndexOf(' - ');
        if (idx > -1 && idx + 3 <= base.length) {
          const suf = base.slice(idx + 3).trim();
          const C = suf.toUpperCase();
          if (suf.length === 1 && C >= 'A' && C <= 'Z') base = base.slice(0, idx);
        }
        let letter = '';
        const p = String(part || '');
        for (let i=0;i<p.length;i++){ const ch=p[i].toUpperCase(); if (ch>='A' && ch<='Z'){ letter = ch; break; } }
        return letter ? (base + ' - ' + letter) : base;
      };
      console.assert(build('DM 1', 'Batch A') === 'DM 1 - A', 'append A from Part');
      console.assert(build('DM 1 - A', 'Batch B') === 'DM 1 - B', 'Part overrides campaign suffix');
      console.assert(build('DM 1 - A', '') === 'DM 1 - A', 'keep suffix when Part empty');
    })();
  } catch {}
}

// -------------------- Google Sheet helpers --------------------
const toCsvUrl = (input) => {
  try {
    const u = input?.trim();
    if (!u) return "";
    const url = new URL(u);
    if (url.hostname.includes("docs.google.com") && url.pathname.includes("/spreadsheets/")) {
      // Normalize any incoming URL to a CSV export URL
      if (url.pathname.includes("/export")) {
        url.searchParams.set("format","csv");
        // Force gid to the fixed tab if provided
        if (USE_FIXED_SOURCE && FIXED_SHEET_GID) {
          url.searchParams.set("gid", FIXED_SHEET_GID);
        }
        return url.toString();
      }
      if (url.pathname.includes("/pub") && url.searchParams.get("output") === "csv") {
        // Public CSV already — optionally enforce gid
        if (USE_FIXED_SOURCE && FIXED_SHEET_GID) {
          url.searchParams.set("gid", FIXED_SHEET_GID);
        }
        return url.toString();
      }
      const idMatch = url.pathname.match(/\/d\/([^/]+)/);
      const id = idMatch?.[1];
      // Prefer the fixed gid (Marketing tab) if provided, else pass through any found gid
      const incomingGid = url.searchParams.get("gid");
      const finalGid = (USE_FIXED_SOURCE && FIXED_SHEET_GID) ? FIXED_SHEET_GID : incomingGid;
      if (id) {
        return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${finalGid ? `&gid=${finalGid}` : ''}`;
      }
    }
  } catch {}
  return input;
};

// Fixed Google Sheet source (optional). Set your sheet link below to lock the source.
// Example: const FIXED_SHEET_URL = "https://docs.google.com/spreadsheets/d/XXX/edit#gid=0";
const FIXED_SHEET_URL = "https://docs.google.com/spreadsheets/d/1gFBB6_C4ZL3Wv0m4Pw7s9Vt9A7806Cj1r5u7O_cw_bo/edit#gid=0";
// If your default tab isn't the first sheet, set its gid here (open the "Marketing" tab and copy the gid from the URL)
const FIXED_SHEET_GID = ""; // e.g. "808371977" for the Marketing tab
const FIXED_SHEET_TAB_NAME = "Marketing"; // for display only
const USE_FIXED_SOURCE = Boolean(FIXED_SHEET_URL);

// -------------------- Sample rows (can delete after connecting) --------------------
const sampleRows = [
  { Date: "2025-08-26", Campaign: "DM3-B", Category: "FL", Part: "Batch 2", Batch: "B2", Count: 2444, Cost: "", Channels: "Mail,Text,Voicemail" },
  { Date: "2025-09-02", Campaign: "DM3-B", Category: "FL", Part: "Batch 3", Batch: "B3", Count: 2117, Cost: "", Channels: "Mail,Text,Voicemail" },
  { Date: "2025-09-09", Campaign: "DM3-B", Category: "FL", Part: "Batch 4", Batch: "B4", Count: 2524, Cost: "", Channels: "Mail,Text,Voicemail" },
  { Date: "2025-09-16", Campaign: "DM3-B", Category: "FL", Part: "Batch 5", Batch: "B5", Count: 2091, Cost: "", Channels: "Mail,Text,Voicemail" },
  { Date: "2025-09-23", Campaign: "LC/Text-Only – Promo", Category: "OK", Part: "Wave 1", Batch: "W1", Count: 1800, Cost: "", Channels: "Text,Voicemail", Tags: "NoMail" },
];

// ================================================================
// Component
// ================================================================
export default function MarketingTracker() {
  const [rows, setRows] = useState(sampleRows);
  const [sheetUrl, setSheetUrl] = useState("");
  const [showCosts, setShowCosts] = useState(false);
  const [showCalendar, setShowCalendar] = useState(true);
  const [showWeeklyTable, setShowWeeklyTable] = useState(true);
  const [showCampaignTable, setShowCampaignTable] = useState(true);
  const [showCadenceMatrix, setShowCadenceMatrix] = useState(true);
  const [hidePast, setHidePast] = useState(true);
  const [showCounty, setShowCounty] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [doneKeys, setDoneKeys] = useState(() => {
    try { return JSON.parse(localStorage.getItem("taskDoneKeys") || "[]"); } catch { return []; }
  });
  const today = new Date();

  // Persist & restore the Sheet URL locally so it sticks between reloads (unless fixed source)
  useEffect(() => {
    if (USE_FIXED_SOURCE) {
      setSheetUrl(FIXED_SHEET_URL);
    } else {
      try {
        const saved = localStorage.getItem("sheetUrl");
        if (saved) setSheetUrl(saved);
      } catch {}
    }
  }, []);
  useEffect(() => {
    if (!USE_FIXED_SOURCE) {
      try { if (sheetUrl) localStorage.setItem("sheetUrl", sheetUrl); } catch {}
    }
  }, [sheetUrl]);
  useEffect(() => { if (sheetUrl) fetchSheet(); }, [sheetUrl]);
  useEffect(() => { try { localStorage.setItem("taskDoneKeys", JSON.stringify(doneKeys)); } catch {} }, [doneKeys]);

  // Derive normalized rows with date objects and channel flags
  const data = useMemo(() => {
    return (rows || [])
      .map((r, i) => {
        const mailDate = tryParseDate(r["Red - Adjusted Dates"] || r.Date);
        const tagsStr = String(r.Tags || '').toLowerCase();
        const channelsStr = String(r.Channels || '').toLowerCase();
        const src = tagsStr + ' ' + channelsStr;
        const hasNoMailTag = /\bno[-\s]?mail\b/.test(src);
        const hasMailToken = /\bmail\b/.test(src); // strict token; won't match 'voicemail'
        const hasTextToken = /\b(text|sms)\b/.test(src);
        const hasVmToken = /\b(voicemail|voice\s*mail|vm|vmail)\b/.test(src);
        const anyToken = /\b(mail|text|sms|voicemail|voice\s*mail|vm|vmail)\b/.test(src);
        const noText = /\bno[-\s]?(text|sms)\b/.test(src);
        const noVM = /\bno[-\s]?(voicemail|voice\s*mail|vm|vmail)\b/.test(src);
        let hasMail = hasMailToken && !hasNoMailTag;
        let hasText = hasTextToken;
        let hasVM = hasVmToken;
        if (!anyToken) { hasMail = !hasNoMailTag; hasText = true; hasVM = true; }
        if (hasMail && !noText) hasText = true;
        if (hasMail && !noVM) hasVM = true;
        if (noText) hasText = false;
        if (noVM) hasVM = false;
        const part = r.Part || "";
        const batch = r.Batch || "";
        const batchNum = inferBatchNum(part, batch);
        return {
          id: i,
          raw: r,
          mailDate,
          hasMail,
          hasText,
          hasVM,
          count: Number(r.Count) || 0,
          campaign: r.Campaign || "(Unnamed)",
          category: r.Category || "",
          part,
          batch,
          batchNum,
          cost: Number(r.Cost) || 0,
        };
      })
      .filter((r) => r.mailDate);
  }, [rows]);

  // Create tasks: mail (if any) at mailDate, then text/vm at +13 days (or same date if no mail)
  const tasks = useMemo(() => {
    const items = [];
    for (const r of data) {
      const t0 = r.mailDate;
      const follow = r.hasMail ? addDays(t0, 13) : t0; // text/vm-only campaigns happen on Date
      const partBatch = [r.part, r.batch].filter(Boolean).join(" • ");
      const base = { count: r.count, ref: r };
      if (r.hasMail) {
        const date = t0; const type = "mail";
        const idKey = `${type}|${format(date, 'yyyy-MM-dd')}|${r.campaign}|${r.part}|${r.batch}`;
        items.push({ ...base, type, date, idKey, label: `Mail • ${r.campaign}${partBatch?` • ${partBatch}`:""}` });
      }
      if (r.hasText) {
        const date = follow; const type = "text";
        const idKey = `${type}|${format(date, 'yyyy-MM-dd')}|${r.campaign}|${r.part}|${r.batch}`;
        const stage = stageForBatch(r.batchNum);
        items.push({ ...base, type, date, idKey, stage, label: `Text • ${r.campaign}${partBatch?` • ${partBatch}`:""}` });
      }
      if (r.hasVM) {
        const date = follow; const type = "vm";
        const idKey = `${type}|${format(date, 'yyyy-MM-dd')}|${r.campaign}|${r.part}|${r.batch}`;
        const stage = stageForBatch(r.batchNum);
        items.push({ ...base, type, date, idKey, stage, label: `VM • ${r.campaign}${partBatch?` • ${partBatch}`:""}` });
      }
    }
    return items.sort((a, b) => a.date - b.date);
  }, [data]);

  // Month summaries (mail counts only)
  const monthAgg = useMemo(() => {
    const map = new Map();
    for (const r of data) {
      if (!r.hasMail) continue;
      const key = `${getYear(r.mailDate)}-${String(getMonth(r.mailDate) + 1).padStart(2, "0")}`;
      map.set(key, (map.get(key) || 0) + r.count);
    }
    return Array.from(map.entries())
      .map(([key, total]) => ({ key, total }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [data]);

  // Mail-per-month chart data (last 12 months)
  const chartMonths = useMemo(() => {
    const parsed = (monthAgg || []).map(({key, total}) => {
      const parts = String(key || '').split('-');
      const yy = Number(parts[0] || 0); const mm = Number(parts[1] || 1);
      return { date: new Date(yy, (mm||1)-1, 1), total: total||0 };
    }).sort((a,b)=>a.date-b.date);
    return parsed.slice(-12);
  }, [monthAgg]);
  const chartMax = useMemo(() => chartMonths.reduce((m,x)=> Math.max(m, x.total||0), 0) || 1, [chartMonths]);

  // This week & next week reminders
  const weekBounds = (start) => ({ start: startOfWeek(start, { weekStartsOn: 1 }), end: endOfWeek(start, { weekStartsOn: 1 }) });
  const thisWeek = weekBounds(today);
  const nextWeek = weekBounds(addDays(today, 7));
  const nextNextWeek = weekBounds(addDays(today, 14));
  const inRange = (d, range) => isWithinInterval(d, range);
  const classifyWeek = (d) => inRange(d, thisWeek) ? 'this' : inRange(d, nextWeek) ? 'next' : inRange(d, nextNextWeek) ? 'next2' : '';

  const tasksThisWeek = tasks.filter((t) => inRange(t.date, thisWeek));
  const tasksNextWeek = tasks.filter((t) => inRange(t.date, nextWeek));

  // Weekly mail count for the visible month (current month by default)
  const [viewDate, setViewDate] = useState(today);
  const thisMonthRows = useMemo(() => data.filter(r => isSameMonth(r.mailDate, viewDate) && r.hasMail), [data, viewDate]);
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weeksForMonth = useMemo(() => {
    // Build all days in month (Mon-Sun weeks)
    const monthRange = { start: startOfMonth(viewDate), end: endOfMonth(viewDate) };
    const days = eachDayOfInterval(monthRange);
    const weeks = new Map();
    for (const d of days) {
      const wStart = startOfWeek(d, { weekStartsOn: 1 });
      const key = format(wStart, "yyyy-MM-dd");
      if (!weeks.has(key)) weeks.set(key, { start: wStart, end: endOfWeek(d, { weekStartsOn: 1 }), total: 0 });
    }
    for (const r of thisMonthRows) {
      const wStart = startOfWeek(r.mailDate, { weekStartsOn: 1 });
      const key = format(wStart, "yyyy-MM-dd");
      if (weeks.has(key)) weeks.get(key).total += r.count;
    }
    return Array.from(weeks.values()).sort((a, b) => a.start - b.start);
  }, [thisMonthRows, viewDate]);

  const monthlyTotal = useMemo(() => thisMonthRows.reduce((a, b) => a + b.count, 0), [thisMonthRows]);
  const targetMin = 9000, targetMax = 10000;
  const pct = Math.max(0, Math.min(100, (monthlyTotal / targetMax) * 100));
  const inTarget = monthlyTotal >= targetMin && monthlyTotal <= targetMax;

  // Calendar day cell renderer
  const monthDays = useMemo(() => {
    const range = { start: startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(viewDate), { weekStartsOn: 1 }) };
    const days = eachDayOfInterval(range);
    return days.map((d) => {
      const dayTasks = tasks.filter(t => isSameDay(t.date, d));
      return { date: d, tasks: dayTasks };
    });
  }, [viewDate, tasks]);

  // CSV handling
  const loadCsvText = (text) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setRows(res.data);
      },
    });
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (evt) => loadCsvText(String(evt.target?.result || ""));
    reader.readAsText(f);
  };

  const fetchSheet = async () => {
    if (!sheetUrl) return;
    const url = toCsvUrl(sheetUrl);
    try {
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      loadCsvText(text);
    } catch (e) {
      console.error("Failed to load sheet CSV", e);
      alert("Couldn't load the sheet. Make sure it's published to the web (File → Share → Publish to web → CSV), or share it with 'Anyone with the link' and we will try the export URL.");
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-slate-100 text-slate-800">
      <header className="sticky top-0 z-50 backdrop-blur bg-white/70 border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <CalendarDays className="h-6 w-6" />
          <h1 className="text-xl font-semibold">Marketing Schedule Tracker</h1>
          <div className="ml-auto flex items-center gap-2">
            {!USE_FIXED_SOURCE && (
              <label className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-xl border bg-white shadow-sm cursor-pointer">
                <Upload className="h-4 w-4" />
                <span>Upload CSV</span>
                <input type="file" accept=".csv" onChange={onFile} className="hidden" />
              </label>
            )}
            <div className="hidden md:flex items-center gap-2">
              {USE_FIXED_SOURCE ? (
                <div className="text-xs text-slate-500">Source: Fixed Google Sheet — tab: ${FIXED_SHEET_TAB_NAME || 'Default'} ${FIXED_SHEET_GID ? `(gid=${FIXED_SHEET_GID})` : ''}</div>
              ) : (
                <>
                  <Input placeholder="Paste Google Sheet link or CSV link" value={sheetUrl} onChange={(e)=>setSheetUrl(e.target.value)} className="w-80" />
                  <Button onClick={fetchSheet} variant="secondary">Connect</Button>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pb-3 flex flex-wrap gap-3 text-sm">
          <label className="inline-flex items-center gap-2"><input type="checkbox" className="accent-sky-600" checked={showCalendar} onChange={e=>setShowCalendar(e.target.checked)} /> Calendar</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" className="accent-sky-600" checked={showWeeklyTable} onChange={e=>setShowWeeklyTable(e.target.checked)} /> Weekly count</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" className="accent-sky-600" checked={showCampaignTable} onChange={e=>setShowCampaignTable(e.target.checked)} /> Campaign schedule</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" className="accent-sky-600" checked={showCadenceMatrix} onChange={e=>setShowCadenceMatrix(e.target.checked)} /> Cadence matrix</label>
          <label className="inline-flex items-center gap-2 ml-auto"><input type="checkbox" className="accent-sky-600" checked={hidePast} onChange={e=>setHidePast(e.target.checked)} /> Hide past (schedule)</label>
        </div>
      </header>

      {/* Reminder banners */}
      <section className="max-w-7xl mx-auto px-4 py-4 grid md:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-4 w-4"/> This week</CardTitle>
          </CardHeader>
          <CardContent>
            {tasksThisWeek.length === 0 ? (
              <div className="text-sm text-slate-500">No scheduled actions this week.</div>
            ) : (
              <ul className="text-sm space-y-2">
                {tasksThisWeek.map((t, i) => (
                  <li key={i} className="flex items-center gap-2">
                    {t.type === "mail" && <Mail className="h-4 w-4"/>}
                    {t.type === "text" && <MessageSquare className="h-4 w-4"/>}
                    {t.type === "vm" && <Voicemail className="h-4 w-4"/>}
                    {(t.type === "text" || t.type === "vm") && (
                      <input type="checkbox" className="accent-sky-600" checked={doneKeys.includes(t.idKey)} onChange={()=> setDoneKeys(prev => prev.includes(t.idKey) ? prev.filter(k=>k!==t.idKey) : [...prev, t.idKey])} />
                    )}
                    <span className="font-medium whitespace-nowrap">{format(t.date, "EEE, MMM d")}</span>
                    <span className="truncate">— {t.label}</span>
                    {t.stage && ( <Badge variant="secondary" className="ml-1">{t.stage}</Badge> )}
                    {t.type === "mail" && !!t.count && <Badge variant="secondary" className="ml-auto">{t.count.toLocaleString()}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4"/> Next week</CardTitle>
          </CardHeader>
          <CardContent>
            {tasksNextWeek.length === 0 ? (
              <div className="text-sm text-slate-500">No scheduled actions next week.</div>
            ) : (
              <ul className="text-sm space-y-2">
                {tasksNextWeek.map((t, i) => (
                  <li key={i} className="flex items-center gap-2">
                    {t.type === "mail" && <Mail className="h-4 w-4"/>}
                    {t.type === "text" && <MessageSquare className="h-4 w-4"/>}
                    {t.type === "vm" && <Voicemail className="h-4 w-4"/>}
                    {(t.type === "text" || t.type === "vm") && (
                      <input type="checkbox" className="accent-sky-600" checked={doneKeys.includes(t.idKey)} onChange={()=> setDoneKeys(prev => prev.includes(t.idKey) ? prev.filter(k=>k!==t.idKey) : [...prev, t.idKey])} />
                    )}
                    <span className="font-medium whitespace-nowrap">{format(t.date, "EEE, MMM d")}</span>
                    <span className="truncate">— {t.label}</span>
                    {t.stage && ( <Badge variant="secondary" className="ml-1">{t.stage}</Badge> )}
                    {t.type === "mail" && !!t.count && <Badge variant="secondary" className="ml-auto">{t.count.toLocaleString()}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Month bar + target */}
      <section className="max-w-7xl mx-auto px-4 py-2 grid md:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-1">
            <CardTitle className="text-base">{format(viewDate, "MMMM yyyy")} mail total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <div className="text-3xl font-semibold">{monthlyTotal.toLocaleString()}</div>
              <div className="text-xs text-slate-500 pb-1">target 9k–10k</div>
              <Badge variant={inTarget ? "default" : "destructive"} className="ml-auto">{inTarget ? "Within target" : (monthlyTotal < 9000 ? "Below" : "Above")}</Badge>
            </div>
            <div className="mt-3">
              <Progress value={pct} />
            </div>
            <div className="text-xs mt-2 text-slate-500">Mail counts only. Text/VM-only campaigns are excluded from this target by default.</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-1">
            <CardTitle className="text-base">Month selector & view</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm">
            <Button variant="outline" onClick={()=>setViewDate(addDays(startOfMonth(viewDate), -1))}>Prev</Button>
            <div className="font-medium w-40 text-center">{format(viewDate, "MMMM yyyy")}</div>
            <Button variant="outline" onClick={()=>setViewDate(addDays(endOfMonth(viewDate), 1))}>Next</Button>
            <Button variant="secondary" className="ml-auto" onClick={()=>setViewDate(new Date())}>Today</Button>
          </CardContent>
        </Card>
      </section>

      {/* Calendar */}
      {showCalendar && (
      <section className="max-w-7xl mx-auto px-4 pb-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4"/> Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3">
              <div className="text-xs text-slate-600 mb-1">Mail per month (last 12)</div>
              <svg className="w-full h-16" viewBox={`0 0 ${Math.max(1, chartMonths.length*12)} 48`}>
                {chartMonths.map((m,i)=>{
                  const h = Math.round((m.total / chartMax) * 36);
                  const x = i*12 + 2;
                  const y = 40 - h;
                  return (
                    <g key={i}>
                      <rect x={x} y={y} width={8} height={h} rx={1}></rect>
                      <text x={x+4} y={46} fontSize={3} textAnchor="middle">{format(m.date,'LLL')}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="grid grid-cols-7 text-xs font-medium text-slate-500 mb-2">
              {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => <div key={d} className="px-2 py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {monthDays.map(({date, tasks: dayTasks}, idx) => {
                const dim = !isSameMonth(date, viewDate);
                const isToday = isSameDay(date, today);
                const isCurrWeek = isWithinInterval(date, thisWeek);
                return (
                  <div key={idx} className={`rounded-2xl p-2 min-h-[84px] border ${dim ? "bg-white" : "bg-white"} ${isCurrWeek ? "ring-2 ring-sky-400" : ""} ${isToday ? "shadow" : ""}`}>
                    <div className="flex items-center justify-between">
                      <div className={`text-xs ${dim?"text-slate-300":"text-slate-700"}`}>{format(date, "d")}</div>
                      {isToday && <Badge className="text-[10px]" variant="secondary">Today</Badge>}
                    </div>
                    <div className="mt-1 space-y-1">
                      {dayTasks.slice(0,3).map((t,i)=> (
                        <div key={i} className="flex items-center gap-1 text-[11px] truncate">
                          {t.type === "mail" && <Mail className="h-3 w-3"/>}
                          {t.type === "text" && <MessageSquare className="h-3 w-3"/>}
                          {t.type === "vm" && <Voicemail className="h-3 w-3"/>}
                          <span className="truncate">{t.ref.campaign}{t.ref.part ? " • " + t.ref.part : ""}{t.ref.batch ? " • " + t.ref.batch : ""}</span>
                          {t.type === "mail" && !!t.ref.count && <span className="ml-auto text-slate-500">{t.ref.count.toLocaleString()}</span>}
                        </div>
                      ))}
                      {dayTasks.length>3 && <div className="text-[11px] text-slate-500">+{dayTasks.length-3} more…</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>
      )}

      {/* Weekly mail table */}
      {showWeeklyTable && (
      <section className="max-w-7xl mx-auto px-4 pb-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Weekly Mail Count — {format(viewDate, "MMMM yyyy")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">Week (Mon–Sun)</th>
                    <th className="py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {weeksForMonth.map((w, i) => (
                    <tr key={i} className={`border-b ${isWithinInterval(w.start, thisWeek) ? "bg-sky-50" : ""}`}>
                      <td className="py-2 pr-4">{format(w.start, "MMM d")} – {format(w.end, "MMM d")}</td>
                      <td className="py-2 font-medium">{w.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
      )}

      {/* Campaigns list */}
      {showCampaignTable && (
      <section className="max-w-7xl mx-auto px-4 pb-10">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Filter className="h-4 w-4"/> Campaign schedule</CardTitle>
            <div className="text-sm text-slate-600 mt-1">{hidePast ? "Showing upcoming only" : "Showing all (past + upcoming)"}</div>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" className="accent-sky-600" checked={showCosts} onChange={(e)=>setShowCosts(e.target.checked)} />
                Show cost column (optional)
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" className="accent-sky-600" checked={showCounty} onChange={(e)=>setShowCounty(e.target.checked)} />
                Show county column
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" className="accent-sky-600" checked={hideCompleted} onChange={(e)=>setHideCompleted(e.target.checked)} />
                Hide completed (Text/VM done)
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" className="accent-sky-600" checked={hidePast} onChange={(e)=>setHidePast(e.target.checked)} />
                Hide past schedule
              </label>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Campaign + Part</th>
                    <th className="py-2 pr-4">Batch</th>
                    {showCounty && <th className="py-2 pr-4">County</th>}
                    <th className="py-2 pr-4">Mail?</th>
                    <th className="py-2 pr-4">Text/VM On</th>
                    <th className="py-2 pr-4">Mail Count</th>
                    {showCosts && <th className="py-2 pr-4">Cost</th>}
                  </tr>
                </thead>
                <tbody>
                  {data
                    .slice()
                    .sort((a,b)=>a.mailDate-b.mailDate)
                    .filter(r => !hidePast || r.mailDate >= startToday)
                    .filter(r => {
                      if (!hideCompleted) return true;
                      const follow = r.hasMail ? addDays(r.mailDate,13) : r.mailDate;
                      const tKey = 'text|' + format(follow,'yyyy-MM-dd') + '|' + r.campaign + '|' + r.part + '|' + r.batch;
                      const vKey = 'vm|' + format(follow,'yyyy-MM-dd') + '|' + r.campaign + '|' + r.part + '|' + r.batch;
                      const tDone = !r.hasText || doneKeys.includes(tKey);
                      const vDone = !r.hasVM || doneKeys.includes(vKey);
                      return !(tDone && vDone);
                    })
                    .map((r, i) => {
                      const follow = r.hasMail ? addDays(r.mailDate,13) : r.mailDate;
                      const wk = classifyWeek(r.mailDate);
                      let rowColor = wk==='this' ? 'bg-yellow-50' : wk==='next' ? 'bg-green-50' : wk==='next2' ? 'bg-blue-50' : '';
                      if (!r.hasMail) rowColor = 'bg-red-50';
                      // Compose Campaign + Part name
                      let name = String(r.campaign||'').replace(/\s*-\s*/g,' ').trim();
                      const partStr = String(r.part||'');
                      let letter = '';
                      for (let k=0; k<partStr.length; k++) { const ch = partStr[k].toUpperCase(); if (ch>='A' && ch<='Z') { letter = ch; break; } }
                      if (letter && !new RegExp('\\b'+letter+'\\b','i').test(name)) name += ' ' + letter;
                      const batchNum = r.batchNum ?? '';
                      return (
                        <tr key={i} className={"border-b " + rowColor}>
                          <td className="py-2 pr-4 whitespace-nowrap">{format(r.mailDate, "EEE, MMM d, yyyy")}</td>
                          <td className="py-2 pr-4">{name}</td>
                          <td className="py-2 pr-4">{batchNum}</td>
                          {showCounty && <td className="py-2 pr-4">{r.raw.County || ''}</td>}
                          <td className="py-2 pr-4">{r.hasMail ? <Badge>Mail</Badge> : <Badge variant="destructive">No Mail</Badge>}</td>
                          <td className="py-2 pr-4 whitespace-nowrap"><div className="flex items-center gap-2"><span>{format(follow, "EEE, MMM d")}</span>{r.hasText && <MessageSquare className="h-3 w-3" />}{r.hasVM && <Voicemail className="h-3 w-3" />}</div></td>
                          <td className="py-2 pr-4">{r.hasMail ? r.count.toLocaleString() : ''}</td>
                          {showCosts && <td className="py-2 pr-4">{r.hasMail ? currency(r.cost) : ''}</td>}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
      )}

      {/* Cadence matrix */}
      {showCadenceMatrix && (
      <section className="max-w-7xl mx-auto px-4 pb-8">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cadence matrix (first 5 batches by campaign & part)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">Campaign + Part</th>
                    <th className="py-2 pr-4">Total Count</th>
                    <th className="py-2 pr-4">1st Batch</th>
                    <th className="py-2 pr-4">2nd Batch</th>
                    <th className="py-2 pr-4">3rd Batch</th>
                    <th className="py-2 pr-4">4th Batch</th>
                    <th className="py-2 pr-4">5th Batch</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const groups = new Map();
                    for (const r of data) { let base = String(r.campaign || '').trim();
                      const idx = base.lastIndexOf(' - ');
                      if (idx > -1 && idx + 3 <= base.length) {
                        const suf = base.slice(idx + 3).trim();
                        const C = suf.toUpperCase();
                        if (suf.length === 1 && C >= 'A' && C <= 'Z') base = base.slice(0, idx);
                      }
                      let letter = '';
                      const p = String(r.part || '');
                      for (let i = 0; i < p.length; i++) { const ch = p[i].toUpperCase(); if (ch >= 'A' && ch <= 'Z') { letter = ch; break; } }
                      const key = letter ? (base + ' - ' + letter) : base;
                      if (!groups.has(key)) groups.set(key, []);
                      groups.get(key).push(r);
                    }
                    const rows = Array.from(groups.entries()).map(([key, arr]) => {
                      const sorted = arr.slice().sort((a,b)=>a.mailDate-b.mailDate);
                      const dates = sorted.map(x=>format(x.mailDate, "M/d/yyyy"));
                      const total = sorted.reduce((s,x)=>s+(x.count||0),0);
                      return { key, total, d1: dates[0]||"", d2: dates[1]||"", d3: dates[2]||"", d4: dates[3]||"", d5: dates[4]||"" };
                    }).sort((a,b)=>a.key.localeCompare(b.key));
                    return rows.map((row,i)=> (
                      <tr key={i} className="border-b">
                        <td className="py-2 pr-4">{row.key}</td>
                        <td className="py-2 pr-4">{row.total.toLocaleString()}</td>
                        <td className="py-2 pr-4">{row.d1 ? (<span className={'px-1 rounded ' + (function(){ const d = tryParseDate(row.d1) || new Date(0); const wk = classifyWeek(d); return wk==='this'?'bg-yellow-100':(wk==='next'?'bg-green-100':(wk==='next2'?'bg-blue-100':'')); })()}>{row.d1}</span>) : ''}</td>
                        <td className="py-2 pr-4">{row.d2 ? (<span className={'px-1 rounded ' + (function(){ const d = tryParseDate(row.d2) || new Date(0); const wk = classifyWeek(d); return wk==='this'?'bg-yellow-100':(wk==='next'?'bg-green-100':(wk==='next2'?'bg-blue-100':'')); })()}>{row.d2}</span>) : ''}</td>
                        <td className="py-2 pr-4">{row.d3 ? (<span className={'px-1 rounded ' + (function(){ const d = tryParseDate(row.d3) || new Date(0); const wk = classifyWeek(d); return wk==='this'?'bg-yellow-100':(wk==='next'?'bg-green-100':(wk==='next2'?'bg-blue-100':'')); })()}>{row.d3}</span>) : ''}</td>
                        <td className="py-2 pr-4">{row.d4 ? (<span className={'px-1 rounded ' + (function(){ const d = tryParseDate(row.d4) || new Date(0); const wk = classifyWeek(d); return wk==='this'?'bg-yellow-100':(wk==='next'?'bg-green-100':(wk==='next2'?'bg-blue-100':'')); })()}>{row.d4}</span>) : ''}</td>
                        <td className="py-2 pr-4">{row.d5 ? (<span className={'px-1 rounded ' + (function(){ const d = tryParseDate(row.d5) || new Date(0); const wk = classifyWeek(d); return wk==='this'?'bg-yellow-100':(wk==='next'?'bg-green-100':(wk==='next2'?'bg-blue-100':'')); })()}>{row.d5}</span>) : ''}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
      )}

      <footer className="text-center text-xs text-slate-500 pb-8">Built for CGM Land — mail every Tuesday, text & voicemail +13 days. ✉️💬🎙️</footer>
    </div>
  );
}
