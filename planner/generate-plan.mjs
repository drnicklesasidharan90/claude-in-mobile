#!/usr/bin/env node
// Merges the duty roster CSV with shift-aware USMLE study prescriptions and
// emits an integrated day-by-day plan as markdown.
//
// Usage:
//   node planner/generate-plan.mjs                 # prints to stdout
//   node planner/generate-plan.mjs --write         # writes july-2026-integrated-plan.md
//   node planner/generate-plan.mjs path/to.csv     # alternate roster file
//
// Shift codes (case-insensitive) in the roster CSV:
//   D   = day duty          E   = evening duty      N   = night duty
//   OFF = off day           L   = leave/rest        TBD = not yet filled in

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const write = args.includes("--write");
const csvPath = args.find((a) => !a.startsWith("--")) ?? join(here, "july-2026-roster.csv");

// Study prescription per shift type. Hours are the realistic study budget for
// that day — the weekly totals below are computed from these.
const PLANS = {
  D: {
    label: "Day duty",
    hours: 3,
    items: [
      "Breaks on duty: Anki/Picmonic reviews, 30 min total",
      "Evening: 1 timed Qbank block (40 Q)",
      "Evening: full review of the block + error log, 60 min",
    ],
  },
  E: {
    label: "Evening duty",
    hours: 3.5,
    items: [
      "Morning (fresh): 1 timed Qbank block (40 Q) + full review, 2.5 h",
      "Late morning: Anki/Picmonic reviews, 45 min",
      "No study after shift — protect sleep",
    ],
  },
  N: {
    label: "Night duty",
    hours: 0.75,
    items: [
      "Quiet hours only: Anki/Picmonic reviews, max 45 min",
      "No new content and no Qbank tonight — retention is near zero",
      "Tomorrow is auto-planned as a recovery day",
    ],
  },
  OFF: {
    label: "Off day (deep work)",
    hours: 6.5,
    items: [
      "Block 1: 2 timed Qbank blocks (80 Q) back-to-back, exam-style",
      "Block 2: full review + error log, 2 h",
      "Block 3: content on this week's system (AMBOSS/notes), 1.5 h",
      "Anki: full review queue",
    ],
  },
  L: {
    label: "Leave",
    hours: 4,
    items: [
      "Lighter deep-work day: 1 timed Qbank block + full review",
      "Content on this week's system, 1 h",
      "Anki: full review queue",
    ],
  },
  TBD: {
    label: "Shift not filled in",
    hours: 3,
    items: [
      "Default moderate plan: 1 timed Qbank block + review + Anki",
      "Fill this day's shift in july-2026-roster.csv and re-run the generator",
    ],
  },
};

// The day after a night shift overrides the normal prescription.
const POST_NIGHT = {
  label: "Post-night recovery",
  hours: 2.5,
  items: [
    "Sleep until at least noon — do not trade sleep for questions",
    "Afternoon: 1 untimed Qbank block (40 Q) on the current weak subject",
    "Evening: error-log review only, 45 min",
  ],
};

function parseRoster(text) {
  const rows = text.trim().split(/\r?\n/).slice(1); // drop header
  return rows.filter(Boolean).map((line) => {
    const [date, weekday, shift, ...rest] = line.split(",");
    return {
      date: date.trim(),
      weekday: weekday.trim(),
      shift: (shift ?? "TBD").trim().toUpperCase() || "TBD",
      notes: rest.join(",").trim(),
    };
  });
}

function planFor(day, prevDay) {
  const postNight = prevDay?.shift === "N" && day.shift !== "N";
  if (postNight && day.shift !== "OFF" && day.shift !== "L") {
    return { ...POST_NIGHT, label: `${PLANS[day.shift]?.label ?? day.shift} → ${POST_NIGHT.label}` };
  }
  const base = PLANS[day.shift] ?? PLANS.TBD;
  if (postNight) {
    // Off day straight after a night: keep the deep work but cap it.
    return {
      label: `${base.label} (post-night: start after noon)`,
      hours: Math.min(base.hours, 4),
      items: ["Sleep first — begin studying after noon", ...base.items.slice(0, 3)],
    };
  }
  return base;
}

// Week buckets run Mon–Sun.
function weekKey(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

const roster = parseRoster(readFileSync(csvPath, "utf8"));
const unfilled = roster.filter((d) => d.shift === "TBD").length;

const weeks = new Map();
roster.forEach((day, i) => {
  const plan = planFor(day, roster[i - 1]);
  const key = weekKey(day.date);
  if (!weeks.has(key)) weeks.set(key, []);
  weeks.get(key).push({ day, plan });
});

const out = [];
out.push("# July 2026 — Integrated duty + USMLE schedule");
out.push("");
out.push("_Generated from `july-2026-roster.csv` by `generate-plan.mjs`. Edit the CSV, not this file._");
out.push("");
if (unfilled > 0) {
  out.push(`> ⚠️ ${unfilled} day(s) still marked TBD in the roster. Fill in the real shifts and re-run:`);
  out.push("> `node planner/generate-plan.mjs --write`");
  out.push("");
}
let weekNo = 1;
for (const [monday, entries] of weeks) {
  const total = entries.reduce((s, e) => s + e.plan.hours, 0);
  out.push(`## Week of ${monday} (study target: ~${total} h)`);
  out.push("");
  for (const { day, plan } of entries) {
    const note = day.notes ? ` — _${day.notes}_` : "";
    out.push(`### ${day.date} (${day.weekday}) — ${plan.label}, ~${plan.hours} h${note}`);
    for (const item of plan.items) out.push(`- ${item}`);
    out.push("");
  }
  weekNo++;
}
out.push("---");
out.push("Weekly anchors: one self-assessment every 2–3 weeks on an OFF day; error-log review every Sunday evening.");
out.push("");

const md = out.join("\n");
if (write) {
  const target = join(here, "july-2026-integrated-plan.md");
  writeFileSync(target, md);
  console.log(`Wrote ${target} (${roster.length} days, ${unfilled} TBD)`);
} else {
  console.log(md);
}
