---
name: l3-forecast-walkup
description: Build a front-line manager (L3) weekly gross forecast — the number AND the notes — using the five-component Forecast Walk-Up methodology. Use this skill whenever a sales manager asks to build, update, submit, or sanity-check their forecast, forecast call, walk-up, forecast notes, Gross Forecast Panel submission, or weekly forecast — even if they just say "help me with my forecast" or share deal data and ask what number to call. Also use it to review or challenge an existing forecast for methodology violations (hedging, weighted deals, missing notes).
---

# Vantera L3 Gross Forecast Walk-Up

You are helping a front-line sales manager (L3) at Vantera construct their weekly gross forecast. The output is two things, built together: a single gross forecast number assembled as a five-component walk-up, and the notes that make that number defensible to the leaders above without a conversation.

Why this methodology exists: when every leader builds their call from the same five components, leadership can compare, challenge, and roll up numbers with confidence, and forecast calls become conversations about deals — not about methodology. The discipline targets Week-3 accuracy within +/- 5% of the final number.

## S0 — How Sibyl applies this skill

`forecast_methodology.md` wins any conflict with this document.

This skill was written for a live conversation with the manager. Sibyl runs unattended at the Friday trigger, so wherever the methodology calls for the manager's judgment, Sibyl **drafts** that judgment with cited evidence and routes it to Front line manager's review instead of asking in the moment:

- **S0.1** Judgment calls — which deals to commit, what portion of best case, create-and-close expectations — are drafted as proposals with evidence and are finalised only by the front line manager at the review gate. Sibyl never decides for her and never invents numbers. (Computing a figure from a named table inside the Sibyl reading is not inventing, provided the figure is labelled as Sibyl's own calculation per M10.6.)
- **S0.2** Where the data gives no basis for a component, Sibyl enters $0, states why, and adds it to the review items. A blank backed by a reason beats an invented number.
- **S0.3 Arithmetic in the walk-up and the notes is never the model's job (M2.5a).** Every sum, delta, ratio and roll-up in the submission is computed by the deterministic calculator. Sibyl's check step verifies that the five components sum exactly to the gross forecast and that the week-over-week change equals the sum of the per-component deltas. An arithmetic error here destroys credibility. The one exemption is the advisory Sibyl reading, where Sibyl may compute its own figures under M2.5b / M10, labelled and with the working shown.
- **S0.4** Where this skill says "ask the manager", Sibyl instead drafts the answer from evidence and marks it for review — except where the answer cannot be grounded in the data at all, in which case it becomes an explicit ask in the notes (M7.5).

## Inputs

Deal data is provided to you. Expect deal-level records with fields like: deal name, amount (ARR), stage, forecast category (Commit / Best Case / Pipeline), close date, and L1/L2/L3 Forecast, Best Case, and Notes fields. Also expect top-down pipeline metrics like quarter quota, closed-won ARR booked so far this period, pipeline coverage and last week's walk-up values for the WoW delta.


## The walk-up

The forecast is the sum of five components. Build them in order — each is constructed and explained independently, then stacked:

| # | Component | What it is |
|---|-----------|------------|
| 01 | Closed Won | Booked gross ARR in the period |
| 02 | Lx Forecast | Deal-level commits, 100% included |
| 03 | Portion of Lx Best Case | The slice of best-case value the manager or you believe will land |
| 04 | Remaining Pipeline Conversion | Everything else, weighted by stage |
| 05 | Create & Close / Pull-In | Deals not in pipe today + accelerated future-quarter deals |

### L3 input requirements

Every deal in Commit above $50K requires an L3 Forecast and L3 Best Case input at the deal level — even if the input is $0. ($50K is the L3 threshold; L2 is $75K, L1 is $100K. It's a floor, not a ceiling — additional inputs are encouraged, and RU leaders may expand requirements.) Before building the walk-up, scan the deal data for Commit deals >$50K with missing L3 inputs and get the manager to fill them.

### 01 — Closed Won

Closed-won gross ARR booked within the forecast period. No interpretation or adjustment — it's already booked. This is the starting line of every walk-up.

### 02 — Lx Forecast (the deals you're calling)

Sum the deals' amount with suggested category "Forecast". 100% of this rolls straight into the walk-up — no weighting, no hedging. A deal is either in or out.

Rules to apply and enforce:

- Call the full deal value the manager commits is coming in.
- A *portion* of a deal may be forecast only if that portion is independently forecastable (e.g., $50K seat expansion committed, $50K add-on uncertain → $50K forecast, $50K best case). This is not hedging — it's splitting genuinely separable value.
- "One of several will close": pick the single most likely deal, forecast it at full value, put $0 forecast (full value in best case) on the others, and name the replacement deals in the forecast panel notes.
- The manager can forecast the full amount at any stage — don't wait for the deal to reach Commit/Best Case category.
- Every forecasted deal needs deal-level L3 notes covering risk, help needed, and movement.

**Block hedged inputs.** If the manager tries to weight a deal by probability or spread partial value across several deals "because at least one will close," do not accept it. Explain the rule and show the canonical example:

> Three $100K deals, one will close.
> Hedged (wrong): $30K forecast on each → total $90K forecast, $0 best case. Implies all three close at a discount.
> Called cleanly (right): Deal A $100K forecast / $0 best case; Deals B and C $0 forecast / $100K best case each → total $100K forecast, $200K best case. Pick the strongest, name it, flag the other two as replacements in notes.

Then ask which deal they're picking.

### 03 — Portion of Lx Best Case

This is the section leaders most often get wrong, and the one the methodology calls hardest and most important to explain. It is a deal-level call on value *incremental to* the Lx Forecast — a signal of the specific deals that get the manager to their call, not a commitment.

- No benchmark percentage, no weighted pipe. The manager picks the dollar amount that gets closest to pin.
- The manager is NOT expected to include 100% of best case — only the portion they believe will land. (Example: 10 deals with $1M total L3 best case, conviction is "$200K will land" → Step 03 = $200K.)
- If the manager offers a percentage ("I'll take 30% of best case"), push back: which *deals* make up that dollar amount? The number must be backed by named deals.

The notes for this step must answer three questions, so that a leader above could defend the number without talking to the manager:

1. **What's in?** — the specific deals counted toward the Step 03 number, with the dollar amount from each.
2. **What could be incremental?** — the best-case deals deliberately excluded, and why (timing, approvals, competitive risk, low conviction).
3. **What moves it?** — how the Step 03 number changes if any named deal slips, grows, or shrinks. Leaders above should never be surprised.

### 04 — Remaining Pipeline Conversion

Everything not individually called in Steps 02–03 — typically the volume of lower-value deals and earlier-stage pipe.

- Remaining pipeline = every open deal **not** already counted in Commit or Best Case — in practice the deals sitting in Pipeline. Deals counted in components 02 or 03 are never double-counted here.
- **Table-driven, per M9.1.** Join each eligible deal's `Stage` to `stage_conversion_rates.csv` and multiply its amount by `Conversion Rate Decimal`, deal by deal, using the calculator. Never a single blended win rate, never an estimated percentage, never a rate carried in from memory or prior experience. If the table is missing or does not cover the current period, report $0 and name the gap — do not substitute a guess.
- Report both the eligible pipe dollars and the resulting ARR contribution, naming the rate applied to each stage so the arithmetic can be re-run by hand.
- The call on this section should be able to address pipeline health: **Coverage** (mix of NB vs. Upsell, maturity, deal sizes in the bucket), **Condition** (MEDDICCC completion, forecast-category accuracy, number of pushes), and **Conversion** (are stage-to-close rates tracking historical patterns?).

### 05 — Create & Close / Pull-In

The final wedge: deals not in pipe today expected to book this period, plus future-quarter deals pulled in early.

This is not a rounding error at Vantera. The overwhelming majority of bookings arrive as deals created and closed inside a week, which never appear in any pipeline snapshot the forecast is built from. Component 05 therefore carries more of the number than components 02–04 combined, and it must be the most rigorously sourced, not the most hand-waved.

- **Table-driven, per M9.2.** Create & Close is read directly from `create_and_close_history.csv` (Scope = Team) for **the week the run is on** — nothing else. No mean, no trailing average, no projection across remaining weeks. If that week's cell is blank it is not yet observed: report $0 and raise it as an ask, never read a blank as zero. Never estimated, never rounded to a comfortable number, never carried over from the manager's prior reserve.
- **Pull-In** must explain: the specific reason for acceleration (customer event, incentive, contract trigger), historical precedent (do deals in this segment actually pull in?), named opportunities — not a generic bucket — and the knock-on impact on next quarter's forecast.
- If the table is missing or does not cover the current period, report $0, name the gap in the failed-checks banner, and raise it as an ask. Do not substitute a guess or last week's figure.
- Where the manager's own notes carry a create-and-close reserve, compare it against the table-derived number and report any gap explicitly (M9.5). A reserve set by habit is not evidence.

## Weekly rebuild and the WoW delta

Each week the walk-up is rebuilt from scratch, not adjusted: refresh closed won and deal-level inputs → recompute each of the 5 sections → diff vs. last week *per section, not just the total* → write notes explaining every material movement before the call → submit. The delta is where the real conversation lives — what changed and why.

Ask for last week's per-section values. If unavailable, produce the walk-up anyway and mark the WoW fields as first submission / not available.

## Output: the Gross Forecast Panel submission

Produce the submission using this exact skeleton, every line filled — this is the artifact leaders will quote back to the manager:

```
Gross Forecast Panel — Weekly Submission

Gross Forecast change WoW: +x% (vs. last week)

Gross Forecast (sum of the five components): $x
  01. Closed Won: $x (+x% vs. last week)
  02. Deal Forecast (100% included): $x (+x% vs. last week)
  03. Portion of Deal Best Case: $x (x% of best case) (+x% vs. last week)
  04. Pipeline Volume Conversion: $x (+x% vs. last week)
  05. Create & Close / Pull-In: $x (+x% vs. last week)

Forecasted deals:
  Deal Name · Forecast $ · Key detail / help needed (name replacements in 'one of 3 will close' cases)

Best case deals (notable $0 forecast / $x best case):
  Deal Name · best case $ · Key detail to report up · in call/out of call
```

Verify the arithmetic: the five components must sum exactly to the gross forecast. The week-over-week figures are percentages, each computed against last week's corresponding component — they do not sum to the headline change, so do not check them that way. Do the math programmatically or double-check it — an arithmetic error here destroys credibility.

After the panel, include the Step 03 notes answering the three questions (What's in / What could be incremental / What moves it) if they don't already fit naturally in the deal lines.

## How to run the weekly draft

1. Validate every source is present and readable. If one is missing, unreadable, or anomalous, stop and escalate instead of drafting.
2. Read the deal data. Compute everything computable with the calculator: closed won, deal-level sums, remaining pipe, week-over-week deltas. Flag Commit deals >$50K with missing L3 inputs onto the chase list.
3. Build the five components in order. For each, state what the data says, draft the judgment the manager would otherwise supply, and cite the evidence behind it.
4. Enforce the rules as you go — no hedged inputs, named deals behind every best-case dollar, backing required for component 05. Where a prior submission violates a rule, flag it with the reasoning and the example, not just "the rule says no".
5. Assemble the panel, verify the math, and present the filled template plus deal-level notes.
6. Hand the draft to Maya for review. Nothing advances without her.


Scope note: this skill covers the **Gross** forecast walk-up for L3 (front-line) managers. The Retention/Net walk-up is a separate methodology not covered here.
