# Sibyl Pilot — Session State

Read this together with `PILOT_PLAYBOOK.md` before continuing. Written 2026-08-08 at the end of
the Phase-4 build session (pilot UI Inc 0–3 + the §56/§57 agent fixes). **Next session:
continue Phase 4 at Inc 4 (the deal drawer), then Inc 5–7. After Phase 4: course close-out
(D09 pitch + D10 submission).**

## ▶ START HERE — where things stand

**Two fully independent streams:**

| Stream | Folder | Repo | Link | State |
|---|---|---|---|---|
| Course submission (FROZEN) | `../agentic-ai-capstone-develop-companion-v0.3` | `Inbalbenyehudaa/sibyl` | inbalbenyehudaa.github.io/sibyl/ | Frozen at `2a5f08e`. NEVER touched until submitted. D09+D10 remain; Week 8 deadline. |
| Pilot (this folder) | `sibyl-pilot` | `Inbalbenyehudaa/sibyl-pilot` | inbalbenyehudaa.github.io/sibyl-pilot/ | P0–P3 ✅ · **P4 Inc 0–3 ✅ live-QA'd** · §56+§57 agent fixes ✅ · **421 checks green** · five-for-five evals ✅ 2026-08-08 |

**Eval status: five-for-five passed LIVE on 2026-08-08 on the §56+§57 build** (EC-1/3/4/5 then
EC-2). No eval debt. The stub saga and the field-count saga are both closed (below).

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

**Remaining increments (pause for user QA after each; each = rebuild → harness green → live QA
→ commit):**
- **Inc 4 — deal drawer**: slide-over on row click with the 9 reading fields (exact 1:1) +
  approve / edit-category / escalate wired to `recordDealDecision`-family (`dealApprove`/
  `dealEdit`/`dealEscalate`, agent_block ~3166+) — same `DEAL_GATE`, same persistence; both
  UIs mirror. DONE-WHEN: a call in the Pilot drawer appears in the console deal view and (live
  mode) in `sibyl_pilot_decisions`.
- **Inc 5 — reconciliation + record + chase list**: draft-vs-submitted tiles (NO "Actual"
  tile, NO narrative lines — user decisions), disagreement register + override win-rate dark
  card from `decisionStats()` (real: 6 resolved, draft 4, Maya 2, 33%, 1 open DL-0007),
  chase-list table (field 10) as the LAST page section. Evals stay OUT of Pilot.
- **Inc 6 — entry pre-run state**: Slack-style "#forecast-maya · Friday" card as the pre-run
  state; subtitle under the headline = the `forecast_notes` headline (user-requested); tiles
  (delta / drift / challenged) only when hydrated data exists; REVISED-state mirroring;
  restored-run handling.
- **Inc 7 — pitch polish** + record the demo.

**Pilot-view plumbing facts:** `renderPilot()` runs inside `renderDealGate()` (12 call sites →
mirrors every state change incl. recalc/hydration). Markup shells in `tools/build_index.py`
(`#viewPilot` > `.pilot-wrap` > `#pilotEmpty`/`#pilotHero`/`#pilotMain`(`#pilotPanel`+
`#pilotSections`)); all logic in `tools/agent_block.js` PHASE 4 section (file end); pilot CSS
token-only in build_index's own style block + `.tabs` recipe in TOKENS.css.

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
  **current total 421** (report changes). New harness symbols go in BOTH the `globalThis.__X`
  string AND the destructure.
- Pilot checks: 21p/21q/21r (tabs), 35a–35n (contract + panel + deals section), 7w2/7w3/7z2
  (§56), 7x11/7x12 (§57).
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
