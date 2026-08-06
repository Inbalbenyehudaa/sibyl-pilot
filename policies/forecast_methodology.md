# Forecast Methodology — Mid-Market Sales (SYNTHETIC)

Company policy for the weekly sales forecast. Cite rules by ID (e.g. "per M9.2"). **This document wins any conflict with other guidance, including `SKILL.md`.**

---

## M1 · Forecast categories

Every deal carries exactly one category.

### M1.0 — "Won"
Deals that have been successfully closed, signifying the customer has signed the contract and committed to the purchase. Revenue from these deals is recognized or recorded.

- Contract is signed, and the customer has agreed to all terms.
- Payment method or schedule is confirmed.
- Product provisioning or implementation begins immediately, or as per the contractual arrangement.
- Often includes finalized pricing, which may include discounts from the list price.
- Includes subscription length and any add-on services (e.g., professional services or training).

### M1.1 — "Commit"
Deals that the sales team has high confidence will close within the current forecast period. These deals are often backed by tangible customer actions.

- Clear verbal commitment from the prospect or signed agreement pending execution.
- Final negotiations are completed, with pricing and terms agreed upon.
- Procurement or legal processes are in the final stages.
- Examples include renewals with clear timelines or upsell opportunities.
- Typically reviewed closely by sales leaders and scrutinized for any risks.

**A deal also belongs in Commit** when it is estimated to close, though not guaranteed, based on high levels of confidence from the sales team but still pending a few critical steps — the conservative end of Commit:

- Late-stage pipeline deals that are mostly negotiated but still require final approval from the prospect.
- Minimal risk of falling through; any objections are in process of being resolved.
- May involve customers evaluating the final contract or terms.
- Often includes expansions or renewals with existing customers who have demonstrated strong intent to continue.

Meeting **either** set of conditions qualifies a deal as Commit. There is no separate category between Commit and Best Case.

### M1.3 — "Best Case"
Deals that are less certain but could close if the ideal circumstances align. These deals offer upside potential to the forecast.

- Mid to late-stage pipeline deals where additional progress is needed, such as approvals or stakeholder buy-in.
- Deals at risk due to competing priorities, internal delays, or less responsive stakeholders.
- Unlikely to close without significant effort or external factors aligning (e.g., upcoming budget approvals).
- May involve optimistic scenarios like closing first-time customers in new sectors.

### M1.4 — "Omit"
Deals removed from the current forecast due to being disqualified, lost, or unlikely to close in the future period. These deals are not expected to contribute to immediate revenue.

- Disqualified due to reasons like complete lack of engagement, lack of budget, misalignment of needs, or competition.
- Could include deals marked as "lost" after the prospect explicitly declines the offering.
- Marked as unqualified leads (e.g., no decision, unresponsiveness, or invalid contacts).

### M1.5 — "Pipeline"
All active deals in the sales funnel, spanning from initial qualification to near closing. Pipeline captures the aggregate of all opportunities, regardless of their likelihood to close. **The deal should be labeled as pipeline if all other values are not relevant.** This default is for categorising deals whose evidence has been read; a deal whose record is too thin to read is not confirmed in any category — it goes to the chase list for data collection (M5.3).

- Contains leads in various stages (e.g., discovery, demo, and negotiation stages).
- Includes both highly qualified opportunities and deals that need more nurturing or qualification.
- May include marketing-sourced leads in early stages or sales-generated leads needing further development.
- Often used to measure deal progression against targets and identify bottlenecks in the sales process.


---

## M2 · Roll-up definitions

- **M2.1** Commit landing = Closed Won QTD + open deals in "Commit".
- **M2.2** Best Case landing = Commit landing + "Best Case".
- **M2.3** "Pipeline" contributes only through the pipeline-conversion component of the walk-up (`SKILL.md` component 04) — never counted deal-by-deal in Commit or Best Case.
- **M2.4** "Omit" never counts anywhere.
- **M2.5** Arithmetic responsibility is scoped by where the figure goes:
  - **M2.5a — Submission arithmetic.** Every figure in the walk-up, its five components, the totals, week-over-week deltas, coverage ratios and per-rep roll-ups, and every number appearing in the M7 forecast notes, is computed by the deterministic calculator and never by the language model.
  - **M2.5b — Advisory arithmetic.** The Sibyl reading (M10) is exempt. There Sibyl may compute its own sums, roll-ups, rates and scenario figures. Every such figure is marked as Sibyl's own calculation and shows its working. It never replaces a walk-up figure, never enters the M7 notes, and never reaches the VP.
- **M2.6** Closed Won QTD is taken from `topdown_metrics.csv` (team row) for the run's as-of date. The walk-up is constructed at team level for the manager (L3), so per-rep Closed Won is not a walk-up input. The calculator cross-checks the deal snapshot's team total against `topdown_metrics.csv`; if they disagree, say so before drafting.


## M5 · Challenging a category

- **M5.1** Every challenge cites at least one piece of deal evidence: a CRM field, a week-over-week delta, a revenue-intelligence signal, or a track-record statistic.
- **M5.3** A deal whose evidence base is too thin to ground a judgment is **not** challenged. Deals that falls to the chase list usually lack logged activity (conversations) or health signals. In that case Sibyl judgment is not better than a rep looking at CRM biased data. It goes to the chase list for data collection, and no disagreement is logged against the rep.
- **M5.4** Where a deal's own signals contradict each other on the same topic (progress and obstacles pointing opposite ways on pricing, technical readiness, or momentum), say so explicitly. Internal contradiction is evidence in its own right, not a reason to average the two.

## M6 · Swing deals and large moves

- **M6.1** Any single deal ≥15% of the draft commit is a **key swing deal**: pinned at the top of the weekly summary, flagged in the deal review, and named in the forecast notes, with a statement of what the number becomes without it.
- **M6.2** A commit moving ≥20% week over week leads the weekly summary, with the driving deals named.

## M7 · Forecast notes structure

Notes follow the five-component walk-up in `SKILL.md` and always include:

- **M7.1** Headline — the number and a one-line stance. e.g. `Holding / dropping my call to [$X] for Q[X]” or “Calling at “[$X]`
- **M7.2** The five components, each with its week-over-week delta.
- **M7.3** What changed — closed, pushed, lost, and category moves since last week.
- **M7.4** Risks and swings — key swing deals and top risks, each with cited evidence.
- **M7.5** Asks — where the manager needs help or a decision.
- **M7.6** Notes must match the number they accompany. Carrying forward a prior week's narrative against a changed number is a methodology violation. The Sibyl reading (M10) sits outside the M7 structure and must not be mixed into the notes.

## M8 · Submission

- **M8.1** **Only the sales manager submits the forecast to the VP.** No tool, agent, or delegate may submit on the manager's behalf, or claim to have done so.

## M9 · Walk-up components are table-driven, never estimated

The five walk-up components in `SKILL.md` are computed from source tables by the calculator. Where a table exists, it is the only permitted input. Judgment selects *which rows apply*; it never supplies the rate or the run-rate.

- **M9.1 Component 04 — Remaining Pipeline Conversion.** The remaining open pipeline is every open deal **not** already counted in "Commit" or "Best Case" — in practice, the deals sitting in "Pipeline". For each such deal, join its `Stage` to `stage_conversion_rates.csv` and multiply its amount by `Conversion Rate Decimal`; sum the results. Deals already counted in components 02 or 03 are never double-counted here. A single blended win rate, an estimated percentage, or a rate drawn from general experience is a methodology violation. If a deal's stage has no row in the table, that deal contributes $0 and is named in the asks.
- **M9.2 Component 05 — Create & Close / Pull-In.** Read directly from `create_and_close_history.csv`, the `Scope = Team` row, **for the week the run is on** — nothing else. No mean, no trailing average, no projection across remaining weeks. If that week's cell is blank, the week is not yet observed: report $0, name it in the failed-checks banner, and raise it as an ask. A blank is never read as zero, and the manager's prior reserve is never substituted.
- **M9.3 Missing table = no number.** This rule governs the tables that **feed a component**: `topdown_metrics.csv` (01), the current deal snapshot (02 and 03), `stage_conversion_rates.csv` (04) and `create_and_close_history.csv` (05). If one of those is absent, unreadable, or does not cover the current period, **that component** is reported as "not computable — source table missing", left at $0, named in the failed-checks banner, and raised as an ask (M7.5). Substituting a guess, an industry benchmark, or last week's figure is a violation.
  - **M9.3 is the rule for a number that cannot be computed. It is not a licence to draft around a source that is not there.** A run input missing in its entirety — not a component's table, but a file the run depends on, such as the prior-week snapshot `deals_last_week.csv` — is not a degraded component. It is a broken run, and it is a hard stop: no draft, an escalation to the manager instead. A calculator note reporting a figure as "n/a" is a symptom of that break, never permission to proceed past it.
- **M9.4 Show the derivation.** Each component states the table and rows it was derived from, so a reader can re-run the arithmetic by hand.
- **M9.5 Manager reserves are not inputs.** Where the manager's own notes carry a figure for a component — most often a create-and-close reserve — it is compared against the table-derived number and any gap is reported with both figures named. A reserve set by habit is evidence of habit, not of pipeline.

## M10 · Sibyl's reading — the advisory layer

- **M10.1** The reading is Sibyl's own interpretation of whether the manager should submit the walk-up as constructed, or depart from it — and by how much.
- **M10.2** Its inputs are the record: `rep_accuracy_history.csv`, `decisions_log.csv`, `forecast_history.csv` (the reps' and the manager's recent notes and numbers), the week-over-week deal movements, and the deal readings.
- **M10.3** Arithmetic is permitted here per M2.5b, including an alternative commit or best-case figure.
- **M10.4** **Advisory and manager-only.** The reading is never submitted, never merged into the M7 notes, and never changes the walk-up. M8.1 is unaffected: only the manager submits, and what she submits is the walk-up unless she herself decides otherwise.
- **M10.5** The reading must state plainly whether it endorses the walk-up or dissents from it, and name the evidence that would change its mind.
- **M10.6** **Provenance.** Any figure Sibyl computes itself is labelled as such and shown next to the calculator's corresponding figure, so a reader can always tell which number was audited.
