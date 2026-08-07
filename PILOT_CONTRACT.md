# PILOT_CONTRACT — the Pilot view-model, v1

The Pilot surface renders from **one** structured object: the return value of
`buildPilotModel()` (`tools/agent_block.js`, Phase 4 section). This is the API
contract between Sibyl's run state and the product UI. It is a **derived
view-model**: a pure read over state the app already holds — nothing here asks
the model to emit JSON, and no prompt changed to produce it.

Two source classes, never mixed:

- **Numbers** come from the calculator (`computeWalkUp`) or straight from a
  table (`topdown_metrics.csv`, `decisions_log.csv`). The model's prose is
  never parsed for a number.
- **Prose** carries the model's own labelled fields verbatim
  (`forecast_notes`, `chase_list`, `sibyl_reading`, `failed_checks_banner`).

`buildPilotModel()` returns **`null`** when there is nothing defensible to
show: no run yet, a run error, a refusal (EC-5), or a blocked walk-up (EC-2).
The Pilot surface then shows its pre-run state.

## Shape

```js
{
  meta: {
    week: 13,                      // Forecast Week # (deals_current.csv)
    snapshotDate: '2026-07-24',    // Snapshot Date  (deals_current.csv)
    manager: 'Maya Delgado',       // topdown team row name minus "'s team"
    runN, at,                      // run log number + timestamp (null/'restored' when hydrated)
    kind,                          // 'weekly' | 'weekly-fault' | 'maya-revision' | 'restored'
    revised,                       // kind === 'maya-revision'
    restored,                      // kind === 'restored' (hydrated from sibyl_pilot_decisions)
    band                           // status band code string ('' when hydrated)
  },

  numbers: {                       // ← calculator (computeWalkUp) unless noted
    suggestedForecast,             // walk.total — the drafted gross forecast
    bestCasePool,                  // walk.bestCasePool
    bestCaseTotal,                 // walk.total + walk.bestCasePool (display semantics)
    teamBottomsUp,                 // walk.bottomsUp   (662,945 — topdown rollup row)
    drift,                         // walk.drift       (signed)
    deltaFromLastWeek,             // walk.deltaFromLastWeek (signed; vs last standard submission)
    lastSubmitted: { week, value },// forecast_history.csv via the calculator
    components: [                  // the walk-up 01..05, calculator figures
      { n: '01', label: 'Closed Won', value },
      { n: '02', label: 'Deal Forecast (100% included)', value },
      { n: '03', label: 'Portion of Deal Best Case', value },
      { n: '04', label: 'Pipeline Volume Conversion', value },
      { n: '05', label: 'Create & Close / Pull-In', value }
    ],
    challengedCount,               // deals whose reading verdict is CHALLENGE_*
    challengedAmount,              // sum of their amounts
    quota,                         // 1,015,446 — topdown_metrics.csv team row (run-independent)
    closedWon,                     // 445,679  — same row (run-independent)
    attainmentPct                  // 44 — same row (run-independent)
  },

  prose: {                         // ← the model's own words, unparsed
    failedChecksBanner, forecastNotes, chaseList, reading
  },

  deals: [{                        // one per open deal (8), CRM ⊕ reading ⊕ Maya
    id, name, rep, stage, amount, closeDate,
    repCategory,                   // CRM Forecast column
    reviewerCategory,              // reading, normalised; falls back to finalCategoryOf
    verdict,                       // AGREE | CHALLENGE_UP | CHALLENGE_DOWN | INSUFFICIENT_EVIDENCE | ''
    challenged,                    // verdict is CHALLENGE_*
    confidence,                    // high | medium | low | ''
    wowChange, evidence: [], recommendedAction,
    mayaCall,                      // { action, category, reason, at } | null (from DEAL_GATE)
    finalCategory,                 // Maya's category if she ruled, else the applied one
    appliedCategory,               // what the last computed walk-up actually used
    pendingRecalc                  // Maya ruled but the draft of record predates it
  }],

  reps: [{ name, dealCount, commit, challenged }],  // rolled up from deals, by applied categories

  record: {                        // ← decisionStats() over decisions_log.csv
    resolved, draftWins, mayaWins, // 6 / 4 / 2 in the shipped data
    winRatePct,                    // Maya's override win rate (33), null when nothing resolved
    openDisputes: [],              // { id, name, rep, draft, maya, action }
    weekly: []                     // { week, note }
  },

  gate: { open, status }           // the human gate, via gateStatus()
}
```

## Rules

1. **Versioned.** This is v1. Any field rename/removal bumps the version and
   updates the harness section 35 checks in `tools/verify_static.js`.
2. **Additive changes are free** — new fields may appear without a bump.
3. **The calculator is the only arithmetic.** If a figure the UI wants doesn't
   exist in `computeWalkUp`/a table, it is either added there or not shown —
   never computed ad hoc in a renderer. (One deliberate exception:
   `bestCaseTotal` and the quota gap are display sums of two contract fields.)
4. **Null-tolerant renderers.** Every consumer must handle `null` (pre-run)
   and `meta.restored` (hydrated run: `runN` is null, `band` is empty).
5. **eval_cases.csv never appears here.** The contract carries no eval data.

## Harness coverage

`tools/verify_static.js` section 35 (35a–35h): null pre-run; calculator
mirroring; run-independent topdown numbers; deal/rep rollups; the decisions
record; empty-state ↔ hero swap; headline content.
