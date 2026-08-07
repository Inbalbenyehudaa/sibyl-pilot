# Sibyl Pilot — Session State

Read this together with `PILOT_PLAYBOOK.md` before continuing. Written 2026-08-07 at the end of the fork/backend/prompt-22 session. **Next session: plan Phase 4 (the Pilot view) in detail, then execute it. After that: course close-out (D09 pitch + D10 submission).**

## ▶ START HERE — where things stand

**Two fully independent streams:**

| Stream | Folder | Repo | Link | State |
|---|---|---|---|---|
| Course submission (FROZEN) | `../agentic-ai-capstone-develop-companion-v0.3` | `Inbalbenyehudaa/sibyl` | inbalbenyehudaa.github.io/sibyl/ | Frozen at `2a5f08e`. NEVER touched until the course is submitted. D09+D10 remain; Week 8 deadline. |
| Pilot (this folder) | `sibyl-pilot` | `Inbalbenyehudaa/sibyl-pilot` | inbalbenyehudaa.github.io/sibyl-pilot/ | Phases 0–3 ✅ done, live-verified, **zero known bugs, zero debts**. 398 static checks green. |

**Phases 0–3 (all done, all live-verified by the user):**
- P0: fork with full history + `pilot-baseline` tag; Pages needed `.nojekyll`, then legacy builds kept hanging → **deploys now go through GitHub Actions** (`.github/workflows/pages.yml`, ~2 min; the legacy pipeline is dead, don't revisit).
- P1: data-source seam — `buildDataStore(sources)` / `applyDataStore(store)`; `resolveDataMode()` = embedded everywhere except the pilot Pages origin (or `?source=api`); loud fallback banner; topbar badge `Embedded` / `Live: Supabase`.
- P2: Supabase backend — dedicated project (creds in local untracked `.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL` session-pooler, `SIBYL_WRITE_TOKEN`). Tables `sibyl_src_*` (8 CSVs, 969 rows) + `sibyl_text_assets` + append-only `sibyl_pilot_decisions` + `sibyl_config`; RLS: anon read, insert gated on `x-write-token` header via security-definer check; RPC `sibyl_sources()` re-serializes tables to the exact embedded-constants payload shape. `tools/schema.sql` + `tools/etl_load.py` + `tools/verify_sources_roundtrip.py` (all idempotent). **eval_cases.csv is never in the DB or the API.**
- P3: the prompt-22 loop — see design decisions below. Persistence (runs snapshot + `maya_category` + `human_action` rows), retention notice with stored-count, reload hydration.

**Eval status:** five-for-five passed live THREE times on 2026-08-07 — after the data scrub, after the revision-run prompt rule, and after the WRITE-list restructure. `[Maya]` routing confirmed live. No eval debt.

## The prompt-22 loop — decisions of record (all user-confirmed)

- Maya's call = separate manager-category record (append-only; reviewer category never overwritten; latest-per-deal wins at hydration).
- Recalc precedence **Maya > reviewer > rep** — Sibyl's overrides deliberately NOT in the ladder (the recalc is a counter-walk-up). `finalCategoryOf()` untouched; merge in `mayaDecisions()`.
- Component 03: inherit Sibyl's named list; Maya's edits win; moved-in deals join the pool but are NOT auto-counted.
- The redraft = **full Sibyl call with categories pinned** (`callSibyl(..., {pinned})`: one correction hand-back, then forced substitution; stub gate skipped; call-again invitation silenced).
- **Stateless by Design PRD row 6**: the revision message is a decisions-log reload — original categories quoted as logged facts, delta named (`CHANGED`/unchanged + REVISION FOCUS). Conversation continuation was considered and REJECTED (violates the PRD memory decision).
- Display model C: page enters REVISED state (band, headline, change markers); gate MOVES to the revision; original draft preserved. On success only `#mayaRecalcOut` populates (notes; walk-up lives in the revised draft above; advisory refreshed in its own box). On failure the walk-up renders in the notes box under the error.
- Divergence surfaces are amber "PENDING RECALC" pointing at the button; they clear after recalc via `LAST_APPLIED`.

## Bugs fixed this session (the pattern: count/bundling literalism)

1. Missing `team_bottoms_up_total` + `drift`: root cause was the SYSTEM prompt — "eleven labelled output fields" with labels BUNDLED into shared numbered items (drift was the trailing label of item 4). Fix: **13 items, one label per line, no count word**; quote-only boundary renumbered 1–10 → **1–12** everywhere (`sibyl_reading` = 13). Check 7x10 pins this. `drift = total − bottomsUp` — it CHANGES with Maya's calls (user caught my wrong invariance claim).
2. Revision amnesia: model never saw its original run → decisions-log reload (above).
3. API overload: `postMessages` retries 429/500/529 twice (4s/12s), visible in the status band.
4. Recalc UX: no interim render (notes-ready or nothing), no advisory duplication, walk-up box removed.

## Operational rules (unchanged + new)

- Before ANY commit: `git remote -v` must say `sibyl-pilot.git`.
- Edit `tools/agent_block.js`, never `index.html`; rebuild `python3 tools/build_index.py`; data/policy/prompt edits → `python3 sync_assets.py`; TOKENS.css needs the full rebuild. `node tools/verify_static.js` green at every step — **current total 398** (report changes).
- Any system-prompt/policy/model/data change → live five-eval re-run (user runs; ~19 calls).
- `sibyl_prompt.md` cap: **14,000 chars** (currently 13,879; 7x9). Next raise needs a reason.
- Ports: submission 8931, pilot 8941; both defined in `../.claude/launch.json` (project level — that's the one the preview tool reads).
- Deploys: push to main triggers the Actions workflow; verify with a cache-busted curl for a marker string.
- `.env` is untracked and holds all secrets incl. the write token; never in chat, never committed.

## Phase 4 — what the next session plans in detail

Goal: a polished "Pilot" tab (product-grade, not exercise-grade). Existing sketch in `PILOT_PLAYBOOK.md` P4.1–P4.5 + content backlog. Facts the planning needs:
- Views today: NO tabs/router — three sibling divs (`#viewSubmission`/`#viewDeal`/`#viewEvals`) display-toggled in `renderDealGate()` keyed on `SELECTED_CASE`; topbar is status-only. P4.1 = refactor to a VIEWS map first (smallest safe change).
- Harness fixtures that WILL bite: check 21i asserts EXACTLY 10 case cards (Pilot must be a header tab, not a card); 21j/21k/28y assert other-views-hidden (extend symmetrically); IDS array; export lists; new total documented.
- Design system: `/Users/inbalbenyehudam/Private/context-directory/DESIGN.md` (Stripe-like: indigo #533afd, navy ink, Söhne w300 negative tracking, tnum, nav-bar/pill/mesh recipes) implemented by `design/TOKENS.css` (inlined only by full rebuild; `data-skin="studio"` locked).
- Likely hero content: the Maya recalc loop as the primary surface; Friday-ritual guided flow; stored-decisions history (reads `sibyl_pilot_decisions`); WoW trend from persisted runs.
- User said they'll spend most of their iteration time here — plan for many small paste-able prompts, not one big build.

## After Phase 4 — course close-out (frozen stream, separate session context)

- D09: user pitches the 4-minute video out loud (outline = row 7 of `../PRD/Sibyl Deploy PRD.md`; rehearsal beat-sheet was delivered in-session 2026-08-06); Claude critiques rambling/overclaiming/story-loss, drills the weak 30s.
- D10: three FINAL checks in `../PRD/Sibyl Deploy PRD.md` (currently `[pending]`), then submission: PRD sheet shared with faculty as Editor, video uploaded, Masterfile row with BOTH links (PRD + live URL), click-verify both. **Week 8 deadline.**
- The submission repo/folder stays frozen until submitted. Any late fix goes there ONLY deliberately and re-verifies the live link.

## Parked (carry into any PRD rewrite)

See `PILOT_PLAYBOOK.md` § Parked decisions: `.csv` source names stay in prompts (logical identifiers; provenance is the UI badge); recalc flow decisions of record; backlog eval case #6 (the revision run: override two categories → revision engages the delta and registers original positions).
