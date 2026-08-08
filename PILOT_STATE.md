# Sibyl Pilot — Session State

Read this together with `PILOT_PLAYBOOK.md` before continuing. Updated 2026-08-08 (later the
same day): **P4 Inc 4–6 are built, QA'd and deployed.** Next: **Inc 7 — pitch polish + record
the demo.** After Phase 4: course close-out (D09 pitch + D10 submission).

⚠ 2026-08-08 lesson: TWO sessions edited this folder in parallel for a while (this one +
"Sibyl pilot demo UI"). Reconciled — Inc 5 committed at `c9f1e3b` (with the other session's
Inc 4 polish), Inc 6 at `f488921`. Keep it to ONE session at a time.

## ▶ START HERE — where things stand

**Two fully independent streams:**

| Stream | Folder | Repo | Link | State |
|---|---|---|---|---|
| Course submission (FROZEN) | `../agentic-ai-capstone-develop-companion-v0.3` | `Inbalbenyehudaa/sibyl` | inbalbenyehudaa.github.io/sibyl/ | Frozen at `2a5f08e`. NEVER touched until submitted. D09+D10 remain; Week 8 deadline. |
| Pilot (this folder) | `sibyl-pilot` | `Inbalbenyehudaa/sibyl-pilot` | inbalbenyehudaa.github.io/sibyl-pilot/ | P0–P3 ✅ · **P4 Inc 0–6 ✅ live-QA'd + deployed** · §56+§57 agent fixes ✅ · **431 checks green** · five-for-five evals ✅ 2026-08-08 |

**Eval status: ⚠ OPEN DEBT (2026-08-08, third round).** Timeline: five-for-five passed on the
§56+§57 Sonnet build → Stage 2 moved to **Opus 5** (`8efd457`) + §58 parse fix (`3978cd0`) →
**five-for-five passed AGAIN on the Opus 5 + §58 build (user-confirmed 2026-08-08)** → then,
on the user's instruction, a **COMMUNICATION STYLE section was added to `sibyl_prompt.md`**
(after CONTEXT; tone: direct/concise, metrics-first, no per-deal confidence percentages, no
technical jargon; 7x9 cap raised 14,000→14,500 for it). Per the prompt-change rule this
requires a **live five-eval re-run — NOT YET DONE.** Watch item on that run: "avoid technical
jargon" vs the mandatory citation tags — if citations drop, that bullet is the suspect. The
stub saga and the field-count saga remain closed (below).

## Phase 4 — the Pilot view (IN PROGRESS)

**The plan of record** (user-approved, all mapping decisions + flag resolutions recorded):
`~/.claude/plans/users-inbalbenyehudam-downloads-sibyl-d-bubbly-honey.md`. The Lovable
prototype source is `~/Downloads/Sibyl Demo UI.zip` (its scratchpad extraction is gone — the
plan + contract capture everything needed). Design language: `../DESIGN.md` → `design/TOKENS.css`.

**The API contract**: `PILOT_CONTRACT.md` (v1) — `buildPilotModel()` derived view-model.
Numbers from `computeWalkUp`/tables only; model prose unparsed; null on no-run/error/refusal/
blocked; hydrated runs recompute the walk. Additive changes free; renames bump v2 + harness §35.

**Done and live-QA'd by the user (Inc 0–3):**
- **Inc 0** — `ACTIVE_TAB` layer ABOVE the console (`selectTab`; `#consoleRoot` wrapper swaps
  the whole 3-panel surface + `#worldcheckRoot` + `#retentionNote`; `renderDealGate()` got one
  appended `renderPilot()` line — its 3-view logic untouched). Topbar `#topTabs` segmented pill
  (`.tabs`/`.tab` recipe in TOKENS.css). NO new case card (21i's exactly-10 stands); NOT a 4th
  panel (21f's exactly-3 stands).
- **Inc 1** — hero drift story: `#pilotHero` (meta + Draft/Revised pill, 56px headline "Your
  team says $662.9K…", stat band bottoms-up / **Suggested forecast** / signed drift,
  **"Attainment gap to target"** bar = Closed Won $445,679 vs quota $1,015,446 from
  `topdown_metrics.csv`). Money abbreviated via `moneyShort()` (K/M/B) on the pilot surface
  ONLY — console keeps exact figures.
- **Inc 2** — sticky **"Forecast walk-up"** panel (`#pilotMain` grid 430px + right column;
  sticky only ≥1101px — in stacked layout sticky rode over the sections, fixed): Commit/Best
  case (strong weight), five component rows, pending-recalc notice, Re-calculate
  (`runMayaRecalc`), **Submit** (`gateApprove` → "Submitted", mirrors console gate), ONE
  formatted `forecast_notes` box (**read-mode with bold `**subtitles**` via `pilotFormatInto`,
  Edit/Done toggle, state in `PILOT_NOTES` keyed per run**), magenta `sibyl_reading` advisory
  (same formatting), notes region scrolls at 52vh, 15px/1.55 type.
- **Inc 3** — section "01 · Per-deal review": collapsible rep groups (`PILOT_REPS_OPEN`,
  `pilotToggleRep`), commit sums, challenged chips, deal table with verdict chips (CHALLENGE
  UP indigo / DOWN ruby / INSUFFICIENT amber / Confirm), your-call column with pending-recalc
  marker. Subtitle (QA'd copy): "Open a rep to see each open deal, the reviewer's verdict and
  your call."
- Retention note: console-only, copy "Pilot mode is a real deployment that stores runs and
  your decision log for a full feedback loop." Pilot tab hides settings/worldcheck.

**Done since (all live-QA'd + deployed, 2026-08-08):**
- **Inc 4 — deal drawer ✅** (`b58b69d` + polish in `c9f1e3b`): row click → slide-over, 9
  reading fields exact 1:1 (labels written out via `PILOT_FIELD_LABELS`), approve /
  edit-category / escalate through `dealApprove`/`dealEdit`/`dealEscalate` — one `DEAL_GATE`,
  both UIs mirror; success feedback = bottom-right toasts (`pilotToast`), errors inline;
  scrim / Close / Escape dismiss. Contract additive: `readingFields`.
- **Inc 5 — reconciliation + record + chase list ✅** (`c9f1e3b`, QA pass `9fa1ae4`,
  parser fix `b4d01b6`): draft-vs-submitted tiles (no Actual, no narrative, no caption);
  win-rate card per QA'd template ("2 Maya wins · 4 draft wins · 1 open", indigo surface,
  magenta rate bar); disagreement register COLLAPSIBLE (scales SVG + description, collapsed
  default, Draft column/values renamed **Sibyl**); chase list LAST, **deal-anchored parsing**
  (`pilotChaseRows`/`pilotDealInText`: dash/colon split → open-deal name anchor + "(rep)" →
  short hyphen lead → whole line; link ONLY on an explicit open-deal ID/exact name → opens
  the drawer). Contract additive: `record.register`, `record.reconciliation`. Sections 64px
  apart.
- **Inc 6 — Friday entry card ✅** (`f488921`, built in the parallel session): #forecast-maya
  card gates the dashboard (`PILOT_ENTERED`), forecast_notes headline as subtitle, three
  tiles when a run exists, "Review forecast" reveals; restored-run pill.

**Remaining:**
- **Inc 7 — pitch polish** + record the demo (typography/spacing/copy pass, walk the story:
  Friday card → drift story → deal drill-down → recalc → submit gate).

**Pilot-view plumbing facts:** `renderPilot()` runs inside `renderDealGate()` (12 call sites →
mirrors every state change incl. recalc/hydration). Markup shells in `tools/build_index.py`
(`#viewPilot` > `.pilot-wrap` > `#pilotEmpty`/`#pilotHero`/`#pilotMain`(`#pilotPanel`+
`#pilotSections`)); all logic in `tools/agent_block.js` PHASE 4 section (file end); pilot CSS
token-only in build_index's own style block + `.tabs` recipe in TOKENS.css.

## §58 (2026-08-08 later) — Opus 5's first run vs the label parser

First run on `claude-opus-5` wrote the WRITE list as middle-dot-numbered Markdown headings
(`## 1 · failed_checks_banner`) with merged pairs (`## 2 · suggested_forecast,
suggested_best_case`) → 4 of 13 parsed. Fixed both layers (`3978cd0`): the label peel now
strips `N ·`-style numbering (check 7x13 pins the live shape), and the three `WALK_UP_*`
footers state the format contract (one label per line, never numbered/merged/headed) — check
7g's ending updated. **The five-eval re-run covers Opus 5 + these footers together.**
Check total now 434.

## The §56/§57 agent fixes (2026-08-07/08) — both live-validated

Full records: **SIBYL_BUILD_STATE.md §56 and §57** (local file, gitignored in this repo) and
Claude's memory (`sibyl-stub-call-saga`). Summary:
- **§56 (stub round six)**: merge-aware rationale gate — per-turn bank in `callSibyl`, partial
  corrections patch over banked reasoning, rejection names only what's missing; best-case pool
  pre-flight in `buildSibylMessage`; post-FINAL calls echoed (`WALK_UP_STANDS`), never
  recomputed. F4 (Opus for the Sibyl turn) deliberately declined — Sonnet's first call now
  computes clean.
- **§57 (two fields never arrived)**: the payload/footers still said "eleven … Field 11" from
  before the 13-item prompt restructure — model obeyed the stale copy. All runtime count words
  purged (WRITE-list language, field 13 named); `computeWalkUp` now returns `perRep` + the
  walk-up text prints `suggested_best_case:` — fields 3 and 8 are calculator QUOTES.
- **THE RULE**: the field contract lives in TWO places — `sibyl_prompt.md` AND the runtime
  strings (`buildSibylMessage`, `WALK_UP_DONE/FINAL/STANDS`, revision header). Every contract
  change greps both in the same commit. Checks 7x10 (prompt) + 7x11 (runtime) enforce it.

## Operational rules (updated)

- Before ANY commit: `git remote -v` must say `sibyl-pilot.git`.
- Edit `tools/agent_block.js` / `tools/build_index.py`, never `index.html`; rebuild
  `python3 tools/build_index.py`; data/policy/prompt edits → `python3 sync_assets.py`;
  TOKENS.css needs the full rebuild. `node tools/verify_static.js` green at every step —
  **current total 431** (report changes). New harness symbols go in BOTH the `globalThis.__X`
  string AND the destructure.
- Pilot checks: 21p/21q/21r (tabs), 35a–35w (contract + panel + deals + drawer + recon/chase;
  35f/35f2 = entry card), 7w2/7w3/7z2 (§56), 7x11/7x12 (§57).
- Any system-prompt/policy/model/data change **or agent-visible runtime-text change** → live
  five-eval re-run (user runs; ~19 calls).
- `sibyl_prompt.md` cap: 14,000 chars (7x9). Ports: submission 8931, pilot 8941 (launch config
  `sibyl-pilot` in `../.claude/launch.json`). Deploys: push to main → Actions (~2 min) →
  cache-busted curl for a marker string. `.env` untracked, holds all secrets.
- Harness DOM stub creates elements lazily — new visibility checks need one `selectTab`/render
  pass first (see the 21h baseline comment).

## After Phase 4 — course close-out (frozen stream, separate session context)

- D09: user pitches the 4-minute video out loud (outline = row 7 of `../PRD/Sibyl Deploy
  PRD.md`; rehearsal beat-sheet delivered 2026-08-06); Claude critiques rambling/overclaiming/
  story-loss, drills the weak 30s.
- D10: three FINAL checks in `../PRD/Sibyl Deploy PRD.md`, then submission: PRD sheet shared
  with faculty as Editor, video uploaded, Masterfile row with BOTH links, click-verify both.
  **Week 8 deadline.**
- The submission repo/folder stays frozen until submitted.

## Parked (carry into any PRD rewrite)

Unchanged from the previous session (see `PILOT_PLAYBOOK.md` § Parked decisions): `.csv`
source names stay in prompts; recalc flow decisions of record; backlog eval case #6 (the
revision run). New: backlog eval case #7 candidate — the §57 shape (all 13 fields arrive; 8
quotes the per-rep rows) is currently pinned by checks + one live pass, not an eval case.
