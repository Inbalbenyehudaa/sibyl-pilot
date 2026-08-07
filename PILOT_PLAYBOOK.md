# Sibyl Pilot — The Playbook

The improvement stream, detached from the frozen course submission. Same rhythm as the course kit: one prompt at a time → Claude works → DONE-WHEN / VERIFY → next. Full plan context lives with Claude; this file is the driving order.

**Stream:** this folder → github.com/Inbalbenyehudaa/sibyl-pilot → https://inbalbenyehudaa.github.io/sibyl-pilot/
**Frozen:** `../agentic-ai-capstone-develop-companion-v0.3` → `sibyl` repo → the submission link. Never touched until the course is submitted.

## Golden rules

1. Before any commit: `git remote -v` must say `sibyl-pilot.git`.
2. `node tools/verify_static.js` green at the end of every step (report the check total when it changes).
3. `eval_cases.csv` never enters the DB and is never served by the API — it stays the embedded held-out answer key.
4. Edit `tools/agent_block.js`, never `index.html`; rebuild with `python3 tools/build_index.py`; data/policy/prompt edits → `python3 sync_assets.py`. TOKENS.css edits need the full rebuild.
5. Local server: port **8941** (`sibyl-pilot` config). The submission folder keeps 8931.

---

## Phase 0 — Fork + freeze ✅ (done 2026-08-06)

- P0.1 ✅ Freeze SHA `2a5f08e` recorded; both links live and independent.
- P0.2 ✅ Folder copied with history + build-state docs.
- P0.3 ✅ Ports: 8941/8942.
- P0.4 ✅ Remote → `sibyl-pilot.git`; submission remote untouched.
- P0.5 ✅ Pages live (needed `.nojekyll` — legacy Jekyll build chokes on this repo; keep the file).
- P0.6 ✅ 376 checks green · sync clean · tagged `pilot-baseline`.
- P0.7 ✅ This file.

## Phase 1 — Data-source seam ✅ (done 2026-08-06; check total now 389)

**P1.1 — Lazy citation vocabulary.**
Make `citationVocabulary()` (agent_block.js:623) a memoized function instead of a top-level const; update call sites.
DONE-WHEN: no top-level DATA_FILES/DB read remains outside functions.
VERIFY: rebuild → 376 green; one browser run shows identical citation tags.

**P1.2 — Extract `buildDataStore(sources)`.**
Move the parse block (build_index.py ~820–912: parseCSV/toObjects/parseSignals → DB/RAW_MD/SIGNALS) into one function taking `{data, policies, prompts}`; invoke immediately with the embedded constants.
DONE-WHEN: DB/RAW_MD/SIGNALS produced only by `buildDataStore`; embedded constants its only caller.
VERIFY: rebuild → 376 green; walk-up output identical on a stubbed run.

**P1.3 — `resolveDataMode()`.**
`'embedded'` always (file://, harness), `'api'` via `?source=api` or `localStorage['sibyl_data_mode']`.
DONE-WHEN: mode logged at boot; no behavior change.
VERIFY: rebuild → green; `?source=api` logs `api`.

**P1.4 — Split boot.**
Embedded path stays 100% synchronous (harness tripwire); `bootAsync()` gates the init sequence for api mode only.
DONE-WHEN: zero `await` on the embedded path.
VERIFY: rebuild → 376 green; app loads on :8941.

**P1.5 — Api mode fetch + fallback + badge.**
`fetch` the sources RPC → payload shaped exactly like the embedded constants → `buildDataStore(payload)`. Failure → embedded fallback + banner "Live data unavailable — using embedded snapshot". Topbar badge: `Embedded` / `Live: Supabase`.
DONE-WHEN: `?source=api` without a backend falls back gracefully; default load shows `Embedded`.
VERIFY: rebuild → green (+ new ids in harness); `sync_assets.py --check` clean.

**P1.6 — Harness audit.**
Add `#dataSourceBadge`/`#dataSourceBanner` to the IDS array (verify_static.js:1979); check `buildDataStore(embedded)` yields the same table names; extend export lists (285–345); document the new total.
DONE-WHEN: new seam covered by checks.
VERIFY: harness green at the documented total.

## Phase 2 — Supabase backend ✅ (done 2026-08-07; Pages now deploys via GitHub Actions — legacy builds hung on this repo)

**P2.1 — Tooling + credentials.** `brew install libpq` for psql. Add `.env` to `.gitignore` FIRST; user pastes project URL, anon key, Postgres connection string into `.env` (never committed).
VERIFY: `psql "$SUPABASE_DB_URL" -c 'select 1;'` returns 1; `git status` clean of `.env`.

**P2.2 — `tools/schema.sql`.** `sibyl_`-prefixed tables (deals_current, deals_last_week, forecast_history, rep_accuracy_history, stage_conversion_rates, create_and_close_history, topdown_metrics, decisions_log_seed), `sibyl_text_assets`, append-only `sibyl_pilot_decisions(kind in run|human_action|maya_category, payload jsonb)`, `sibyl_config`. **No eval_cases.** RLS on everything: anon SELECT on sources; INSERT on decisions gated by `x-write-token` request-header check against `sibyl_config`; RPC `sibyl_sources()` (security definer) returning the embedded-constants-shaped JSON with server-side CSV serialization.
VERIFY: re-runnable; `\dt sibyl_*` lists all tables; anon insert without token fails, with token succeeds.

**P2.3 — `tools/etl_load.py`.** psycopg2; truncate+insert one transaction; env-var connection.
VERIFY: counts match `wc -l`; run twice → identical; `select name from sibyl_text_assets` = 5 rows.

**P2.4 — Wire the client.** `SUPABASE_URL`/`ANON_KEY` constants; api mode POSTs `/rest/v1/rpc/sibyl_sources`. Then default api on the sibyl-pilot Pages hostname.
VERIFY: `?source=api` on :8941 → `Live: Supabase`, full run identical to embedded; Pages origin defaults live with working fallback.

## Phase 3 — Persistence + the prompt-22 loop ✅ (done 2026-08-07; check total now 396)

**P3.1 — Retain `s.decisions`** (+ readings) in `LAST_RUN` (today only `s.walk` survives, ~4769).
**P3.2 — Maya precedence.** Maya branch in `finalCategoryOf()` (856–880): Maya > Sibyl > reviewer > rep; real source tag replaces hard-coded `'Sibyl'` (line 1021) → `[Maya]` labels. Zero-override runs byte-identical.
**P3.3 — "Recalculate with my calls".** Merge `DEAL_GATE` categories over `LAST_RUN.decisions` → `computeWalkUp(merged, readings)` → separate labeled panel ("numbers recalculated; narrative reflects Sibyl's original run").
**P3.4 (optional) — Scoped notes redraft** (one model call, forecast-notes field only, labeled).
**P3.5 — Persist in api mode.** `logRun()`/`recordHumanAction()` POST to `sibyl_pilot_decisions` with `x-write-token` (from Settings → localStorage). Non-blocking; embedded mode = zero network.
**P3.6 — Retention honesty.** Ships WITH P3.5: "Pilot mode stores runs and your decisions · [View stored (N)] [What's stored?]" / embedded: "Nothing is stored."
**P3.7 — Hydrate.** Latest-per-deal `maya_category` rows pre-populate the gate on load; recalc survives reload.
VERIFY (phase): edit a category → recalc shows delta with `[Maya]`; reload → hydrated → same result; DB rows visible via psql.

## Phase 4 — Pilot view

**P4.1 — VIEWS map refactor** of the display toggle in `renderDealGate()` (4029–4056); behavior identical (checks 21j/21k/28y untouched).
**P4.2 — Header tabs** (Console | Pilot) per DESIGN.md nav-bar recipe; TOKENS.css → full rebuild.
**P4.3 — `#viewPilot` shell** + harness fixtures (IDS array; NO new case card — 21i's exactly-10 stands; symmetric hidden-view checks; new total documented).
**P4.4 — Polished empty state** from DESIGN.md recipes (mesh hero, pill buttons, tnum stat tiles).
**P4.5 — Pilot content backlog** (below) — open-ended iteration.

### Pilot content backlog (iterate freely)

Prompt template: *"In the Pilot view, [one change]. Use DESIGN.md recipes and TOKENS.css variables only. DONE-WHEN: [visible outcome]. Then rebuild and run the harness."*

- Hero: the Maya recalc loop as the primary surface (her calls, her walk-up, the delta vs Sibyl)
- The Friday ritual as a guided flow (run → review deals → recalc → submit)
- Stored-decisions history view (reads `sibyl_pilot_decisions`)
- Week-over-week trend from persisted runs

## Parked decisions (mention in a future Deploy/Develop PRD rewrite)

- **2026-08-07 · Source names stay `.csv` in prompts/policies.** In live (api) mode the data
  comes from Postgres, but the prompts keep the logical file names: they are *source
  identifiers* (payload keys + the citation vocabulary), not storage claims, and one
  vocabulary stays true in both embedded and live modes. Provenance is a UI concern (the
  topbar badge). Renaming would touch both prompts, both policies, the eval key and the
  citation resolver, and would force a full five-eval re-run — parked as cost without
  judgment benefit.
- **2026-08-07 · Recalc flow decisions.** Maya's calls are separate manager-category records
  (append-only; reviewer categories never overwritten). Recalc precedence Maya > reviewer >
  rep — Sibyl's overrides deliberately not in the ladder (the recalc is a counter-walk-up).
  Component 03 inherited from Sibyl's named list, her edits win, moved-in deals not
  auto-counted. The redraft is a full constrained Sibyl call (all 11 fields, categories
  pinned; `sibyl_prompt.md` untouched — the constraint is message-level). Display model C:
  the page enters an explicit REVISED state and the gate moves to the revision.
- **Backlog: a sixth eval case for the recalc path** (Maya overrides two categories → the
  revision quotes her numbers and registers Sibyl's original disagreement).

## Not doing

No submission-repo edits · no frameworks or CDN deps (raw fetch only) · no build-system rewrite · no Azure (Supabase covers it) · no server-side model proxy (key stays user-held; honest register applies) · no relational client refactor (the CSV-shaped payload is the point).
