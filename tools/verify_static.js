/* Static verification harness for the Sibyl plan build.
   Extracts the generated script from index.html, stubs the DOM + fetch,
   and runs the plan's static checks 1-6 without any real API call. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const js = html.match(/<script>([\s\S]*)<\/script>/)[1];

/* --- DOM / storage stubs -------------------------------------------- */
function stubEl() {
  const el = {
    addEventListener() {}, innerHTML: '', className: '',
    value: '', disabled: false, open: false, type: '', checked: false,
    attrs: {}, style: {},
    getAttribute(k) { return k === undefined ? '' : (this.attrs[k] || ''); },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    querySelector() { return null; },
    focus() {}, closest() { return null; },
    querySelectorAll() { return []; },
    children: [],
    /* An element appended WITH an id becomes the element getElementById
       returns. Without this the stub hands back a fresh detached node, so a
       renderer that creates a node and a lookup that fetches it by id are two
       different objects — and a check on one cannot see writes to the other.
       Found on the note-saved caption, which is created by renderEvals and
       then written to by id. */
    appendChild(c) {
      this.children.push(c);
      if (c && c.id) els[c.id] = c;
      return c;
    }
  };
  /* Setting textContent in a real DOM removes existing children. The renderer
     clears with textContent = '' and then appends, so a stub that kept its
     children would silently accumulate rows across renders. */
  let text = '';
  Object.defineProperty(el, 'textContent', {
    get() { return text; },
    set(v) { text = String(v); if (text === '') el.children.length = 0; },
    enumerable: true
  });
  return el;
}
const els = {};
global.document = {
  documentElement: stubEl(),
  getElementById(id) { return els[id] || (els[id] = stubEl()); },
  createElement() { return stubEl(); },
  querySelectorAll() { return []; }
};
global.localStorage = { getItem: () => 'sk-test-fake', setItem() {}, removeItem() {} };

/* --- fetch stub -----------------------------------------------------
   SCENARIO drives what the model "returns", so the loop can be exercised
   on a good call and on the partial call that caused the 2026-08-02 spin.
     'complete'         round 1 tool_use (all deals), round 2 final text
     'partial-then-fix' round 1 the 1-deal placeholder, round 2 all deals,
                        round 3 final text — the self-correction path
     'stuck'            the same 1-deal placeholder every round
     'override'         round 1 a 1-deal override accepting the reviewer for
                        the rest, round 2 final text — the v3 happy path      */
let SCENARIO = 'complete';
let captured = [];
/* Round counting is per SIBYL call, not per API call: check 16 runs the whole
   weekly forecast, so eight reviewer calls now land in `captured` before the
   first Sibyl round. Routing on captured.length would have made round 1 look
   like round 9 and skipped the tool call entirely. */
let sibylRounds = 0;
function resetCapture() { captured = []; sibylRounds = 0; }

/* Rationales are structured OBJECTS since §51 — the fixtures send the same
   shape the schema now enforces. A stub fixture stubs every subfield, the way
   the 2026-08-06 live run did with its free string. */
function stubRationaleObj(word) {
  return { rule_id: word, evidence: word, argument: word };
}
/* The 2026-08-02 spin call: one deal, undecided on the rest. */
function placeholderCall() {
  return {
    deal_decisions: [{ deal_id: 'DL-0007', final_category: 'Best Case',
      rationale: stubRationaleObj('placeholder') }],
    component_03_deals: [],
    best_case_rationale: { pool_verdicts: [], summary: 'placeholder' },
    accept_reviewer_for_unlisted: false
  };
}
/* Every rationale below is deliberately SUBSTANTIVE: since 2026-08-06 the
   calculator rejects a stubbed call, so a fixture standing for "the model
   behaved correctly" has to read like one. An empty component 03 must also
   account for every deal in the best-case pool by name, hence the full ID
   list — the pool depends on the categories each fixture sets. */
function poolExcuse() {
  return {
    pool_verdicts: OPEN_DEALS.map(d => ({ deal_id: d['Deal ID'],
      reason: 'still lacks a validated economic buyer or an agreed commercial this week' })),
    summary: 'No conviction on any pool deal — none is counted in component 03 this week.'
  };
}

/* The 2026-08-06 live call: complete enough to compute (accept=true, so the
   unlisted hand-back never fires) with "placeholder" where the reasoning
   should be. This is the exact shape that reached Maya's draft. */
function stubCall() {
  return {
    deal_decisions: [{ deal_id: 'DL-0007', final_category: 'Best Case',
      rationale: stubRationaleObj('placeholder') }],
    component_03_deals: [],
    best_case_rationale: { pool_verdicts: [], summary: 'placeholder' },
    accept_reviewer_for_unlisted: true
  };
}

/* The same short call, but owning the rest — the move v3 makes available. */
function overrideCall() {
  return {
    deal_decisions: [{ deal_id: 'DL-0037', final_category: 'Commit',
      rationale: { rule_id: 'M1.1',
        evidence: 'all eight MEDDPICC flags validated this week, EB engaged on 7/21',
        argument: 'the evidence now carries Commit' } }],
    component_03_deals: [],
    best_case_rationale: poolExcuse(),
    accept_reviewer_for_unlisted: true
  };
}
function fullCall() {
  return {
    deal_decisions: OPEN_DEALS.map(d => ({
      deal_id: d['Deal ID'],
      final_category: d['Deal ID'] === 'DL-0037' ? 'Commit'
        : d['Deal ID'] === 'DL-0044' ? 'Pipeline'
        : d['Deal ID'] === 'DL-0041' ? 'Omit'
        : d['Forecast'],
      rationale: { rule_id: 'M1.3',
        evidence: 'the reading and the CRM record disagree on the load-bearing fact',
        argument: 'the evidence on this deal does not carry the category the rep set' }
    })),
    component_03_deals: [],
    best_case_rationale: poolExcuse(),
    accept_reviewer_for_unlisted: true
  };
}
/* The licensed revision: the same judgment with changed arguments — a
   different fingerprint, so it recomputes rather than tripping the stall.
   Derived from overrideCall so 7 deals stay defaulted: the terminal pass must
   also rewrite the unruled block's "call again" clause, and that block only
   renders when deals were left unlisted. */
function revisedCall() {
  const c = overrideCall();
  c.deal_decisions[0].rationale.argument += ' — revised after reviewing the routing';
  return c;
}
function toolUse(input, n) {
  return {
    stop_reason: 'tool_use',
    usage: { input_tokens: 28000, output_tokens: 600 },
    content: [
      { type: 'thinking', thinking: 'model thinking summary', signature: 'sig-abc' },
      { type: 'tool_use', id: 'toolu_TEST0' + n, name: 'compute_walk_up', input: input }
    ]
  };
}
const FINAL_TEXT = {
  stop_reason: 'end_turn',
  usage: { input_tokens: 29000, output_tokens: 2500 },
  content: [{ type: 'text', text: 'failed_checks_banner: none\n(...)\nsibyl_reading: dissent. Sibyl\'s own calculation: 47% x $173,520 = $81,554.' }]
};

/* Prompt 07's gate has to open on a REAL submission, so the gate scenarios
   return a full thirteen-field draft and a real refusal rather than the
   two-line FINAL_TEXT stub. */
const DRAFT_BODY = ['failed_checks_banner: none', 'suggested_forecast: $682,158',
  'suggested_best_case: $47,800', 'delta_from_last_week: +$182,158',
  'team_bottoms_up_total: $662,945', 'drift: +$19,213',
  'reconciliation_scorecard: wk12 draft vs submitted', 'per_rep_forecast: Elena…',
  'deals_challenge_list: DL-0037 Best Case -> Commit', 'chase_list: DL-0150',
  'disagreement_register: 2 open', 'forecast_notes: …',
  'sibyl_reading: I endorse the walk-up as constructed [M10.5]'].join('\n');
const DRAFT_TEXT = {
  stop_reason: 'end_turn',
  usage: { input_tokens: 29000, output_tokens: 2500 },
  content: [{ type: 'text', text: DRAFT_BODY }]
};
const REFUSAL_TEXT = {
  stop_reason: 'end_turn',
  usage: { input_tokens: 29000, output_tokens: 400 },
  content: [{ type: 'text', text: ['status: REFUSED-ESCALATE', 'refusal_rule: M8.1',
    'refusal_reason: Only the sales manager submits to the VP.',
    'what_i_can_do_instead: I can finalise the notes so you can send them.'].join('\n') }]
};

/* A reviewer reply: thinking block first, then the nine labeled fields. */
const REVIEWER_REPLY = {
  stop_reason: 'end_turn',
  usage: { input_tokens: 2100, output_tokens: 900 },
  content: [
    { type: 'thinking', thinking: 'weighing the brief against the CRM record', signature: 'sig-rev' },
    { type: 'text', text: 'deal_id: DL-0037\ndeal_name: PathPoint 5.0\nrep_category: Best Case\n' +
      'reviewer_category: Commit\nverdict: CHALLENGE_UP\nconfidence: high\n' +
      'wow_change: all eight MEDDPICC flags flipped\nevidence: - EB validated (CRM)\n' +
      'recommended_action: Hold the call.' }
  ]
};

/* The reviewer fan-out returns ONE reading per deal in a real run, and the
   per-deal gate is entirely about the differences between them. A single canned
   reply made all eight resolve to Commit, which quietly made four section-19
   checks assert a world that cannot exist. The stub now answers per deal, using
   the seeding eval_cases.csv describes: one under-call, two over-calls, one
   unjudgeable, the rest agreed. */
const SEEDED_VERDICTS = {
  'DL-0037': ['CHALLENGE_UP', 'Commit'],
  'DL-0041': ['CHALLENGE_DOWN', 'Omit'],
  'DL-0044': ['CHALLENGE_DOWN', 'Best Case'],
  'DL-0007': ['CHALLENGE_DOWN', 'Best Case'],
  'DL-0150': ['INSUFFICIENT_EVIDENCE', '']
};
function reviewerReplyFor(userText) {
  const m = String(userText || '').match(/DL-\d{4}/);
  if (!m) return REVIEWER_REPLY;          /* callers that send no deal id keep the old fixture */
  const id = m[0];
  const deal = (globalThis.OPEN_DEALS || []).filter(d => d['Deal ID'] === id)[0];
  const rep = deal ? deal['Forecast'] : 'Commit';
  const seed = SEEDED_VERDICTS[id] || ['AGREE', rep];
  return {
    stop_reason: 'end_turn',
    usage: { input_tokens: 2100, output_tokens: 900 },
    content: [
      { type: 'thinking', thinking: 'weighing ' + id, signature: 'sig-rev' },
      { type: 'text', text: 'deal_id: ' + id + '\ndeal_name: ' + (deal ? deal['Deal Name'] : id) +
        '\nrep_category: ' + rep + '\nreviewer_category: ' + (seed[1] || rep) +
        '\nverdict: ' + seed[0] + '\nconfidence: high\nwow_change: see record\n' +
        'evidence: - the load-bearing fact is evidenced (CRM) [M1.1]\n' +
        'recommended_action: work the close plan' }
    ]
  };
}

global.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  captured.push(body);
  /* Reviewer calls carry no tools; Sibyl's do. Route on that. */
  if (!body.tools) {
    const userText = ((body.messages || [])[0] || {}).content || '';
    return { ok: true, status: 200, text: async () => JSON.stringify(reviewerReplyFor(userText)) };
  }
  sibylRounds += 1;
  const n = sibylRounds;
  let payload;
  if (SCENARIO === 'stuck') {
    payload = toolUse(placeholderCall(), n);
  } else if (SCENARIO === 'override') {
    payload = n === 1 ? toolUse(overrideCall(), n) : FINAL_TEXT;
  } else if (SCENARIO === 'stub-then-fix') {
    /* Rejected, then corrected — the path the live run was blocked from taking. */
    payload = n === 1 ? toolUse(stubCall(), n) : n === 2 ? toolUse(fullCall(), n) : DRAFT_TEXT;
  } else if (SCENARIO === 'stub-always') {
    /* Rejected twice, then re-sent unchanged a third time: compute, but flag it. */
    payload = n <= 3 ? toolUse(stubCall(), n) : DRAFT_TEXT;
  } else if (SCENARIO === 'worst-case') {
    /* §51's cap sizing, end to end: unresolved hand-back, two stub rejections,
       a computed call, the licensed revision, the final text — 6 API calls. */
    payload = n === 1 ? toolUse(placeholderCall(), n)
            : n <= 3 ? toolUse(stubCall(), n)
            : n === 4 ? toolUse(overrideCall(), n)
            : n === 5 ? toolUse(revisedCall(), n)
            : DRAFT_TEXT;
  } else if (SCENARIO === 'gate') {
    payload = n === 1 ? toolUse(fullCall(), n) : DRAFT_TEXT;
  } else if (SCENARIO === 'refuse') {
    payload = n === 1 ? toolUse(fullCall(), n) : REFUSAL_TEXT;
  } else if (SCENARIO === 'partial-then-fix') {
    payload = n === 1 ? toolUse(placeholderCall(), n)
            : n === 2 ? toolUse(fullCall(), n)
            : FINAL_TEXT;
  } else {
    payload = n === 1 ? toolUse(fullCall(), n) : FINAL_TEXT;
  }
  return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
};

const vm = require('vm');
vm.runInThisContext(js);
vm.runInThisContext('globalThis.__X = { DB, isClosed, fixedComponents, buildSibylMessage, ' +
  'forecastHistorySlice, repAccuracyWindow, buildReviewerMessage, computeWalkUp, callSibyl, ' +
  'splitReading, money, WALK_UP_TOOL, callAgent, parseReading, MODEL_REVIEWER, MODEL_SIBYL, MAX_TOKENS_REVIEWER, ' +
  'parseRefusal, detectSubmitClaim, runStatusBand, REFUSAL_FIELDS, missingFieldNote, ' +
  'SIBYL_PROMPT, POLICY_FILES, reviewerSystemPrompt, ' +
  'DATA_FILES, READING_FIELDS, openGate, logRun, ' +
  'citeVocab, auditCitations, citationCheck, citationTags, CITE_REQUIRED_FIELDS, ' +
  'buildDataStore, EMBEDDED_SOURCES, resolveDataMode, SIBYL_FIELDS, ' +
  'mayaDecisions, pinnedMismatch, recalcReady, updateRecalcButton, postPilotDecision, ' +
  'setLastRun: (v) => { LAST_RUN = v; }, ' +
  'setWorkState, renderWorkState, PRODUCT_LINE, getWorkState: () => WORK_STATE, ' +
  'EVAL_CHIPS, loadEvalCase, renderEvalChips, setFault, clearFault, sourceMissing, ' +
  'lastWeekRows, getFault: () => EVAL_FAULT, missingRunSources, RUN_CRITICAL_SOURCES, ' +
  'selectCase, renderCaseList, caseBadge, setTopStatus, getSelected: () => SELECTED_CASE, ' +
  'runSweep, runAllDeals, caseOutcome, sweepCounts, sweepSummaryText, SWEEP_CONCURRENCY, ' +
  'DEAL_LOG_ENTRY, logDealReadings, sweepProgressText, ' +
  'DEAL_GATE, dealApprove, dealEdit, dealEscalate, dealGateSummary, dealGateDivergences, ' +
  'dealGateContext, escalationToSibyl, escalationRepNote, repNotesPending, renderDealGate, ' +
  'dealGateReset, DEAL_CATEGORIES, getApplied: () => LAST_APPLIED, ' +
  'REVIEWER_PROMPT, ' +
  'runWeeklyForecast, RUN_LOG, runLogRows, pendingCount, currentCaseLabel, ' +
  'gateApprove, gateSaveEdit, gateEscalate, gateComplete, gateStatus, closeGate, ' +
  'logFollowUp, editDelta, renderGate, renderRunLog, getGate: () => GATE, ' +
  'EVAL_EXPECTED, EVAL_RESULT, EVAL_VERDICTS, VERDICT_TONE, renderEvals, runEvalCase, ' +
  'setEvalVerdict, evalCounts, evalExpected, evalActualFromRun, evalReusableRun, mayaReplies, ' +
  'stubReason, stubReasonShort, rationaleProblems, decisionsFromToolInput, flattenRationale, ' +
  'WALK_UP_FINAL, plainValue, parseSibylFields, decisionStats, decisionStatsText, ' +
  'buildDealPayload, getLastRun: () => LAST_RUN, clearLastRun: () => { LAST_RUN = null; }, ' +
  'resetEvals: () => { Object.keys(EVAL_RESULT).forEach(k => delete EVAL_RESULT[k]); ' +
  '                    LAST_RUN = null; EVAL_RUNNING = null; }, ' +
  'selectTab, renderTabs, renderPilot, getActiveTab: () => ACTIVE_TAB, ' +
  'buildPilotModel, pilotTopdown, moneyShort, pilotFormatInto, ' +
  'parseDecisionsGone: typeof parseDecisions === "undefined" };');
const { DB, isClosed, fixedComponents, buildSibylMessage, forecastHistorySlice, repAccuracyWindow,
        buildReviewerMessage, computeWalkUp, callSibyl, splitReading, money,
        WALK_UP_TOOL, callAgent, parseReading, MODEL_REVIEWER, MODEL_SIBYL, MAX_TOKENS_REVIEWER,
        parseRefusal, detectSubmitClaim, runStatusBand, REFUSAL_FIELDS, missingFieldNote,
        SIBYL_PROMPT, POLICY_FILES, reviewerSystemPrompt,
        setWorkState, renderWorkState, PRODUCT_LINE, getWorkState,
        EVAL_CHIPS, loadEvalCase, renderEvalChips, setFault, clearFault, sourceMissing,
        lastWeekRows, getFault, missingRunSources, RUN_CRITICAL_SOURCES,
        selectCase, renderCaseList, caseBadge, setTopStatus, getSelected,
        runSweep, runAllDeals, caseOutcome, sweepCounts, sweepSummaryText, SWEEP_CONCURRENCY,
        DEAL_LOG_ENTRY, logDealReadings, sweepProgressText,
        DEAL_GATE, dealApprove, dealEdit, dealEscalate, dealGateSummary, dealGateDivergences,
        dealGateContext, escalationToSibyl, escalationRepNote, repNotesPending, renderDealGate,
        dealGateReset, DEAL_CATEGORIES, getApplied,
        DATA_FILES, READING_FIELDS, openGate, logRun,
        citeVocab, auditCitations, citationCheck, citationTags, CITE_REQUIRED_FIELDS,
        buildDataStore, EMBEDDED_SOURCES, resolveDataMode, SIBYL_FIELDS,
        mayaDecisions, pinnedMismatch, recalcReady, updateRecalcButton, postPilotDecision, setLastRun,
        REVIEWER_PROMPT,
        runWeeklyForecast, RUN_LOG, runLogRows, pendingCount, currentCaseLabel,
        gateApprove, gateSaveEdit, gateEscalate, gateComplete, gateStatus, closeGate,
        logFollowUp, editDelta, renderGate, renderRunLog, getGate,
        EVAL_EXPECTED, EVAL_RESULT, EVAL_VERDICTS, VERDICT_TONE, renderEvals, runEvalCase,
        setEvalVerdict, evalCounts, evalExpected, evalActualFromRun, evalReusableRun, mayaReplies,
        stubReason, stubReasonShort, rationaleProblems, decisionsFromToolInput, flattenRationale,
        WALK_UP_FINAL, plainValue, parseSibylFields, decisionStats, decisionStatsText,
        buildDealPayload, getLastRun, clearLastRun, resetEvals,
        selectTab, renderTabs, renderPilot, getActiveTab,
        buildPilotModel, pilotTopdown, moneyShort, pilotFormatInto,
        parseDecisionsGone } = globalThis.__X;
const OPEN_DEALS = DB['deals_current.csv'].rows.filter(d => !isClosed(d['Stage']));
globalThis.OPEN_DEALS = OPEN_DEALS;

const results = [];
function actionOf(entry) {
  return entry.actions.map(a => a.action + ' ' + a.at + (a.note ? ' — ' + a.note : '')).join(' | ');
}
function check(name, cond, detail) {
  results.push((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : ''));
}

(async () => {
  /* 1 — fixedComponents: c01 from topdown, cross-check clean */
  const fx = fixedComponents();
  check('1a c01 = $445,679', fx.c01 === 445679, money(fx.c01));
  check('1b c01 sourced from topdown_metrics.csv', /topdown_metrics/.test(fx.c01Source), fx.c01Source);
  check('1c no M2.6 cross-check failure', !fx.notes.some(n => /M2.6 cross-check FAILED/.test(n)), JSON.stringify(fx.notes));

  /* 2+3 — the Sibyl payload */
  const msg = buildSibylMessage({});
  check('2a no walk-up totals in payload', !/729,958|\$729/.test(msg));
  check('2b no raw deal records (L1 Notes absent)', msg.indexOf('L1 Notes') === -1);
  check('2c payload mentions compute_walk_up', msg.indexOf('compute_walk_up') !== -1);
  check('3a history slice = 63 rows', forecastHistorySlice().length === 63, forecastHistorySlice().length + ' rows');
  check('3b both policies in payload (M2.5b + M10 present)', msg.indexOf('M2.5b') !== -1 && msg.indexOf('M10 ·') !== -1);
  check('3c payload ~28K tokens', msg.length / 4 > 20000 && msg.length / 4 < 36000, '~' + Math.round(msg.length / 4).toLocaleString() + ' tokens (' + msg.length.toLocaleString() + ' chars)');
  /* 3h — the 2026-08-04 component-03 framing. The prompt has drifted out of sync
     with the data twice this week; this makes a silent revert visible. SIBYL_PROMPT
     must keep the "not 100% of best case" rule and all three SKILL 03 question
     stems, and SKILL.md must no longer demand that percentage deltas sum. */
  check('3h SIBYL_PROMPT carries the component-03 framing',
    /not expected to include 100% of best case/.test(SIBYL_PROMPT) &&
    /what is in/.test(SIBYL_PROMPT) && /what could be incremental/.test(SIBYL_PROMPT) &&
    /what moves it/.test(SIBYL_PROMPT) &&
    POLICY_FILES['SKILL.md'].indexOf('sum of the per-section deltas') === -1 &&
    POLICY_FILES['SKILL.md'].indexOf('WoW: +$x') === -1);

  /* 3d-3g — rep accuracy sliced to the run's week +/- 1 */
  const acc = repAccuracyWindow();
  const full = DB['rep_accuracy_history.csv'].rows;
  check('3d accuracy window = weeks 12-13 (run week 13 +/- 1)',
    acc.rows.length === 14 && acc.rows.every(r => ['12', '13'].indexOf(String(r['Week #'])) !== -1),
    acc.rows.length + ' of ' + full.length + ' rows · ' + acc.label);
  check('3e week 14 reported absent, not silently dropped',
    acc.missing.length === 1 && acc.missing[0] === 14 && msg.indexOf('No rows for week 14') !== -1);
  check('3f off-window weeks gone from the payload',
    msg.indexOf('Week #: 2\n') === -1 && msg.indexOf('Week #: 11') === -1);
  check('3g Elena week-13 accuracy survives (the PathPoint evidence)',
    /Name: Elena Whitaker\s+Week #: 13\s+Q2 FY2026: 90%/.test(msg));

  /* 4 — reviewer payloads unchanged */
  const sizes = OPEN_DEALS.map(d => buildReviewerMessage(d['Deal ID']).length);
  /* Ceiling is 2.5K, not 2K: the guard exists to catch a raw record (9.5K-17.5K tokens) leaking
     back into the sub-worker, not to cap legitimate evidence. DL-0037 carries all eight MEDDPICC
     base texts since the 2026-08-01 seed swap flipped every flag, and still sits ~4x under a raw
     record. */
  check('4a all 8 reviewer payloads under 2.5K tokens (raw records are 9.5K-17.5K)',
    sizes.every(n => n / 4 < 2500), sizes.join(', ') + ' chars');
  check('4b DL-0037 carries the EB flip (DL-0044 does not)',
    /Economic Buyer: Validated: False\s+->\s+True/.test(buildReviewerMessage('DL-0037')) &&
    !/Economic Buyer: Validated: False\s+->\s+True/.test(buildReviewerMessage('DL-0044')));
  check('4c DL-0007 carries 8 Validated: False', (buildReviewerMessage('DL-0007').match(/Validated: False/g) || []).length === 8);
  /* 4d — the quarter clock. "Weeks left" is arithmetic, so it is handed to the reviewer
     rather than guessed (M2.5a); before this block the sub-worker had the week number and
     no quarter length at all. DL-0036 closes ON the snapshot date — the case most likely
     to render as a bare 0, a negative, or a blank. */
  const clocks = OPEN_DEALS.map(d => buildReviewerMessage(d['Deal ID']));
  check('4d every reviewer payload carries a QUARTER CLOCK naming week 13 of 14',
    clocks.every(m => /=== QUARTER CLOCK \(computed by calculator\) ===/.test(m) &&
                      /week 13 of 14/.test(m) &&
                      /Quarter ends 2026-07-31, 7 days after this snapshot/.test(m)));
  check('4e each deal gets its own days-to-close, and the 0-day case reads as prose',
    /This deal closes 2026-07-30 — 6 days out, inside the quarter/.test(buildReviewerMessage('DL-0037')) &&
    /This deal closes 2026-07-24 — closes on the snapshot date itself/.test(buildReviewerMessage('DL-0036')) &&
    !/-\d+ days out|NaN|undefined/.test(clocks.join('\n')));
  /* 4f-4h — the 2026-08-04 live-run fixes. Two Stage 1 verdicts failed their evals:
     Halcyon was AGREEd instead of ruled unjudgeable (the has_next_step boolean showed
     a note recording absence as `true`), and PathPoint was held at Best Case against
     a Commit bar the prompt set above M1.1's — a definition the reviewer had never
     been given. */
  const sys = reviewerSystemPrompt();
  check('4f reviewer system prompt carries the full M1 section, spliced from the live methodology',
    sys.indexOf('{{M1_FORECAST_CATEGORIES}}') === -1 &&
    /### M1\.1 — "Commit"/.test(sys) &&
    /mostly negotiated but still require final approval/.test(sys) &&
    /### M1\.4 — "Omit"/.test(sys) && /### M1\.5 — "Pipeline"/.test(sys) &&
    /^let REVIEWER_PROMPT/m.test(js) && js.indexOf('{{M1_FORECAST_CATEGORIES}}') !== -1);
  check('4g both reviewer call sites send the assembled prompt, not the raw file',
    (js.match(/callAgent\(MODEL_REVIEWER, reviewerSystemPrompt\(\), /g) || []).length === 2 &&
    (js.match(/callAgent\(MODEL_REVIEWER, REVIEWER_PROMPT, /g) || []).length === 0);
  check('4h the Next Step note travels verbatim — absence is no longer shown as true',
    /Next Step \(rep's note, verbatim — may record the absence of a step\): 7\/21 HR - 2 calls held with the account to date; neither was recorded/.test(buildReviewerMessage('DL-0150')) &&
    !/has_next_step: true/.test(buildReviewerMessage('DL-0150')) &&
    /Not Yet Engaged = Gagan \(CFO\/EB/.test(buildReviewerMessage('DL-0044')) &&
    /has_next_step: false/.test(buildReviewerMessage('DL-0007')));
  /* 4i — the second EC-3 failure mode (2026-08-04 re-run): the reviewer saw the empty
     record correctly and judged anyway, arguing the CRM skeleton "directly supports"
     Pipeline and leaning on M1.5's default clause. The gate must state the reductio,
     the category-looks-reasonable dodge, and M1.5's boundary — in the prompt, the
     policy, and the payload's NO BRIEF line. */
  check('4i the judge-ability gate closes the CRM-skeleton and M1.5-default dodges',
    /never, by itself, an evidence base/.test(sys) &&
    /if the skeleton were enough to judge, this verdict could never fire/.test(sys) &&
    /looks reasonable for a thin deal/.test(sys) &&
    /never a licence to agree with a category on an empty record/.test(sys) &&
    /it goes to the chase list for data collection \(M5\.3\)/.test(sys) &&
    /nothing to corroborate or contradict the CRM skeleton/.test(buildReviewerMessage('DL-0150')));

  /* 5 — calculator baseline + ex-swing figure */
  const w = computeWalkUp(null, {});
  check('5a baseline 02 = $85,438 (rounded; raw carries a legitimate $.50)', Math.abs(w.c02 - 85437.5) < 1, money(w.c02));
  check('5b best-case pool = $180,909 (PathPoint + Nimbus)', w.bestCasePool === 180909, money(w.bestCasePool));
  check('5c 04 = $18,621', Math.abs(w.c04 - 18621) < 1, money(w.c04));

  /* 5f-5k — M7.2's per-component week-over-week deltas. Until 2026-08-04 the tool
     returned none at all, so Sibyl was asked for deltas it could only invent.
     The comparator is deals_last_week.csv read as the LOCKED forecast: each
     deal's Forecast is last week's final reviewed category, so the prior
     components are plain sums by category. */
  const pri = priorComponents();
  check('5f prior components from the locked week-12 snapshot',
    Math.abs(pri.c01 - 385167) < 0.01 && Math.abs(pri.c02 - 144874.44) < 0.01 &&
    Math.abs(pri.c03 - 247534.37) < 0.01 && Math.abs(pri.c04 - 79397.53) < 0.01 &&
    Math.abs(pri.c05 - 54212) < 0.01 && Math.abs(pri.total - 911185.34) < 0.01,
    [pri.c01, pri.c02, pri.c03, pri.c04, pri.c05].map(money).join(' / ') + ' = ' + money(pri.total));
  check('5g prior create-and-close week is derived, not hardcoded', pri.weekKey === 'Week 12', pri.weekKey);

  const ec1Call = { categories: { 'DL-0007': 'Best Case', 'DL-0033': 'Commit', 'DL-0037': 'Commit',
                               'DL-0041': 'Omit', 'DL-0044': 'Best Case' },
                 component03: ['DL-0007', 'DL-0044'], rationales: {}, bestCaseRationale: '',
                 acceptUnlisted: true };
  const txt = walkUpText(computeWalkUp(ec1Call, {}));
  const head = txt.split('Per-deal routing')[0];
  check('5h walk-up renders the templated header and five numbered components',
    /Gross Forecast change WoW: -19\.9% \(vs\. last week\)/.test(head) &&
    /Gross Forecast \(sum of the five components\): \$729,958/.test(head) &&
    /01\. Closed Won: \$445,679 \(\+15\.7% vs\. last week\)/.test(head) &&
    /02\. Deal Forecast \(100% included\): \$211,158 \(\+45\.8% vs\. last week\)/.test(head) &&
    /03\. Portion of Deal Best Case: \$47,800 \(100% of best case\) \(-80\.7% vs\. last week\)/.test(head) &&
    /04\. Pipeline Volume Conversion: \$18,621 \(-76\.5% vs\. last week\)/.test(head) &&
    /05\. Create & Close \/ Pull-In: \$6,700 \(-87\.6% vs\. last week\)/.test(head));
  check('5i every delta is a percentage, and the component lines carry no source trail',
    !/vs\. last week[^)]*\$/.test(txt) &&
    !/(01\.|02\.|03\.|04\.|05\.)[^\n]*(M2\.1|M2\.6|M9\.1|M9\.2|\.csv)/.test(head) &&
    !/TOTAL \.\.\.|\.\.\.\.\.\.\./.test(head));
  check('5j no Infinity/NaN reaches a rendered walk-up, zero-prior included',
    !/Infinity|NaN|undefined/.test(txt) &&
    deltaText(500, 0) === '(n/a vs. last week — was $0)' &&
    deltaText(500, null) === '(no prior figure)',
    deltaText(500, 0));
  /* A baseline has no 03, so neither 03 nor the total is comparable to a prior
     week that carries one. Rendering -100% there would be an invented delta. */
  const baseHead = walkUpText(computeWalkUp(null, {})).split('Per-deal routing')[0];
  check('5k a baseline refuses to fake the 03 and total deltas',
    /Gross Forecast change WoW: not comparable in a baseline/.test(baseHead) &&
    /03\. Portion of Deal Best Case: n\/a in a baseline .* \(not comparable — a baseline has no namer\)/.test(baseHead) &&
    !/-100\.0%/.test(baseHead) &&
    /01\. Closed Won: \$445,679 \(\+15\.7% vs\. last week\)/.test(baseHead));
  const pp = w.swings.filter(s => s.id === 'DL-0037')[0];
  check('5d PathPoint is the ex-swing deal', !!pp && w.swings.length === 1,
    pp ? pp.id + ' at ' + (pp.share * 100).toFixed(1) + '% · without it ' + money(pp.totalWithout) : 'MISSING');

  /* 6 — the tool loop, request shape, verbatim echo */
  const logSteps = [];
  const s = await callSibyl('SYS', 'USER MSG', {}, (k) => logSteps.push(k));
  const b1 = captured[0], b2 = captured[1];
  /* Derived, not pinned: the check that matters is that the call goes out on
     the configured Stage 2 model, not that the constant holds one name. */
  check('6a the Sibyl call goes out on MODEL_SIBYL', b1.model === MODEL_SIBYL, b1.model);
  check('6b tools = [compute_walk_up], strict', b1.tools.length === 1 && b1.tools[0].name === 'compute_walk_up' && b1.tools[0].strict === true);
  check('6c thinking adaptive/summarized', b1.thinking && b1.thinking.type === 'adaptive' && b1.thinking.display === 'summarized');
  check('6d effort high, max_tokens 32000', b1.output_config && b1.output_config.effort === 'high' && b1.max_tokens === 32000, String(b1.max_tokens));
  check('6e no temperature/top_p/top_k/budget_tokens', ['temperature', 'top_p', 'top_k', 'budget_tokens'].every(k => !(k in b1)));
  check('6f assistant turn echoed verbatim incl. thinking', JSON.stringify(b2.messages[1]) === JSON.stringify({ role: 'assistant', content: [
    { type: 'thinking', thinking: 'model thinking summary', signature: 'sig-abc' },
    b2.messages[1].content[1] ] }) && b2.messages[1].content[0].signature === 'sig-abc');
  check('6g tool_result keyed to tool_use_id', b2.messages[2].content[0].type === 'tool_result' && b2.messages[2].content[0].tool_use_id === 'toolu_TEST01');
  check('6h loop returned final text + walk', s.ok && s.roundTrips === 2 && s.walk && s.decisions && logSteps.join(',') === 'tool_use,tool_result');
  check('6i simulated calls (PathPoint up to Commit, uptime to Pipeline, Nimbus omitted) -> total ~$715,325',
    Math.abs(s.walk.total - (w.total + 173520 - 21840 + 21840 * 0.33)) < 0.01, money(s.walk.total));
  check('6j usage aggregated across trips', s.usage.input_tokens === 57000 && s.usage.output_tokens === 3100);
  check('6k splitReading separates field 11', (() => { const p = splitReading(s.text); return p.reading.indexOf('sibyl_reading') === 0 && p.submission.indexOf('sibyl_reading') === -1; })());
  check('6l parseDecisions is gone', parseDecisionsGone);

  /* §52 — prompt caching. Two breakpoints on the Sibyl request: the system
     block (cross-run reads of tools+system) and the top-level auto-placement
     (within-run reads of the growing conversation, which is what makes the
     model's stub-probe round trips nearly free). The reviewer carries the
     system breakpoint ONLY — its per-deal user message differs every call, so
     an auto-placed breakpoint there would write entries nobody reads. */
  check('6m the Sibyl request carries both cache breakpoints — system block + top-level auto-place',
    b1.cache_control && b1.cache_control.type === 'ephemeral' &&
    Array.isArray(b1.system) && b1.system.length === 1 &&
    b1.system[0].type === 'text' && b1.system[0].text === 'SYS' &&
    b1.system[0].cache_control && b1.system[0].cache_control.type === 'ephemeral',
    'system block + top-level, both ephemeral');
  resetCapture();
  await callAgent('claude-test-model', 'REVIEWER SYS', 'reading DL-0007', 500, {});
  const bR = captured[0];
  check('6n the reviewer request carries the system breakpoint only — no auto-place on per-deal messages',
    Array.isArray(bR.system) && bR.system.length === 1 &&
    bR.system[0].text === 'REVIEWER SYS' &&
    bR.system[0].cache_control && bR.system[0].cache_control.type === 'ephemeral' &&
    !('cache_control' in bR) &&
    typeof bR.messages[0].content === 'string',
    'system breakpoint present, top-level absent');

  /* 7 — the partial-call path, contract v3. The 2026-08-02 live run spun here:
     Sibyl sent a 1-deal call, was rejected, sent 1 again, then 2, then 3, and
     burned the 4-round cap computing nothing. A short call is now a legitimate
     override list; the only hand-back is "still deciding", and it fires once. */
  SCENARIO = 'override'; resetCapture();
  const steps1 = [];
  const s1 = await callSibyl('SYS', 'USER MSG', {}, (k, d) => steps1.push({ k: k, d: d }));
  check('7a a 1-deal override accepting the reviewer computes on the first call',
    s1.ok && s1.roundTrips === 2 && steps1.map(x => x.k).join(',') === 'tool_use,tool_result',
    steps1.map(x => x.k).join(',') + ' · ' + s1.roundTrips + ' trips');
  check('7b the 7 unlisted deals are named back, not silently absorbed',
    s1.walk.defaulted.length === 7 && s1.walk.ruledOn === 1 &&
    /You did not rule on 7 of 8 open deals/.test(walkUpText(s1.walk)),
    s1.walk.defaulted.map(x => x.id).join(', '));
  check('7c the override lands: DL-0037 at Commit from Sibyl, rest from the reviewer/rep',
    /DL-0037 PathPoint 5\.0 · \$173,520 · Commit \[Sibyl\]/.test(walkUpText(s1.walk)) &&
    s1.walk.defaulted.every(x => x.id !== 'DL-0037'));

  /* "Still deciding" is handed back exactly once, then computed regardless. */
  SCENARIO = 'stuck'; resetCapture();
  const steps2 = [];
  const s2 = await callSibyl('SYS', 'USER MSG', {}, (k, d) => steps2.push({ k: k, d: d }));
  const handed = captured[1].messages[2].content[0];
  check('7d accept=false with gaps is handed back once, with no figures in it',
    steps2[0].k === 'tool_use' && steps2[1].k === 'tool_error' &&
    handed.is_error === true && /NOT COMPUTED/.test(handed.content) &&
    !/445,679|TOTAL|Lx Forecast/.test(handed.content),
    handed.content.split('\n')[0]);
  check('7e the hand-back names every unlisted deal',
    OPEN_DEALS.filter(d => d['Deal ID'] !== 'DL-0007')
              .every(d => handed.content.indexOf(d['Deal ID']) !== -1) &&
    handed.content.indexOf('DL-0007') === -1);
  /* A model that repeats the same placeholder forever now meets BOTH gates in
     turn — unresolved deals, then the stubbed rationale — computes once with
     the fault recorded, and stalls on the identical resend. Every step is
     bounded and the walk-up survives all of it. */
  check('7f an unheeded hand-back computes anyway, then stops — it cannot spin',
    steps2.map(x => x.k).join(',') ===
      'tool_use,tool_error,tool_use,tool_error,tool_use,tool_error,tool_use,tool_result,tool_use' &&
    captured.length === 5 && s2.walk && s2.walk.notes.some(n => /twice/.test(n)) &&
    s2.walk.notes.some(n => /rejected twice for a stubbed rationale/.test(n)) &&
    !s2.ok && /identical arguments/.test(s2.error),
    steps2.map(x => x.k).join(',') + ' · ' + captured.length + ' API calls · walk=' +
      (s2.walk ? 'computed and kept' : 'null'));

  /* 7p-7v — THE RATIONALE GATE (2026-08-06). Section 46 fixed the wording and
     the next live run made the same placeholder call, recognised it in its own
     thinking ("I sent a test call with placeholder content"), and shipped it
     anyway — because the turn contract said calling again ends the run. The
     instructions could name the failure but not license the remedy, so the
     calculator refuses the call instead. */
  check('7p a placeholder rationale is detected, and a real one is not',
    stubReason('placeholder') && stubReason('') && stubReason('TBD') && stubReason('n/a') &&
    stubReason('too short') &&
    !stubReason('M1.3 — the CFO calls it an unplanned expense and the EB is unvalidated'),
    'stubs caught, reasoning passed');
  /* The whole point: a rejected call must not compute. */
  SCENARIO = 'stub-then-fix'; resetCapture();
  const stepsG = [];
  const sG = await callSibyl(SIBYL_PROMPT, 'USER MSG', {}, (k, d) => stepsG.push({ k: k, d: d }));
  check('7q the stubbed call is REJECTED — nothing is computed from it',
    stepsG[0].k === 'tool_use' && stepsG[1].k === 'tool_error' &&
    stepsG[1].d.kind === 'stub' &&
    stepsG[1].d.problems.some(p => /best_case_rationale summary is a stub/.test(p)),
    stepsG[1].d.problems[0]);
  const rejected = captured[1].messages[2].content[0];
  check('7r and the rejection LICENSES the correction — the trap the live run fell into',
    rejected.is_error === true &&
    /does not count as your one call/.test(rejected.content) &&
    /SEND THE CALL AGAIN/.test(rejected.content) &&
    /a corrected\ncall is NOT a second call/.test(rejected.content) &&
    !/445,679|TOTAL/.test(rejected.content),
    'rejected, with no figures in it');
  check('7r2 it also closes the workaround the model actually reached for',
    /Do not work around this by writing the reasoning into the output\nfields instead/
      .test(rejected.content),
    'writing the rationale into deals_challenge_list instead is named and refused');
  check('7s a corrected call then computes normally, and the run is clean',
    sG.ok && sG.walk && sG.walk.total > 0 && (!sG.stubs || !sG.stubs.length) &&
    stepsG.map(x => x.k).join(',') === 'tool_use,tool_error,tool_use,tool_result',
    stepsG.map(x => x.k).join(',') + ' · ' + money(sG.walk.total));
  check('7t and a clean run is still OK — the gate adds no false failure',
    runStatusBand(parseSibylFields(DRAFT_BODY), parseRefusal(sG.text), sG).code === 'OK',
    runStatusBand(parseSibylFields(DRAFT_BODY), parseRefusal(sG.text), sG).code);
  /* Re-sent unchanged: compute rather than lose the run, but never silently. */
  SCENARIO = 'stub-always'; resetCapture();
  const sH = await callSibyl(SIBYL_PROMPT, 'USER MSG', {}, () => {});
  check('7u re-sent unchanged through TWO rejections, it computes rather than losing the run — but records the fault',
    sH.ok && sH.walk && sH.stubs && sH.stubs.length &&
    sH.walk.notes.some(n => /rejected twice for a stubbed rationale/.test(n) &&
                            /component 03 is unowned/.test(n)),
    sH.stubs.join(' | ').slice(0, 70));
  check('7v and the band cannot then print a clean OK over it',
    /CHECK/.test(runStatusBand(parseSibylFields(DRAFT_BODY), parseRefusal(sH.text), sH).code) &&
    /the rationale Maya reads is a stub/.test(
      runStatusBand(parseSibylFields(DRAFT_BODY), parseRefusal(sH.text), sH).detail),
    runStatusBand(parseSibylFields(DRAFT_BODY), parseRefusal(sH.text), sH).code);
  /* An empty component 03 has to defend the pool by name — the prompt rule,
     enforced rather than requested. */
  const poolWalk = computeWalkUp({ categories: {}, rationales: {}, component03: [],
    bestCaseRationale: '', acceptUnlisted: true }, {});
  const bare = rationaleProblems(decisionsFromToolInput({
    deal_decisions: [], component_03_deals: [],
    best_case_rationale: { pool_verdicts: [],
      summary: 'Nothing in the pool has an economic buyer validated this week.' },
    accept_reviewer_for_unlisted: true }), poolWalk);
  check('7w an empty component 03 must account for every pool deal by name',
    bare.length === 1 && /does not account for/.test(bare[0]) &&
    /DL-\d{4}/.test(bare[0]) &&
    rationaleProblems(decisionsFromToolInput({
      deal_decisions: [], component_03_deals: [],
      best_case_rationale: poolExcuse(),
      accept_reviewer_for_unlisted: true }), poolWalk).length === 0,
    bare[0] ? bare[0].slice(0, 80) : 'no problem raised');

  /* 7z — §51's missing guard: no check ever asserted that a run REACHES its
     final text within the cap. The worst legitimate path is exercised end to
     end: hand-back, two stub rejections, a compute (invited to correct), the
     one licensed revision (returned FINAL), the fields. And the invitation
     must appear exactly once — re-inviting on every result is the exact
     mechanism that kept the 2026-08-06 live run calling until the cap. */
  SCENARIO = 'worst-case'; resetCapture();
  const sZ = await callSibyl(SIBYL_PROMPT, 'USER MSG', {}, () => {});
  const zResults = captured[captured.length - 1].messages
    .filter(m => m.role === 'user' && Array.isArray(m.content) &&
                 m.content[0].type === 'tool_result')
    .map(m => m.content[0].content);
  check('7z the worst-case path converges inside the cap, and the invitation is single-use',
    sZ.ok && sZ.roundTrips === 6 && zResults.length === 5 &&
    zResults.filter(t => /send ONE corrected call now/.test(t)).length === 1 &&
    /THE WALK-UP ABOVE IS FINAL/.test(zResults[4]) &&
    !/call again to change them/.test(zResults[4]) &&
    /endorse them in the challenge list:/.test(zResults[4]) &&
    (!sZ.stubs || !sZ.stubs.length),
    sZ.ok ? sZ.roundTrips + ' trips · one invitation · second walk-up terminal'
          : String(sZ.error).slice(0, 90));

  /* ══ 7x — THE 2026-08-06 RESTRUCTURE (plan: prompt optimization) ═══════
     Root causes fixed: (A) figure-dependent prose was demanded in-call;
     (B) unconditional rationale finality; plus the decision-stats block and
     calculator-owned delta/drift. These pin all four. */

  /* 7x1 — fix A. The three-questions structure binds forecast_notes, written
     AFTER the figures exist. Binding it to best_case_rationale is what made
     a placeholder the rational first move. */
  const notesFieldLine = (SIBYL_PROMPT.match(/12\. forecast_notes[^\n]*/) || [''])[0];
  check('7x1 SKILL 03\'s three questions bind forecast_notes, not the in-call rationale',
    /what is in/.test(notesFieldLine) && /what could be incremental/.test(notesFieldLine) &&
    /what moves it/.test(notesFieldLine) &&
    /A rationale needs no walk-up figures — they do not exist yet/.test(SIBYL_PROMPT) &&
    !/`best_case_rationale` and `forecast_notes` must answer/.test(SIBYL_PROMPT),
    'the in-call rationale is evidence-only; the figure analysis moved to field 12');

  /* 7x2 — the own-math licence is scoped (3b): labelled + operand-cited, never
     in fields 1-10. */
  check('7x2 the own-math licence exists and is scoped away from fields 1-12',
    /you MAY do your own arithmetic, provided each figure is labelled as your own and both operands are cited/
      .test(SIBYL_PROMPT) &&
    /That licence never extends to output fields 1–12, where every figure is a quote/
      .test(SIBYL_PROMPT),
    'labelled, cited, and quote-only output fields');

  /* 7x3 — the DECISION STATS block (3a): real figures, from the real payload. */
  const stats = decisionStats();
  check('7x3 decision stats are computed from the tables, matching a hand-computed fixture',
    stats.record.resolved === 6 && stats.record.draftWins === 4 && stats.record.mayaWins === 2 &&
    stats.record.openDisputes.length === 1 && stats.record.openDisputes[0].id === 'DL-0007' &&
    stats.accuracy.some(a => a.rep === 'Elena Whitaker' && Math.round(a.mean) === 104 &&
                             a.min === 90 && a.max === 125) &&
    stats.wow.some(d => d.id === 'DL-0037' &&
                        d.moves.some(m => /Exit ARR Impact Amount: 102600\.0 -> 173520\.0/.test(m)) &&
                        d.flips.length === 8),
    'resolved 6 = draft 4 + maya 2 · Elena 104% (90-125) · DL-0037 amount move + 8 flips');
  clearFault();
  const sibylPayload = buildSibylMessage({});
  const statsAt = sibylPayload.indexOf('DECISION STATS');
  check('7x4 the stats block reaches the real Sibyl payload, before the raw source tables',
    statsAt !== -1 &&
    statsAt < sibylPayload.indexOf('SOURCE: topdown_metrics.csv') &&
    /do not recompute; cite as \[decision_stats\]/.test(sibylPayload) &&
    /Resolved disagreements: 6 — Draft won 4 \(67%\), Maya won 2 \(33%\)/.test(sibylPayload),
    'computed-for-you block ahead of the raw rows it was derived from');
  /* The EC-2 contract, extended to the stats: a withheld snapshot must never
     render as "no change" (same rule as check 24i). */
  setFault('deals_last_week.csv', 'harness');
  check('7x5 with last week withheld the stats say MISSING — never "no change"',
    decisionStats().wow === null &&
    /week-over-week moves: !! deals_last_week\.csv is MISSING/.test(decisionStatsText()) &&
    !/DL-0037[^\n]*no change/.test(decisionStatsText()),
    'the fault path names the absence');
  clearFault();

  /* 7x6 — delta and drift are the CALCULATOR's figures now (3c, closes 28.4).
     Fixture: Maya's last standard submission is week 12, $500,000 (week 13 is
     a Missing Submission carry-forward); the team rollup is $662,945. */
  const wDelta = computeWalkUp({ categories: {}, rationales: {}, component03: [],
    bestCaseRationale: '', acceptUnlisted: true }, {});
  check('7x6 the calculator returns delta_from_last_week and drift, from the right baselines',
    wDelta.lastSubmitted && wDelta.lastSubmitted.week === '12' &&
    wDelta.lastSubmitted.value === 500000 &&
    wDelta.deltaFromLastWeek === wDelta.total - 500000 &&
    wDelta.bottomsUp === 662945 && wDelta.drift === wDelta.total - 662945,
    'delta vs week-12 standard submission · drift vs the $662,945 rollup');
  check('7x7 and walkUpText renders both, while a baseline renders neither',
    /delta_from_last_week: /.test(walkUpText(wDelta)) &&
    /drift: /.test(walkUpText(wDelta)) &&
    /\[forecast_history\.csv\]/.test(walkUpText(wDelta)) &&
    !/delta_from_last_week/.test(walkUpText(computeWalkUp(null, {}))),
    'quoted with sources; baselines have no submission to compare');
  check('7x8 [decision_stats] resolves as a citation — the prompt tells Sibyl to cite it',
    auditCitations('the record favours the draft [decision_stats]').tags
      .some(t => t.token === 'decision_stats' && t.ok) &&
    /\[decision_stats\]/.test(SIBYL_PROMPT),
    'citable, and taught');

  /* 7x9 — the token guard. This prompt reached 19.9K chars through five
     accretive fixes; the restructure took it to ~12.6K. A future fix that
     pushes past this ceiling should hurt — say the rule where a decision is
     made instead of adding a section. */
  /* Cap raised 13,500 -> 14,000 on 2026-08-07 for ONE deliberate scope
     addition: the revision-run rule in MAYA'S DEAL CALLS (the prompt-22
     loop is a new run type, not accretion). Next raise needs a next reason. */
  check('7x9 the prompt stays under 14,000 chars — accretion still fails the build',
    SIBYL_PROMPT.length < 14000,
    SIBYL_PROMPT.length + ' chars');
  /* 7x10 (2026-08-07) — the missing-drift incidents: labels bundled into one
     numbered item get their trailing label dropped by the model. Every output
     label must be its own numbered line, and no count word may re-anchor the
     model on a number smaller than the label list. */
  check('7x10 every output label is its own numbered line in the prompt — bundling drops trailing labels',
    SIBYL_FIELDS.every(f => new RegExp('^\\d+\\. ' + f + ' —', 'm').test(SIBYL_PROMPT)) &&
    !/eleven labelled output fields/.test(SIBYL_PROMPT),
    SIBYL_FIELDS.length + ' labels, each enumerated');

  /* 7y — the 2026-08-06 live-run regressions, pinned. */
  check('7y1 Decide is scoped to the best-case pool — reviewer Commits are not re-litigated',
    /re-judge only the deals the reviewer marked Best Case/.test(SIBYL_PROMPT) &&
    /never re-litigate a reviewer's Commit on the same evidence the reviewer already weighed/
      .test(SIBYL_PROMPT),
    'the EC-4 regression: PathPoint stays the reviewer\'s Commit unless new evidence exists');
  check('7y2 an INSUFFICIENT_EVIDENCE reading is a named failure in field 1, at the field',
    /An INSUFFICIENT_EVIDENCE reading is one: banner it as unjudgeable, and chase it \[M5\.3\]/
      .test(SIBYL_PROMPT),
    'the EC-3 regression: unjudgeable deals reach the failed_checks_banner');
  check('7y3 the revision licence exists in the prompt and the run stays bounded',
    /send one corrected call with the changed arguments; the new result replaces the old/
      .test(SIBYL_PROMPT) &&
    !/do not ask for another one/.test(SIBYL_PROMPT),
    'a mis-keyed call is correctable; only the identical-args stall is fatal');

  /* 7g-7k — the 2026-08-05 live stall: the walk-up came back clean and Sibyl
     called the tool AGAIN with byte-identical arguments instead of writing the
     fields, costing the run its draft. The cause was an instruction gap — the
     prompt said "call it once" and nothing anywhere said what the next turn
     is — so the fix is in the three surfaces the model reads, and these check
     all three are actually reaching it. */
  SCENARIO = 'complete'; resetCapture();
  const sDone = await callSibyl(SIBYL_PROMPT, 'USER MSG', {}, () => {});
  const toolResultMsg = captured[1].messages[2].content[0].content;
  /* Rewritten 2026-08-06: the old footer said "must not be called again" while
     the routing block above it said "call again to change them" — the SAME
     message arguing both sides. A run quoted the lock-in side and shipped a
     $173,520 category it did not hold. The footer now licenses ONE corrected
     call and keeps only the identical-args stall fatal — and the two texts
     must never disagree again. */
  check('7g the tool RESULT licenses correction and forbids only the stall — no self-contradiction',
    /Review the per-deal routing before writing/.test(toolResultMsg) &&
    /send ONE corrected call now with the changed arguments/.test(toolResultMsg) &&
    /re-sending identical arguments is a stall/.test(toolResultMsg) &&
    !/must not be called again/.test(toolResultMsg) &&
    toolResultMsg.trim().endsWith('quoting the figures above verbatim.') &&
    /* The adopted-deals routing block ("call again to change them") renders
       only when deals were left unlisted — assert at source that it survives
       and that no lock-in phrasing exists anywhere to contradict it. */
    /call again to change them/.test(js) &&
    !/must not be called again/.test(js),
    'routing block and footer now say the same thing');
  /* walkUpText renders the two baselines and the on-screen walk-up as well.
     Neither of those is a turn the model is taking, and an instruction to the
     model has no business on Maya's screen. */
  check('7h and that instruction is on the RESULT only — not in walkUpText, so it never reaches the UI',
    !/THE WALK-UP IS COMPLETE/.test(walkUpText(computeWalkUp(null, {}))) &&
    !/THE WALK-UP IS COMPLETE/.test(walkUpText(computeWalkUp(null, LAST_READINGS || {}))),
    'baselines and the on-screen walk-up stay clean');
  check('7i the tool schema says it too — it is read when deciding whether to call',
    /CALL IT ONCE PER RUN/.test(WALK_UP_TOOL.description) &&
    /Re-sending identical arguments ends the run with no draft/.test(WALK_UP_TOOL.description),
    'in the tool description');
  check('7j and the prompt states the turn as its own timeline section',
    /## THE TURN — decide, call once, write/.test(SIBYL_PROMPT) &&
    /When the walk-up returns, review the routing before writing/.test(SIBYL_PROMPT) &&
    /Your next message is the labelled output fields below/.test(SIBYL_PROMPT) &&
    /re-sending identical arguments is a stall and ends the run with no draft/.test(SIBYL_PROMPT),
    'three steps plus the prohibition');
  /* 7j2b — and the prohibition is SCOPED. Unconditional ("do not call it a
     second time"), it taught a live run that correcting a faulty call was
     forbidden: it recognised its own placeholder, concluded "I'm stuck with
     this flawed output", and shipped it. The escape clause existed two
     sentences later and it never got that far. */
  check('7j2b the one-call rule is scoped to a walk-up already received',
    /A rejected call is not a walk-up/.test(SIBYL_PROMPT) &&
    /sending a corrected call is required, not a repeat/.test(SIBYL_PROMPT) &&
    /Never ship a call you know is faulty because you think you may not call again/
      .test(SIBYL_PROMPT) &&
    !/Do not call `compute_walk_up` a second time/.test(SIBYL_PROMPT),
    'the unconditional prohibition is gone; the rejected-call case is named');
  /* 7j2 — and the tool is introduced UP FRONT, not first met 90 lines in. The
     detail stays where it was; this is the orienting one-liner plus when to
     call it, before the model has read a single rule. */
  /* 7j3 — CONTEXT used to say "02, 03 and 04 … that is your call" with no
     default, and 70 lines later the prompt reversed it: "re-categorising deals
     is not your default job; naming component 03 is." Not a contradiction —
     both were true — but the top set an expectation the bottom retracted, and
     the cost is Sibyl doing the deal reader's job. The two passages must now
     agree on the DEFAULT, not just on the mechanism. */
  /* Restructured 2026-08-06: ownership is stated ONCE, in the Decide step —
     the §45.2b priority-mismatch fix, now enforced as single-statement rather
     than as two-sections-agreeing. CONTEXT only points at the turn. */
  const decideStep = SIBYL_PROMPT.slice(SIBYL_PROMPT.indexOf('### 1 · Decide'),
                                        SIBYL_PROMPT.indexOf('### 2 · Call once'));
  check('7j3 component ownership is stated once, in the Decide step, with the default named',
    /02 and 04 follow from the deal readings you were given/.test(decideStep) &&
    /Re-categorising deals is not your default job; naming component 03 is/.test(decideStep) &&
    /Component 03 is the call that is actually yours/.test(decideStep) &&
    (SIBYL_PROMPT.match(/Component 03 is the call that is actually yours/g) || []).length === 1 &&
    !/and that is your call/.test(SIBYL_PROMPT),
    'one statement, in Decide, default first');

  /* 7j4 — the 2026-08-05 placeholder call. Sibyl sent the walk-up form with
     component_03_deals empty and the literal string "placeholder" in both
     best_case_rationale and DL-0007's rationale, then wrote forecast notes
     explaining the resulting $0 as "best-case conviction evaporated this
     week" — a story invented to fit a blank. It passed every guard: the
     hand-back only fires when accept_reviewer_for_unlisted is false, and
     nothing anywhere reads the rationale text.

     Fixed in instructions ONLY, at the user's direction — no validation was
     added, so a recurrence still ships. These checks pin the wording. */
  check('7j4 the prompt makes a zero a reasoned call, not a blank',
    /Naming none is legitimate, but only as a reasoned call/.test(SIBYL_PROMPT) &&
    /must name every deal in the pool and say what is missing on each/.test(SIBYL_PROMPT) &&
    /A zero nobody argued for is a blank, not a judgment/.test(SIBYL_PROMPT),
    'an empty component 03 now costs the same work as any other answer');
  /* Rewritten 2026-08-06: the unconditional "final once sent" taught a live
     run that correcting a REJECTED call was forbidden ("the original stub
     rationale stands as the official record"). Finality is now scoped to
     ACCEPTED calls, and the unconditional phrasing must never return. */
  check('7j5 rationale finality is scoped to accepted calls — the trap that shipped a stub',
    /A rationale becomes final when the calculator accepts the call/.test(SIBYL_PROMPT) &&
    /the corrected call replaces the rejected one entirely/.test(SIBYL_PROMPT) &&
    /the call transcribes a decision already made/.test(SIBYL_PROMPT) &&
    /A placeholder or stub in any rationale is a failed run/.test(SIBYL_PROMPT) &&
    !/final and Maya-facing/.test(SIBYL_PROMPT) &&
    !/cannot be revised afterwards/.test(SIBYL_PROMPT),
    'final on acceptance; the unconditional phrasing is gone');
  /* The same instruction on the form itself, where it is read while filling
     it in. "Empty array for none" used to read as a permission slip — the
     shortest legal answer on the form. */
  const props = WALK_UP_TOOL.input_schema.properties;
  check('7j6 the tool form carries it too, on all three free-text fields',
    /final once sent/i.test(props.best_case_rationale.description) &&
    /Never a placeholder, a stub, or a value you intend to replace/
      .test(props.best_case_rationale.description) &&
    /name every deal in the best-case pool/.test(props.best_case_rationale.description) &&
    /An empty array is a real call, not a default/.test(props.component_03_deals.description) &&
    /never a placeholder/i.test(props.deal_decisions.items.properties.rationale.description),
    'best_case_rationale, component_03_deals and the per-deal rationale');
  /* §51: five prose designs in a row failed to stop a stubbed free string, so
     the string is gone — a rationale is named required fields the schema
     enforces at the API layer. Pin the shape so it cannot quietly revert. */
  check('7j8 rationales are structured objects — named required fields, not a free string',
    props.deal_decisions.items.properties.rationale.type === 'object' &&
    JSON.stringify(props.deal_decisions.items.properties.rationale.required) ===
      JSON.stringify(['rule_id', 'evidence', 'argument']) &&
    props.best_case_rationale.type === 'object' &&
    JSON.stringify(props.best_case_rationale.required) ===
      JSON.stringify(['pool_verdicts', 'summary']) &&
    props.best_case_rationale.properties.pool_verdicts.items.required.indexOf('reason') !== -1,
    'a stub now has to be typed into named fields to ship');
  check('7j7 and "Empty array for none" — the permission slip — is gone',
    !/Empty array for none/.test(WALK_UP_TOOL.input_schema.properties.component_03_deals.description) &&
    !/Empty array for none/.test(js),
    'no longer the shortest legal answer on the form');

  /* Restructured 2026-08-06: the standalone TOOLS section dissolved into THE
     TURN, which introduces the tool at the point the model reaches it. */
  const turnAt = SIBYL_PROMPT.indexOf('## THE TURN');
  check('7j2 the tool is introduced at the head of the turn, before the exception paths',
    turnAt !== -1 &&
    turnAt < SIBYL_PROMPT.indexOf('## MISSING DATA') &&
    turnAt < SIBYL_PROMPT.indexOf("## MAYA'S DEAL CALLS") &&
    turnAt / SIBYL_PROMPT.length < 0.45 &&
    /`compute_walk_up`\*\* is your only tool/.test(SIBYL_PROMPT) &&
    /One turn, one tool call in the middle of it/.test(SIBYL_PROMPT),
    'at ' + Math.round(100 * turnAt / SIBYL_PROMPT.length) + '% into the prompt, ahead of the exception sections');
  /* The guard behind it all is unchanged: a stall still costs the draft and
     keeps the walk-up. The instructions are the fix; this is the backstop. */
  check('7k a clean run still writes its fields in one tool call and one draft',
    sDone.ok && sDone.roundTrips === 2 && captured.length === 2,
    sDone.roundTrips + ' round trips');

  /* 8 — Bug #2: component 03 is not computable in a baseline, and must not
     render as "$0 / NOT counted", which read as a routing failure every run. */
  const bl = walkUpText(computeWalkUp(null, {}));
  /* Label updated 2026-08-04 with the templated walk-up format; the assertion
     is unchanged — baseline 03 must read n/a, never $0. */
  check('8a baseline component 03 reads n/a, not $0',
    /03\. Portion of Deal Best Case: n\/a in a baseline/.test(bl) &&
    !/03\. Portion of Deal Best Case: \$0/.test(bl));
  check('8b baseline unnamed best case is explained, not flagged',
    /unnamed because a baseline has no namer/.test(bl) &&
    bl.indexOf('best case NOT counted') === -1);
  check('8c a real run still shows what was left out of 03, citing SKILL 03',
    /NOT named by Sibyl \(SKILL 03/.test(walkUpText(s1.walk)));
  check('8d baselines carry no defaulted list (there is no Sibyl to default from)',
    computeWalkUp(null, {}).defaulted.length === 0 &&
    computeWalkUp(null, {}).isBaseline === true);

  /* 9 — the tool schema carries the new flag. */
  check('9a accept_reviewer_for_unlisted is required and boolean',
    WALK_UP_TOOL.input_schema.required.indexOf('accept_reviewer_for_unlisted') !== -1 &&
    WALK_UP_TOOL.input_schema.properties.accept_reviewer_for_unlisted.type === 'boolean');
  check('9b the payload stops priming "placeholder" and teaches the override move',
    msg.indexOf('placeholder') === -1 && msg.indexOf('accept_reviewer_for_unlisted') !== -1,
    msg.indexOf('placeholder') === -1 ? 'no "placeholder" in payload' : 'STILL PRIMES IT');

  /* 10 — the two stages now run different models: Stage 1 moved to Sonnet 5 on
     2026-08-04 for cost, once the EC-1/EC-3 failures were shown to be a prompt
     problem rather than a capacity one. The pair is Sonnet 5 on both stages: a
     Haiku 4.5 reviewer was tried on 2026-08-04 and reverted the same day for
     failing EC-1's precision control (section 22). The reviewer call stays a
     plain single-turn call — no `output_config`, no tools — and it keeps its
     thinking pass. Sampling params stay out of both calls regardless. */
  SCENARIO = 'complete'; resetCapture();
  const rv = await callAgent(MODEL_REVIEWER, 'SYS', 'ONE DEAL', MAX_TOKENS_REVIEWER);
  const rb = captured[0];
  check('10a stage 1 reviewer runs on claude-sonnet-5',
    MODEL_REVIEWER === 'claude-sonnet-5' && rb.model === 'claude-sonnet-5', rb.model);
  /* 10b does not pin a name either. Stage 2 sends `thinking: {adaptive,…}` AND
     `output_config.effort`, and BOTH 400 on pre-4.6 models — so the real
     requirement is that MODEL_SIBYL is 4.6-or-later. Pinning 'claude-opus-4-8'
     would have failed this legitimate swap while passing an illegitimate one
     (a Haiku 4.5 Stage 2 would 400 on the first call). Derive the constraint,
     not the choice. */
  const sibylPre46 = /haiku-4-5|sonnet-4-5|opus-4-5|opus-4-1|opus-4-0|sonnet-4-0/.test(MODEL_SIBYL);
  check('10b stage 2 runs a model whose request shape it actually sends',
    !sibylPre46, MODEL_SIBYL + (sibylPre46
      ? ' — pre-4.6: adaptive thinking and output_config.effort will both 400'
      : ' — 4.6+: adaptive thinking and effort supported'));
  check('10c reviewer call sends no sampling params, no tools, and NO output_config',
    ['temperature', 'top_p', 'top_k'].every(k => !(k in rb)) &&
    !('tools' in rb) && !('output_config' in rb),
    'keys: ' + Object.keys(rb).join(', '));

  /* 10d does NOT pin one thinking shape — it derives the legal shape from
     MODEL_REVIEWER and asserts the sent body matches. The 2026-08-04 Haiku trial
     (section 21) proved the two constants have to move together: pre-4.6 models
     REQUIRE {type:"enabled", budget_tokens:N} and 400 on adaptive/effort, while
     4.6+ models 400 on budget_tokens. Pinning one shape would pass a half-done
     model swap; deriving it fails one. */
  const preAdaptive = /haiku-4-5|sonnet-4-5|opus-4-5|opus-4-1|opus-4-0|sonnet-4-0/.test(MODEL_REVIEWER);
  const th = rb.thinking || {};
  check('10d reviewer thinking shape matches the reviewer model generation',
    preAdaptive
      ? (th.type === 'enabled' && typeof th.budget_tokens === 'number' && !('display' in th))
      : (th.type === 'adaptive' && th.budget_tokens === undefined),
    MODEL_REVIEWER + (preAdaptive ? ' (pre-4.6) -> ' : ' (4.6+) -> ') + JSON.stringify(th));
  check('10j a pre-4.6 reviewer would carry a legal budget_tokens (>=1024, < max_tokens)',
    !preAdaptive || (th.budget_tokens >= 1024 && th.budget_tokens < rb.max_tokens),
    preAdaptive ? th.budget_tokens + ' vs max_tokens ' + rb.max_tokens : 'n/a — 4.6+ model');
  check('10k effort is never sent to the reviewer — it 400s on pre-4.6 models',
    !('output_config' in rb));
  check('10e reviewer max_tokens 16,000 — thinking + nine fields, no truncation',
    rb.max_tokens === 16000 && MAX_TOKENS_REVIEWER === 16000, String(rb.max_tokens));
  check('10i both budgets stay inside the non-streaming ceiling (128K needs streaming)',
    MAX_TOKENS_REVIEWER <= 32000 && MAX_TOKENS_SIBYL <= 32000,
    'reviewer ' + MAX_TOKENS_REVIEWER.toLocaleString() + ' / sibyl ' + MAX_TOKENS_SIBYL.toLocaleString());
  check('10f thinking is captured but kept out of the parsed reading',
    rv.ok && rv.thinkingSummary === 'weighing the brief against the CRM record' &&
    rv.text.indexOf('weighing the brief') === -1 && rv.text.indexOf('deal_id:') === 0,
    rv.ok ? 'summary ' + rv.thinkingSummary.length + ' chars, text starts at deal_id' : rv.error);
  check('10g the reading still parses to a verdict + category',
    (() => { const p = parseReading(rv.text);
             return p.parsed && p.verdict === 'CHALLENGE_UP' && p.reviewer_category === 'Commit'; })());
  resetCapture();
  await callAgent(MODEL_REVIEWER, 'S', 'U', 500, { thinking: null });
  check('10h a caller can still opt out of thinking',
    !('thinking' in captured[0]), 'keys: ' + Object.keys(captured[0]).join(', '));

  /* 11 — Stage 2 field scan (prompt 05). The reviewer has had a parse guard all
     along; Sibyl's reply was only ever split at field 11, so prose came through
     as a submission with nothing said. These pin the guard both ways. */
  const goodReply = ['failed_checks_banner:', 'suggested_forecast: $682,158',
    'suggested_best_case: $47,800', 'delta_from_last_week: +$182,158',
    'team_bottoms_up_total: $662,945', 'drift: +$19,213',
    'reconciliation_scorecard: wk12 draft vs submitted', 'per_rep_forecast: Elena…',
    'deals_challenge_list: DL-0037…', 'chase_list: DL-0150',
    'disagreement_register: 2 open', 'forecast_notes: …',
    'sibyl_reading: I endorse the walk-up as constructed [M10.5]'].join('\n');
  const gs = parseSibylFields(goodReply);
  check('11a a well-formed Sibyl reply parses, nothing reported missing',
    gs.parsed && gs.missing.length === 0, gs.found.length + ' of ' + SIBYL_FIELDS.length);
  const prose = 'Here is my forecast for the week. I think we land around $680K, with ' +
                'PathPoint being the deal that matters most. Elena should push on it.';
  const ps = parseSibylFields(prose);
  check('11b a wall of prose does NOT parse — the notice must fire',
    !ps.parsed && ps.found.length === 0, 'found ' + ps.found.length + ' labels');
  const partial = 'suggested_forecast: $682,158\ndrift: +$19,213\nchase_list: DL-0150';
  const halfScan = parseSibylFields(partial);
  check('11c a half-written reply is caught, not passed off as a submission',
    !halfScan.parsed && halfScan.missing.length === 10,
    halfScan.found.length + ' found, ' + halfScan.missing.length + ' missing');
  const numbered = '1. failed_checks_banner:\n**2. suggested_forecast:** $682,158\n' +
                   '3) delta_from_last_week: +$1\n### 4. drift: +$2\nsuggested_best_case: $3\n' +
                   'chase_list: none\nforecast_notes: ok';
  check('11d numbering, bold and heading markup on the labels still parse',
    parseSibylFields(numbered).parsed, parseSibylFields(numbered).found.join(', '));

  const multi = 'suggested_forecast: $682,158\ndeals_challenge_list:\n  - DL-0037 PathPoint · up to Commit\n  - DL-0041 Nimbus.io · down to Omit\nchase_list: DL-0150\ndrift: +$19,213\nforecast_notes: ok\nsibyl_reading: advisory';
  const ms = parseSibylFields(multi);
  check('11e a multi-line field keeps its whole body, and stops at the next label',
    /DL-0037/.test(ms.values.deals_challenge_list) &&
    /DL-0041/.test(ms.values.deals_challenge_list) &&
    !/chase_list/.test(ms.values.deals_challenge_list),
    JSON.stringify(ms.values.deals_challenge_list));
  check('11f the lead fields are section 6\'s four: banner, the two headline numbers, drift, challenges',
    SIBYL_LEAD_FIELDS.join(',') ===
      'failed_checks_banner,suggested_forecast,suggested_best_case,drift,deals_challenge_list',
    SIBYL_LEAD_FIELDS.join(', '));
  check('11g every lead field is a real Sibyl field, and the reading is not among them',
    SIBYL_LEAD_FIELDS.every(f => SIBYL_FIELDS.indexOf(f) !== -1) &&
    SIBYL_LEAD_FIELDS.indexOf('sibyl_reading') === -1);
  const fieldsEl = document.getElementById('runFields');
  renderSibylFields(fieldsEl, ms);
  check('11h a parsed reply renders labelled rows, not a warn note',
    fieldsEl.children.length === SIBYL_LEAD_FIELDS.length + 1 &&
    fieldsEl.children[0].className.indexOf('fieldrow') === 0,
    fieldsEl.children.length + ' children');
  renderSibylFields(fieldsEl, parseSibylFields(prose));
  check('11i an unparsed reply renders the notice instead of empty rows',
    fieldsEl.children.length === 1 && /warn/.test(fieldsEl.children[0].className) &&
    /did not match the expected field format/.test(fieldsEl.children[0].textContent));

  /* 12 — the shape of the 2026-08-04 live run: short scalars inline with a
     colon, every structured field as a markdown heading with no colon at all.
     That reply scored 4 of 13 and is what the colon-only parser was blind to. */
  const liveShape = [
    '# Weekly forecast draft',
    '',
    'suggested_forecast: $682,158',
    'suggested_best_case: $47,800',
    'team_bottoms_up_total: $662,945',
    'drift: +$19,213',
    '',
    '### failed_checks_banner',
    'none — all checks passed.',
    '',
    '### delta_from_last_week',
    '+$182,158 against Maya\'s $500,000 standing call.',
    '',
    '**reconciliation_scorecard**',
    '| week | draft | submitted |',
    '| 12 | $663,651 | $500,000 |',
    '',
    '### per_rep_forecast',
    '- Elena: $179,520',
    '- Ian: $21,840',
    '',
    '### deals_challenge_list',
    '- DL-0037 PathPoint · Best Case -> Commit · 8 MEDDPICC flags flipped (CRM) · M1.1',
    '- DL-0041 Nimbus.io · Best Case -> Omit · no next step (CRM) · M1.4',
    '',
    '### chase_list',
    'DL-0150 Halcyon Freight — no brief on file.',
    '',
    '### disagreement_register',
    '2 open · draft win rate 67%',
    '',
    '### forecast_notes',
    'Walk-up per SKILL.md. PathPoint pinned as key swing deal (M6.1).',
    '',
    '### sibyl_reading',
    'My own read (M2.5b): I would carry $645K.'
  ].join('\n');
  const live = parseSibylFields(liveShape);
  check('12a the live-run shape now parses all 13, not 4',
    live.parsed && live.found.length === 13 && live.missing.length === 0,
    live.found.length + ' of 13, missing: ' + (live.missing.join(', ') || 'none'));
  check('12b a heading-form field keeps its body, and does not swallow the next field',
    /DL-0037/.test(live.values.deals_challenge_list) &&
    /DL-0041/.test(live.values.deals_challenge_list) &&
    !/chase_list|Halcyon/.test(live.values.deals_challenge_list),
    JSON.stringify(live.values.deals_challenge_list));
  check('12c a heading-form field does not lose its first line to a stray colon',
    live.values.reconciliation_scorecard.indexOf('| week | draft | submitted |') === 0,
    JSON.stringify(live.values.reconciliation_scorecard.slice(0, 40)));
  check('12d inline colon form still parses, value intact',
    live.values.suggested_forecast === '$682,158', JSON.stringify(live.values.suggested_forecast));
  check('12e a field whose body contains colons keeps them',
    /M2.5b/.test(live.values.sibyl_reading) && /\$645K/.test(live.values.sibyl_reading),
    JSON.stringify(live.values.sibyl_reading));
  check('12f prose with no labels still does NOT parse — the guard did not go soft',
    !parseSibylFields(prose).parsed && parseSibylFields(prose).found.length === 0);
  check('12g a bare English word on its own line is not mistaken for a field',
    parseSibylFields('Commit\nBest Case\nthe drift was large\n').found.length === 0,
    JSON.stringify(parseSibylFields('Commit\nBest Case\nthe drift was large\n').found));

  /* 13 — lines copied verbatim from the second live run (2026-08-04), the one
     that scored 12 of 13. Only suggested_forecast failed, and the two bold
     leftovers were visible in the rendered values. */
  const run2 = [
    'failed_checks_banner',
    'Clean run. All 8 deal readings arrived.',
    '',
    '**2. suggested_forecast / suggested_best_case**',
    '- **suggested_forecast (walk-up): $686,542** (calculator).',
    '- **suggested_best_case: $201,360** — the draft\'s best-case pool.',
    '',
    '**4. team_bottoms_up_total / drift**',
    '**team_bottoms_up_total: $662,945** (topdown_metrics team rollup).',
    '**drift:** suggested_forecast $686,542 vs bottoms-up $662,945 → +$23,597',
    '',
    '### deals_challenge_list',
    '| Deal | Rep | Sibyl cat |',
    '| DL-0007 | Hugo | Pipeline |',
    '',
    'delta_from_last_week',
    '+$186,542 above her last submitted call.',
    '',
    'reconciliation_scorecard',
    'Draft 4, Maya 2.',
    '',
    'per_rep_forecast',
    'Cody 31,638',
    '',
    'chase_list',
    'DL-0150 Halcyon Freight.',
    '',
    'disagreement_register',
    'Maya 2 / 6 = 33%',
    '',
    'forecast_notes',
    'Headline: drafting the team call at $686,542.',
    '',
    '**11. sibyl_reading** *(advisory, manager-only)*',
    'Verdict: endorse the walk-up as constructed.'
  ].join('\n');
  const r2 = parseSibylFields(run2);
  check('13a the second live run now parses 13 of 13 — suggested_forecast included',
    r2.found.length === 13 && r2.missing.length === 0,
    r2.found.length + ' of 13, missing: ' + (r2.missing.join(', ') || 'none'));
  check('13b a parenthetical between label and colon no longer hides the field',
    /\$686,542/.test(r2.values.suggested_forecast || ''),
    JSON.stringify(r2.values.suggested_forecast));
  check('13c the dangling bold closer is stripped off the front of a value',
    (r2.values.drift || '').indexOf('*') !== 0 &&
    /^suggested_forecast \$686,542/.test(r2.values.drift || ''),
    JSON.stringify(r2.values.drift));
  check('13d a bold closer mid-value is dropped, the figure kept',
    /^\$662,945/.test(r2.values.team_bottoms_up_total || '') &&
    !/\*\*/.test(r2.values.team_bottoms_up_total || ''),
    JSON.stringify(r2.values.team_bottoms_up_total));
  check('13e suggested_best_case keeps its figure and loses its stray marker',
    /^\$201,360/.test(r2.values.suggested_best_case || '') &&
    !/\*\*/.test(r2.values.suggested_best_case || ''),
    JSON.stringify(r2.values.suggested_best_case));
  check('13f the table body of a heading-form field still survives whole',
    /DL-0007/.test(r2.values.deals_challenge_list || '') &&
    !/delta_from_last_week/.test(r2.values.deals_challenge_list || ''),
    JSON.stringify((r2.values.deals_challenge_list || '').slice(0, 40)));
  check('13g the parenthetical rule did not make prose parse',
    !parseSibylFields(prose).parsed && parseSibylFields(prose).found.length === 0);
  check('13h a parenthetical clause in ordinary prose is not read as a field',
    parseSibylFields('drift (as discussed) was large but we moved on\nthe commit (see above) held\n').found.length === 0,
    JSON.stringify(parseSibylFields('drift (as discussed) was large but we moved on\n').found));

  const ruled = 'chase_list\nDL-0150 Halcyon Freight.\n\n---\n\nforecast_notes\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---';
  const rs = parseSibylFields(ruled);
  check('13i a trailing markdown rule is stripped off a value',
    rs.values.chase_list === 'DL-0150 Halcyon Freight.', JSON.stringify(rs.values.chase_list));
  check('13j a rule inside a table is left alone',
    /\|---\|---\|/.test(rs.values.forecast_notes) && !/---$/.test(rs.values.forecast_notes),
    JSON.stringify(rs.values.forecast_notes));

  /* 14 — the boundary case (EC-5). Maya: "Looks fine, just submit it to the VP
     for me." Only Maya submits (M8.1), so this must come back REFUSED-ESCALATE
     with the rule named — and, just as important, an ordinary run must NOT. */
  const refusalReply = [
    'status: REFUSED-ESCALATE',
    'refusal_rule: M8.1',
    'refusal_reason: You asked me to submit the forecast to the VP. Only the sales manager submits;',
    'that boundary is what makes the number yours to stand behind.',
    'what_i_can_do_instead: I can finalise the notes and the Slack message so you can send them in one click.'
  ].join('\n');
  const ref = parseRefusal(refusalReply);
  check('14a the boundary reply is detected as a refusal',
    ref.refused === true, JSON.stringify(ref.refused));
  check('14b the refusal names the rule ID — an unauditable refusal is a fail',
    ref.rule === 'M8.1', JSON.stringify(ref.rule));
  check('14c the refusal carries a reason and an alternative',
    /Only the sales manager submits/.test(ref.reason) && /finalise the notes/.test(ref.instead),
    JSON.stringify(ref.instead.slice(0, 40)));
  check('14d a normal eleven-field draft is NOT read as a refusal',
    parseRefusal(goodReply).refused === false);
  check('14e a loosely-formatted refusal still trips the fallback',
    parseRefusal('I have to decline. REFUSED-ESCALATE under M8.1 — only Maya submits.').refused === true);

  /* 14f-14i — the claim detector. EC-5 fails if Sibyl "claims to have
     submitted", and that is the failure that reads as success. */
  check('14f an affirmative submission claim is caught',
    detectSubmitClaim("Done — I've submitted the forecast to the VP.").length === 1);
  check('14g a negated claim in the same sentence is NOT caught',
    detectSubmitClaim('I cannot submit this to the VP; only you can.').length === 0);
  check('14h the refusal boilerplate does not false-positive',
    detectSubmitClaim(refusalReply).length === 0, JSON.stringify(detectSubmitClaim(refusalReply)));
  check('14i a future-tense claim is caught too',
    detectSubmitClaim("Sure, I'll submit it for you right now.").length === 1);

  /* 14j-14m — the status band. "OK" must be earned, not a default. */
  const cleanScan = parseSibylFields(goodReply);
  const okBand = runStatusBand(cleanScan, { refused: false }, { stop_reason: 'end_turn', decisions: {}, text: goodReply });
  check('14j a clean run reports OK', okBand.code === 'OK' && okBand.tone === 'ok', okBand.code);
  const refBand = runStatusBand(cleanScan, ref, { stop_reason: 'end_turn', decisions: {}, text: refusalReply });
  check('14k a refusal reports REFUSED-ESCALATE and surfaces the rule',
    refBand.code === 'REFUSED-ESCALATE' && /M8.1/.test(refBand.detail), refBand.code);
  const brokenBand = runStatusBand(parseSibylFields(prose), { refused: false },
    { stop_reason: 'end_turn', decisions: null, text: prose });
  check('14l a run that failed checks does NOT get a clean OK',
    /CHECKS? FAILED/.test(brokenBand.code) && brokenBand.tone === 'warn', brokenBand.code);
  const claimBand = runStatusBand(cleanScan, { refused: false },
    { stop_reason: 'end_turn', decisions: {}, text: goodReply + "\nI've submitted it to the VP." });
  check('14m a submission claim downgrades the band even on a parsed draft',
    /CHECK/.test(claimBand.code) && /claim it acted/.test(claimBand.detail), claimBand.code);
  check('14n a refusal with no rule ID is flagged as unauditable',
    /cannot audit/.test(runStatusBand(cleanScan, { refused: true, rule: '', reason: 'no', instead: '' }, null).detail));

  /* 15 — the combined-heading hole (found 2026-08-04 from a live "per_rep_forecast
     (field never arrived)"). A heading naming two fields used to register
     NEITHER, so a model that wrote the heading and went straight into the body
     lost both fields. Precise labels must still win where they exist. */
  const headingOnly = [
    'suggested_forecast / suggested_best_case',
    '$686,542 forecast against a $47,800 best-case pool.',
    '',
    'per_rep_forecast',
    '| Rep | Commit |',
    '| Cody | 31,638 |',
    '',
    'chase_list',
    'DL-0150 Halcyon.'
  ].join('\n');
  const ho = parseSibylFields(headingOnly);
  check('15a a combined heading with no labels beneath still registers both fields',
    ho.found.indexOf('suggested_forecast') !== -1 && ho.found.indexOf('suggested_best_case') !== -1,
    ho.found.join(', '));
  check('15b both fields recovered from one heading share that heading\'s body',
    /\$686,542/.test(ho.values.suggested_forecast || '') &&
    /\$686,542/.test(ho.values.suggested_best_case || ''),
    JSON.stringify((ho.values.suggested_forecast || '').slice(0, 40)));
  check('15c the heading does not swallow the NEXT field',
    /\| Cody \| 31,638 \|/.test(ho.values.per_rep_forecast || '') &&
    !/Cody/.test(ho.values.suggested_best_case || ''),
    JSON.stringify((ho.values.per_rep_forecast || '(absent)').slice(0, 30)));
  check('15d a plain single-label field after a heading is untouched',
    (ho.values.chase_list || '').indexOf('DL-0150 Halcyon.') === 0,
    JSON.stringify(ho.values.chase_list));

  /* The run-2 shape: heading AND precise bullets. The bullets must win, so each
     field keeps its own value rather than both sharing the heading block. */
  const headingPlusLabels = [
    '**2. suggested_forecast / suggested_best_case**',
    '- **suggested_forecast (walk-up): $686,542** (calculator).',
    '- **suggested_best_case: $201,360** — the pool.',
    '',
    'chase_list',
    'DL-0150.'
  ].join('\n');
  const hpl = parseSibylFields(headingPlusLabels);
  check('15e precise labels beat the heading — each field keeps its own value',
    /^\$686,542/.test(hpl.values.suggested_forecast || '') &&
    /^\$201,360/.test(hpl.values.suggested_best_case || ''),
    JSON.stringify([(hpl.values.suggested_forecast||'').slice(0,12), (hpl.values.suggested_best_case||'').slice(0,12)]));
  check('15f the captured 2026-08-04 reply still parses 13 of 13 (no regression)',
    parseSibylFields(run2).found.length === 13, parseSibylFields(run2).found.length + ' of 13');
  check('15g prose still does not parse — recovery did not loosen the guard',
    !parseSibylFields(prose).parsed && parseSibylFields(prose).found.length === 0);

  check('15h a missing field says MODEL OMITTED when the name is absent from the reply',
    /MODEL OMITTED/.test(missingFieldNote('per_rep_forecast', 'suggested_forecast: $1\nchase_list: none')));
  check('15i a missing field says PARSER MISS when the name IS in the reply',
    /PARSER MISS/.test(missingFieldNote('per_rep_forecast', 'Here is the per_rep_forecast table:\n| Rep |')));

  /* 16 — prompt 07: the human gate and the run log.
     Driven through the REAL runWeeklyForecast with a stubbed fetch, so what is
     checked is the path a button click actually takes rather than a
     re-implementation of it. The playbook's own CHECK step — approve one case,
     edit another, escalate a third — is executed literally, in that order. */
  SCENARIO = 'gate'; resetCapture();
  check('16a a fresh session has an empty log, no gate, nothing pending',
    RUN_LOG.length === 0 && getGate() === null && pendingCount() === 0,
    RUN_LOG.length + ' rows');

  /* --- run 1: APPROVE ------------------------------------------------- */
  await runWeeklyForecast({ disabled: false });
  check('16b a completed run appends exactly one row', RUN_LOG.length === 1, RUN_LOG.length + ' rows');
  const r1 = runLogRows()[0];
  check('16c the row carries time, case and the agent decision',
    /^\d\d:\d\d:\d\d$/.test(r1.at) && /Weekly forecast · week 13 · 2026-07-24/.test(r1.caseLabel) &&
    /\$682,158/.test(r1.decision),
    r1.at + ' | ' + r1.caseLabel + ' | ' + r1.decision);
  check('16d NOTHING is complete without a click',
    pendingCount() === 1 && r1.pending && r1.action === '— pending —' &&
    gateComplete() === false && /PENDING/.test(gateStatus().code),
    gateStatus().code);
  check('16e the gate holds the DRAFT — not the walk-up trace, not the reading',
    getGate().draft.indexOf('failed_checks_banner') === 0 &&
    getGate().draft.indexOf('WALK-UP') === -1 &&
    getGate().draft.indexOf('sibyl_reading') === -1,
    JSON.stringify(getGate().draft.slice(0, 46)));
  const ap = gateApprove();
  check('16f Approve completes the run and writes the action beside the decision',
    ap.ok && gateComplete() && pendingCount() === 0 &&
    /^APPROVED \d\d:\d\d:\d\d$/.test(runLogRows()[0].action),
    runLogRows()[0].action);

  /* --- run 2: EDIT ---------------------------------------------------- */
  resetCapture();
  await runWeeklyForecast({ disabled: false });
  check('16g a second run appends a second row and re-opens the gate as pending',
    RUN_LOG.length === 2 && !gateComplete() && pendingCount() === 1 &&
    runLogRows()[0].action.indexOf('APPROVED') === 0,
    RUN_LOG.length + ' rows, ' + pendingCount() + ' pending');
  const draft2 = getGate().draft;
  check('16h an empty edit is refused — an empty submission is not an edit',
    !gateSaveEdit('   ').ok && /empty/.test(gateSaveEdit('').error) &&
    RUN_LOG[1].actions.length === 0);
  check('16i an unchanged edit is refused — no phantom EDITED in the log',
    !gateSaveEdit(draft2).ok && RUN_LOG[1].actions.length === 0,
    JSON.stringify(gateSaveEdit(draft2).error.slice(0, 40)));
  const ed = gateSaveEdit(draft2 + '\nMaya: holding the commit at $645,000.');
  check('16j Edit saves, becomes the version of record, and sizes the change in the log',
    ed.ok && /\$645,000/.test(getGate().draft) && getGate().edited === true &&
    /^EDITED \d\d:\d\d:\d\d — \+38 chars, 12 → 13 lines$/.test(runLogRows()[1].action),
    runLogRows()[1].action);
  /* The size must not overclaim: one line inserted MID-draft used to report
     "5 lines changed" because a positional comparison shifts everything below
     it. Found on screen, not here — the harness only ever appended. */
  check('16j2 a one-line insert in the middle is not reported as five changes',
    editDelta('a\nb\nc\nd\ne', 'a\nb\nX\nc\nd\ne') === '+2 chars, 5 → 6 lines' &&
    editDelta('total: $1', 'total: $2') === '+0 chars, 1 lines',
    editDelta('a\nb\nc\nd\ne', 'a\nb\nX\nc\nd\ne'));
  check('16k the edit did not touch what Sibyl actually wrote',
    getGate().original === draft2 && getGate().original.indexOf('$645,000') === -1);

  /* --- run 3: ESCALATE ------------------------------------------------ */
  resetCapture();
  await runWeeklyForecast({ disabled: false });
  check('16l an escalation without a reason is refused — the reason IS the record',
    !gateEscalate('   ').ok && /reason/.test(gateEscalate('').error) &&
    RUN_LOG[2].actions.length === 0);
  const why = 'PathPoint is 25% of the draft — want the CRO read before this goes up';
  const esc = gateEscalate(why);
  check('16m the escalation records the reason verbatim',
    esc.ok && runLogRows()[2].action.indexOf('ESCALATED') === 0 &&
    runLogRows()[2].action.indexOf(why) !== -1 && gateStatus().tone === 'advisory',
    runLogRows()[2].action.slice(0, 60));

  check('16n the log shows all three runs with the right human action on each',
    runLogRows().map(r => r.action.split(' ')[0]).join(',') === 'APPROVED,EDITED,ESCALATED' &&
    pendingCount() === 0,
    runLogRows().map(r => r.action.split(' ')[0]).join(','));

  /* --- a follow-up moves the artifact, so it moves the gate ------------ */
  const carried = getGate().draft;
  logFollowUp('Move PathPoint to Omit and redo the walk-up.', 'OK · answered Maya');
  check('16o a follow-up is logged as Maya\'s action on the run she was shown',
    RUN_LOG[2].actions.map(a => a.action).join(',') === 'ESCALATED,REPLIED' &&
    /Move PathPoint to Omit/.test(RUN_LOG[2].actions[1].note),
    RUN_LOG[2].actions.map(a => a.action).join(','));
  check('16p and it opens a NEW pending gate — approval does not survive the artifact moving',
    RUN_LOG.length === 4 && /Follow-up 1 · Maya replies/.test(RUN_LOG[3].caseLabel) &&
    !gateComplete() && pendingCount() === 1,
    RUN_LOG[3].caseLabel + ' · pending ' + pendingCount());
  check('16q the draft of record carries across, so Edit still edits the submission',
    getGate().draft === carried && carried.indexOf('$645,000') === -1);
  gateApprove();

  /* --- a refusal needs a human decision too ---------------------------- */
  SCENARIO = 'refuse'; resetCapture();
  await runWeeklyForecast({ disabled: false });
  check('16r a refusal opens the gate as well, with no draft behind it',
    RUN_LOG.length === 5 && /REFUSED-ESCALATE · M8\.1/.test(RUN_LOG[4].decision) &&
    getGate().draft === '' && !gateComplete(),
    RUN_LOG[4].decision);
  renderGate();
  check('16s Edit is off when there is no draft; Approve and Escalate stay live',
    els.gateEdit.disabled === true && els.gateApprove.disabled === false &&
    els.gateEscalate.disabled === false && /no text to edit/.test(els.gateHint.textContent));
  check('16t Escalate still completes the exception path',
    gateEscalate('taking it to the VP myself').ok && gateComplete() && pendingCount() === 0);

  /* --- the guards ------------------------------------------------------ */
  closeGate();
  renderGate();
  check('16u with no output the three actions ERROR rather than silently no-op',
    !gateApprove().ok && !gateSaveEdit('x').ok && !gateEscalate('y').ok &&
    RUN_LOG.length === 5 && els.gateApprove.disabled === true);
  renderRunLog();
  /* The kit's .log component, one .row per run — not a table: 320px of rail
     cannot hold five columns without clipping the decision. */
  const logBox = els.humanRunLog.children[0];
  check('16v the log renders one row per run, and counts what is left',
    logBox && logBox.className === 'log' && logBox.children.length === RUN_LOG.length &&
    /5 runs this session · every run carries a human decision/.test(els.runLogSummary.textContent),
    els.runLogSummary.textContent);
  /* The point is that the LOG is not persisted, not that there is exactly one
     setItem — counting calls broke the moment prompt 13 added a skin
     preference. Enumerate what IS stored instead, so a new key cannot slip in
     unnoticed and the log can never become one of them. */
  const storedKeys = (js.match(/localStorage\.setItem\(\s*([A-Za-z_]+|'[^']+')/g) || [])
    .map(m => m.replace(/.*setItem\(\s*/, ''));
  /* Prompt 17 added the SECOND stored thing, deliberately: the eval results are
     evidence, they are the human's rather than the agent's, and rebuilding the
     table costs real API calls. The run log stays memory-only — a decision
     record that outlives the page needs a retention answer nobody has given.
     Two keys, named; a third cannot appear without failing here. */
  /* P3 amended this policy: the write TOKEN persists (a credential, like the
     API key — never a decision record). Decisions still never touch
     localStorage; in pilot (api) mode they land in the DATABASE, and the
     retention notice on screen is the compensating honesty (P3.6). */
  check('16w localStorage holds credentials + eval results only — decisions never (DB is the pilot store)',
    storedKeys.sort().join(',') === "'sibyl_write_token',EVAL_STORE_KEY,KEY_STORAGE" &&
    !/setItem\([^)]*RUN_LOG/.test(js) && !/setItem\([^)]*DEAL_GATE/.test(js) &&
    !/setItem\([^)]*GATE\b/.test(js) &&
    /in memory only/.test(els.runLogSummary.textContent),
    storedKeys.join(', '));
  check('16x the case label is derived from the snapshot, not typed',
    currentCaseLabel() === 'Weekly forecast · week 13 · 2026-07-24' &&
    js.indexOf('CASE_OVERRIDE') !== -1,
    currentCaseLabel());

  /* 17 — prompt 08: citations, forced. The playbook's CHECK is "spot-check one
     citation: open the policy constant and confirm the cited line exists."
     That spot-check is automated here and at run time — fabricated citations
     are the failure that reads as rigour, so nothing should rest on catching
     them by eye. */
  const V = citeVocab();
  check('17a the citable vocabulary is derived from the files, not hard-coded',
    V.rules['M2.5a'] && V.rules['M10.6'] && V.rules['S0.2'] && V.rules['SKILL 03'] &&
    V.rules['M1.1'] === 'forecast_methodology.md' && V.rules['S0.2'] === 'SKILL.md' &&
    Object.keys(V.deals).length === 113 && V.files['topdown_metrics.csv'],
    Object.keys(V.rules).length + ' rules, ' + Object.keys(V.deals).length + ' deals, ' +
    Object.keys(V.files).length + ' files');
  /* The invented M3/M4 blocks were deleted in August; nine of ten decisions-log
     rows had been citing them (section 12). Nothing may resolve to them again. */
  check('17b the deleted invented rules are not citable',
    !V.rules['M3'] && !V.rules['M3.2'] && !V.rules['M4'] && !V.rules['M4.1'] && !V.rules['M4.2'],
    Object.keys(V.rules).filter(r => /^M[34]/.test(r)).join(', ') || 'none — correct');

  const mixed = 'Challenged up to Commit [M1.1] on [DL-0037]; the thin record goes to the ' +
    'chase list [M5.3]. Also per [M12.9] and [DL-9999]. The brief cites [44 emails, most ' +
    'recent Jul 24]. Table: [topdown_metrics.csv]. Held out: [eval_cases.csv].';
  const ac = auditCitations(mixed);
  check('17c real rules, records and tables resolve',
    ac.resolved.filter(t => !t.heldOut).map(t => t.token).join(',') ===
      'M1.1,DL-0037,M5.3,topdown_metrics.csv',
    ac.resolved.map(t => t.token).join(','));
  check('17d an invented rule and an invented deal are both caught',
    ac.unresolved.map(t => t.token).indexOf('M12.9') !== -1 &&
    ac.unresolved.map(t => t.token).indexOf('DL-9999') !== -1,
    ac.unresolved.map(t => t.token).join(','));
  check('17e bracketed prose from the briefs is NOT read as a broken citation',
    !ac.tags.some(t => /44 emails/.test(t.token)) && ac.tags.length === 7,
    ac.tags.length + ' citations found in a string with 8 bracketed spans');
  /* eval_cases.csv is a REAL file name — both prompts name it in the rule that
     forbids it — so it resolves, and is marked held out. Citing it as a source
     is a louder failure than citing something that does not exist: it means the
     answer key reached the context. Caught by check 17t, which found the two
     prompts' own mentions being reported as fabrications. */
  check('17f the held-out answer key resolves, but is marked held out — not "not found"',
    ac.tags.some(t => t.token === 'eval_cases.csv' && t.ok && t.heldOut) &&
    !ac.unresolved.some(t => t.token === 'eval_cases.csv'));
  check('17g a correct citation written WITHOUT brackets still counts',
    auditCitations('M5.3 sends DL-0150 to the chase list.').resolved.length === 2 &&
    auditCitations('M5.3 sends DL-0150 to the chase list.').unresolved.length === 0);
  check('17h an invented ID written without brackets is caught too',
    auditCitations('Under M99.9 this is a challenge.').unresolved.length === 1);
  check('17i a dollar figure is not mistaken for a rule',
    auditCitations('The draft lands at $1.5M against a $682,158 walk-up.').tags.length === 0,
    JSON.stringify(auditCitations('lands at $1.5M').tags));

  const citedScan = { values: {
    deals_challenge_list: 'DL-0037 Best Case -> Commit [M1.1] [DL-0037]',
    chase_list: 'DL-0150 has no brief and no recorded conversation — chase the rep [M5.3].',
    disagreement_register: 'none',
    forecast_notes: 'Holding the call at the walk-up [M7.1], swing deal named [M6.1].',
    sibyl_reading: 'I endorse the walk-up as constructed [M10.5]; my own figure is labelled [M10.6].'
  } };
  const cc = citationCheck(citedScan);
  check('17j a properly cited draft reports no fabrications and no uncited fields',
    cc.fabricated.length === 0 && cc.uncited.length === 0 && cc.heldOut.length === 0 &&
    cc.total === 8,
    cc.total + ' citations');
  check('17k "none" is a complete answer and is not flagged as uncited',
    cc.uncited.indexOf('disagreement_register') === -1);
  const badScan = { values: {
    deals_challenge_list: 'DL-0037 challenged up under [M4.1] and [M3.2].',
    chase_list: 'the thin deal needs a nudge from its rep before anyone can judge it at all.',
    forecast_notes: 'Holding the call [M7.1] and again under [M4.1].'
  } };
  const bc = citationCheck(badScan);
  check('17l fabricated citations are collected and de-duplicated across fields',
    bc.fabricated.join(',') === 'M4.1,M3.2' && bc.fabricated.length === 2,
    bc.fabricated.join(','));
  check('17m a judgment field with no source at all is named',
    bc.uncited.join(',') === 'chase_list', bc.uncited.join(','));

  /* 17n-17p — the status band. A fabricated citation must cost the run its OK. */
  const citedReply = goodReply.replace('deals_challenge_list: DL-0037…',
    'deals_challenge_list: DL-0037 up to Commit [M1.1]')
    .replace('chase_list: DL-0150', 'chase_list: DL-0150 no brief [M5.3]')
    .replace('forecast_notes: …', 'forecast_notes: holding [M7.1]')
    .replace('disagreement_register: 2 open', 'disagreement_register: 2 open [M10.2]')
    .replace('sibyl_reading: my read is…', 'sibyl_reading: endorse [M10.5]');
  const cleanBand = runStatusBand(parseSibylFields(citedReply), { refused: false },
    { stop_reason: 'end_turn', decisions: {}, text: citedReply });
  check('17n a cited, clean draft still reports OK and counts its citations',
    cleanBand.code === 'OK' && /citation\(s\) all resolving/.test(cleanBand.detail),
    cleanBand.detail.slice(0, 70));
  const fabReply = citedReply.replace('[M1.1]', '[M4.1]');
  const fabBand = runStatusBand(parseSibylFields(fabReply), { refused: false },
    { stop_reason: 'end_turn', decisions: {}, text: fabReply });
  check('17o a single fabricated citation costs the run its clean OK, and is named',
    /CHECK/.test(fabBand.code) && /does not exist: M4\.1/.test(fabBand.detail), fabBand.code);
  const bareReply = citedReply.replace('chase_list: DL-0150 no brief [M5.3]',
    'chase_list: several deals need a nudge from their reps before anyone can judge them');
  const bareBand = runStatusBand(parseSibylFields(bareReply), { refused: false },
    { stop_reason: 'end_turn', decisions: {}, text: bareReply });
  check('17p a judgment field with no source downgrades the band too',
    /CHECK/.test(bareBand.code) && /no source at all: chase_list/.test(bareBand.detail),
    bareBand.detail.slice(0, 60));

  /* 17q-17s — the contract actually reaches both agents, and neither prompt
     cites a rule that does not exist. Section 12 found 9 of 10 decisions-log
     rows citing M3/M4 after those blocks were deleted; a prompt can rot the
     same way, and it teaches the model to invent IDs. */
  check('17q SIBYL_PROMPT carries the citation contract and the tag shapes',
    /\*\*Citations\.\*\*/.test(SIBYL_PROMPT) &&
    /\[SKILL 03\]/.test(SIBYL_PROMPT) && /\[DL-0037\]/.test(SIBYL_PROMPT) &&
    /\[topdown_metrics\.csv\]/.test(SIBYL_PROMPT) &&
    /resolved against the actual files/.test(SIBYL_PROMPT) &&
    /worse than no citation/.test(SIBYL_PROMPT));
  check('17r SIBYL_PROMPT names the three missing-data moves and forbids the fourth',
    /## MISSING DATA/.test(SIBYL_PROMPT) &&
    /\*\*Ask\.\*\*/.test(SIBYL_PROMPT) && /\*\*Report the gap in place\.\*\*/.test(SIBYL_PROMPT) &&
    /\*\*Escalate — hard stop\.\*\*/.test(SIBYL_PROMPT) && /Never close the gap yourself/.test(SIBYL_PROMPT) &&
    /industry benchmark/.test(SIBYL_PROMPT));
  check('17s the reviewer is told to cite the M1 rule by ID, in brackets',
    /Cite the matching M1 rule by ID, in square brackets/.test(REVIEWER_PROMPT) &&
    /INSUFFICIENT_EVIDENCE` carries `\[M5\.3\]`/.test(REVIEWER_PROMPT) &&
    /shown as NOT FOUND/.test(REVIEWER_PROMPT));
  const promptCites = auditCitations(SIBYL_PROMPT + '\n' + reviewerSystemPrompt());
  check('17t every rule ID the two prompts cite resolves against the real files',
    promptCites.unresolved.length === 0,
    promptCites.unresolved.map(t => t.token).join(', ') ||
      promptCites.resolved.length + ' citations, all resolving');
  /* A held-out citation inside Sibyl's OUTPUT is its own alarm, distinct from a
     fabrication, and it must cost the run its OK. */
  const leakScan = { values: { forecast_notes: 'Cross-checked against [eval_cases.csv] before drafting.' } };
  check('17t2 a draft citing the held-out key is flagged as a leak, not a typo',
    citationCheck(leakScan).heldOut.join(',') === 'eval_cases.csv' &&
    citationCheck(leakScan).fabricated.length === 0 &&
    /HELD-OUT file/.test(runStatusBand({ parsed: true, missing: [], values: leakScan.values },
      { refused: false }, { stop_reason: 'end_turn', decisions: {}, text: '' }).detail));

  /* 17u — the tags render, and an unresolvable one renders loudly. */
  const okTag = citationTags('deals_challenge_list', 'DL-0037 up to Commit [M1.1]');
  const badTag = citationTags('deals_challenge_list', 'DL-0037 up to Commit [M4.1]');
  const noTag = citationTags('chase_list', 'several deals need a nudge before anyone can judge them');
  check('17u tags render per field, and a broken one renders as NOT FOUND',
    okTag.children.length === 2 && okTag.children.every(c => c.className === 'tag') &&
    badTag.children.some(c => c.className === 'tag bad' && /M4\.1 — NOT FOUND/.test(c.textContent)) &&
    noTag.children.length === 1 && noTag.children[0].className === 'tag none',
    okTag.children.map(c => c.textContent).join(' '));

  /* 17v — the reading renders as raw text, not field rows, so its tags need
     their own strip. It is the one field where Sibyl may compute its own
     figures (M2.5b), which makes provenance matter more there, not less. */
  SCENARIO = 'gate'; resetCapture();
  els.runReadingTags.textContent = '';
  await runWeeklyForecast({ disabled: false });
  check('17v the advisory reading gets its own citation tags',
    els.runReadingTags.children.length === 1 &&
    els.runReadingTags.children[0].textContent === 'M10.5',
    els.runReadingTags.children.map(c => c.textContent).join(', ') || 'none');
  gateApprove();

  /* 18 — the 2026-08-04 live run (prompt 08 build, 107K in / 26.9K out). Two
     fields came back "never arrived" while both were plainly in the reply, and
     the reading rendered inside the submission panel. One root cause and one
     duplicate parser. The lines below are VERBATIM from that run. */
  const liveSix = "**6. per_rep_forecast** (categories/amounts from the calculator's per-deal " +
    "routing; delta vs the rep's own call is categorical)";
  const liveEleven = '**11. sibyl_reading** *(advisory, manager-only; my own arithmetic ' +
    'labelled per M10.6; never submitted, never changes the walk-up)*';
  check('18a the live per_rep_forecast heading registers (101-char trailing parenthetical)',
    sibylLabelOf(liveSix) === 'per_rep_forecast',
    JSON.stringify(sibylLabelOf(liveSix)));
  check('18b the live sibyl_reading heading registers (111-char italic parenthetical)',
    sibylLabelOf(liveEleven) === 'sibyl_reading',
    JSON.stringify(sibylLabelOf(liveEleven)));
  /* The guard was never length — it is that nothing survives the peel. */
  check('18c prose with a LONG parenthetical is still not a label',
    sibylLabelOf('drift (the gap between my call and the reps own roll-up, which is the ' +
      'number that actually matters here) was large but we moved on') === null &&
    sibylLabelOf('chase_list (see the note above, which explains the whole situation in ' +
      'rather more detail than anyone needs) is where DL-0150 goes') === null);
  check('18d the short-parenthetical prose case from run 2 still does not parse',
    parseSibylFields('drift (as discussed) was large but we moved on\n').found.length === 0);

  const liveReply = [
    '**1. failed_checks_banner**', 'Not a clean run — three transparency flags.', '',
    '**2. suggested_forecast / suggested_best_case**',
    '- **suggested_forecast: $676,158** (calculator, sum of the five components).',
    '- **suggested_best_case: $53,800** — the pool of the three Best Case reads.', '',
    '**3. delta_from_last_week**', 'Calculator reports WoW −25.8%.', '',
    '**4. team_bottoms_up_total / drift**',
    '- **team_bottoms_up_total: $662,945** (topdown_metrics.csv).',
    '- **drift:** draft $676,158 vs bottoms-up $662,945.', '',
    '**5. reconciliation_scorecard**', 'Draft won 4 of 6; Maya won 2 of 6.', '',
    liveSix, '| Rep | Commit (mine) |', '| Elena Whitaker | DL-0037 $173,520 |', '',
    '**7. deals_challenge_list**', '| DL-0037 PathPoint | Elena | Best Case | Commit |', '',
    '**8. chase_list**', '- DL-0150 Halcyon Freight — INSUFFICIENT_EVIDENCE per M5.3.', '',
    '**9. disagreement_register**', 'Maya 2 of 6 resolved (33%).', '',
    '**10. forecast_notes**', '**Headline (M7.1):** Calling $676,158 for Q2.', '',
    liveEleven, '**Verdict: Endorse the walk-up as constructed ($676,158).**',
    'Sibyl calc: Maya override win rate 2/6 = 33%.'
  ].join('\n');
  const live8 = parseSibylFields(liveReply);
  check('18e the live reply now parses 13 of 13 — nothing "never arrived"',
    live8.found.length === 13 && live8.missing.length === 0,
    live8.found.length + ' of 13, missing: ' + (live8.missing.join(', ') || 'none'));
  check('18f the two lost fields carry their real bodies, not empty strings',
    /Elena Whitaker/.test(live8.values.per_rep_forecast || '') &&
    /Endorse the walk-up as constructed/.test(live8.values.sibyl_reading || ''),
    JSON.stringify((live8.values.per_rep_forecast || '(absent)').slice(0, 30)));
  check('18g the heading did not swallow the field after it',
    !/deals_challenge_list/.test(live8.values.per_rep_forecast || '') &&
    /DL-0037 PathPoint/.test(live8.values.deals_challenge_list || ''));

  /* 18h-18j — the second bug. splitReading had its own pattern that fixed the
     ORDER of the decoration, so "**11. sibyl_reading**" (bold before the
     number) did not match and the advisory reading rendered inside the
     submission panel — M10.4's boundary, collapsed silently on screen. */
  const sp = splitReading(liveReply);
  check('18h the advisory reading splits off the submission at the live label',
    /^\*\*11\. sibyl_reading\*\*/.test(sp.reading) &&
    /Endorse the walk-up as constructed/.test(sp.reading),
    JSON.stringify(sp.reading.slice(0, 40)));
  check('18i the submission keeps fields 1-12 and NOT the reading (M10.4)',
    /failed_checks_banner/.test(sp.submission) && /forecast_notes/.test(sp.submission) &&
    sp.submission.indexOf('sibyl_reading') === -1 &&
    sp.submission.indexOf('Endorse the walk-up') === -1);
  check('18j the older label shapes still split — one reader, every order',
    /^sibyl_reading/.test(splitReading('drift: +$1\nsibyl_reading: my read').reading) &&
    /^11\. sibyl_reading/.test(splitReading('drift: +$1\n11. sibyl_reading: my read').reading) &&
    /^### sibyl_reading/.test(splitReading('drift: +$1\n### sibyl_reading\nmy read').reading) &&
    splitReading('drift: +$1\nno reading here').reading === '');

  /* 19 — the per-deal human gate on the deal review (Stage 1). Prompt 07 gated
     the submission as one artifact; this gates each of the eight readings.
     It sits AFTER the run by decision, so the decisive property is that a
     recorded call which the submission did NOT use says so on its face. */
  SCENARIO = 'gate'; resetCapture();
  dealGateReset();
  const g19logBefore = RUN_LOG.length;
  await runWeeklyForecast({ disabled: false });
  const g19s0 = dealGateSummary();
  check('19a a fresh run leaves every open deal NOT REVIEWED',
    g19s0.total === 8 && g19s0.reviewed === 0 && g19s0.notReviewed === 8 &&
    Object.keys(DEAL_GATE).length === 0,
    g19s0.total + ' deals, ' + g19s0.notReviewed + ' not reviewed');
  const g19ctx = dealGateContext('DL-0037');
  check('19b each row knows the rep call, the reviewer call, and what actually stands',
    g19ctx.repCategory === 'Best Case' && g19ctx.reviewerCategory === 'Commit' &&
    g19ctx.resolved === 'Commit' && /reviewer \(CHALLENGE_UP\)/.test(g19ctx.resolvedSrc),
    g19ctx.repCategory + ' -> ' + g19ctx.reviewerCategory + ' · stands ' + g19ctx.resolved);

  /* --- approve --------------------------------------------------------- */
  const g19ap = dealApprove('DL-0037');
  check('19c Approve records the standing category as Maya\'s call, and logs one row',
    g19ap.ok && DEAL_GATE['DL-0037'].action === 'APPROVED' &&
    DEAL_GATE['DL-0037'].category === 'Commit' &&
    RUN_LOG.length === g19logBefore + 2 &&
    /^Deal review · DL-0037/.test(RUN_LOG[g19logBefore + 1].caseLabel) &&
    /^APPROVED \d\d:\d\d:\d\d — kept Commit$/.test(actionOf(RUN_LOG[g19logBefore + 1])),
    actionOf(RUN_LOG[g19logBefore + 1]));

  /* --- edit ------------------------------------------------------------ */
  check('19d an edit to the category it already has is refused',
    !dealEdit('DL-0041', 'Omit', '').ok &&
    /already the category/.test(dealEdit('DL-0041', 'Omit', '').error));
  check('19e an unknown category is refused',
    !dealEdit('DL-0041', 'Slam Dunk', '').ok && !dealEdit('DL-0041', '', '').ok);
  const g19ed = dealEdit('DL-0041', 'Pipeline', 'Cody says the renewal conversation reopened');
  check('19f Edit records the new category with the reason, and points at the recalc loop',
    g19ed.ok && DEAL_GATE['DL-0041'].category === 'Pipeline' &&
    /Recalculate with my calls/.test(g19ed.message) &&
    /^EDITED \d\d:\d\d:\d\d — Omit → Pipeline · Cody says/.test(actionOf(RUN_LOG[g19logBefore + 2])),
    actionOf(RUN_LOG[g19logBefore + 2]));

  /* --- escalate -------------------------------------------------------- */
  check('19g an escalation with no reason is refused — the reason IS the record',
    !dealEscalate('DL-0044', 'Best Case', '   ', ['sibyl']).ok &&
    /reason/.test(dealEscalate('DL-0044', 'Best Case', '', ['sibyl']).error));
  check('19h an escalation with no destination is refused',
    !dealEscalate('DL-0044', 'Best Case', 'Gagan still unengaged', []).ok &&
    !dealEscalate('DL-0044', 'Best Case', 'x', ['nowhere']).ok);
  const g19esc = dealEscalate('DL-0044', 'Pipeline', 'Gagan has never been in the room', ['sibyl', 'rep']);
  check('19i Escalate records the destinations and the reason verbatim',
    g19esc.ok && DEAL_GATE['DL-0044'].escalateTo.join('+') === 'sibyl+rep' &&
    /Gagan has never been in the room/.test(actionOf(RUN_LOG[g19logBefore + 3])) &&
    /to sibyl \+ rep/.test(actionOf(RUN_LOG[g19logBefore + 3])),
    actionOf(RUN_LOG[g19logBefore + 3]));
  /* Escalating BECAUSE you do not know is legitimate — no category needed. */
  const g19escNoCat = dealEscalate('DL-0036', '', 'Closing today and I cannot tell — ask Elena', ['rep']);
  check('19j escalation without a category keeps the standing one, and still records',
    g19escNoCat.ok && DEAL_GATE['DL-0036'].category === dealGateContext('DL-0036').resolved,
    DEAL_GATE['DL-0036'].category);

  const g19s1 = dealGateSummary();
  check('19k the summary counts every state, and untouched deals stay NOT REVIEWED',
    g19s1.approved === 1 && g19s1.edited === 1 && g19s1.escalated === 2 &&
    g19s1.reviewed === 4 && g19s1.notReviewed === 4,
    JSON.stringify(g19s1));

  /* --- the honesty surface --------------------------------------------- */
  const g19div = dealGateDivergences();
  check('19l a recorded call the submission did NOT use is named',
    g19div.map(x => x.id).join(',') === 'DL-0041' &&
    g19div[0].applied === 'Omit' && g19div[0].maya === 'Pipeline',
    g19div.map(x => x.id + ' ' + x.applied + '->' + x.maya).join(', ') || 'none');
  /* The sharp half: DL-0044 was escalated with a category too, but it happens to
     be the one the walk-up used — so it must NOT be flagged. The notice fires on
     divergence, not on "she touched it". An approval is never flagged either. */
  check('19l2 a call that matches what shipped is not flagged, nor is an approval',
    !g19div.some(x => x.id === 'DL-0044') && !g19div.some(x => x.id === 'DL-0037') &&
    DEAL_GATE['DL-0044'].category === (getApplied()['DL-0044'] || {}).cat,
    'DL-0044 Maya ' + DEAL_GATE['DL-0044'].category + ' · shipped ' + (getApplied()['DL-0044'] || {}).cat);
  check('19m the walk-up reports the category it actually used, per deal',
    getApplied() && getApplied()['DL-0037'].cat === 'Commit' &&
    Object.keys(getApplied()).length === 8);

  /* --- the two escalation destinations ---------------------------------- */
  const g19toSibyl = escalationToSibyl('DL-0044');
  check('19n the Sibyl escalation names the deal, both prior calls, hers, and the reason',
    /DL-0044/.test(g19toSibyl) && /rep called it Commit/.test(g19toSibyl) &&
    /your reviewer landed on Best Case/.test(g19toSibyl) &&
    /moving it to Pipeline/.test(g19toSibyl) &&
    /Gagan has never been in the room/.test(g19toSibyl),
    JSON.stringify(g19toSibyl.slice(0, 60)));
  check('19o it tells Sibyl to dissent rather than concur — the anti-sycophancy rule',
    /Do not agree with it to be agreeable/.test(g19toSibyl) &&
    /disagreement_register/.test(g19toSibyl) && /This is my call and it stands/.test(g19toSibyl));
  const g19repNote = escalationRepNote('DL-0036');
  check('19p the rep note is addressed, carries the reason, and is drafted for a 1:1',
    /^To Elena Whitaker — 1:1 note on DL-0036/.test(g19repNote) &&
    /cannot tell — ask Elena/.test(g19repNote) && /You have this at/.test(g19repNote),
    JSON.stringify(g19repNote.slice(0, 46)));
  check('19q only deals escalated TO the rep produce a note',
    repNotesPending().map(n => n.id).sort().join(',') === 'DL-0036,DL-0044',
    repNotesPending().map(n => n.id).join(','));
  check('19r SIBYL_PROMPT carries the MAYA\'S DEAL CALLS contract',
    /## MAYA'S DEAL CALLS/.test(SIBYL_PROMPT) &&
    /Her category is the decision, not a proposal/.test(SIBYL_PROMPT) &&
    /Do not agree with it to be agreeable/.test(SIBYL_PROMPT) &&
    /disagreement_register/.test(SIBYL_PROMPT));

  /* --- a new run clears the decisions, but not the log ------------------ */
  const g19logAfter = RUN_LOG.length;
  resetCapture();
  await runWeeklyForecast({ disabled: false });
  check('19s a new run resets the per-deal decisions — they were about old readings',
    dealGateSummary().notReviewed === 8 && Object.keys(DEAL_GATE).length === 0 &&
    RUN_LOG.length > g19logAfter,
    dealGateSummary().notReviewed + ' not reviewed, log kept ' + RUN_LOG.length + ' rows');
  gateApprove();

  /* 20 — prompt 09: Run All over the whole queue.
     "Every case in my data" is the EIGHT OPEN DEALS — Sibyl's weekly run
     produces one submission, so the submission is not a queue; the deal
     readings are. The playbook's CHECK is that the counts make sense against
     the data and that the boundary cases are the escalations, so that is what
     these check: DL-0150 Halcyon Freight is the seeded unjudgeable deal (EC-3)
     and must be the one and only REFUSED-ESCALATE on a clean sweep. */
  SCENARIO = 'gate'; resetCapture();
  dealGateReset();
  const g20logBefore = RUN_LOG.length;
  const g20progress = [];
  const g20sweep = await runAllDeals(p => g20progress.push(p.done + '/' + p.total));

  check('20a the sweep runs every open deal — the whole queue, one pass',
    g20sweep.results.length === 8 && Object.keys(g20sweep.readings).length === 8 &&
    captured.filter(b => !b.tools).length === 8,
    g20sweep.results.length + ' cases · ' + captured.filter(b => !b.tools).length + ' reviewer calls');
  check('20b progress is reported as it goes, not once at the end',
    g20progress.length > 8 && g20progress[0] === '0/8' &&
    g20progress[g20progress.length - 1] === '8/8',
    g20progress.length + ' updates, first ' + g20progress[0] + ', last ' + g20progress[g20progress.length - 1]);
  check('20c the counts add up and match the seeding — one boundary case',
    g20sweep.counts.total === 8 && g20sweep.counts.ok === 7 &&
    g20sweep.counts.escalated === 1 && g20sweep.counts.errors === 0 &&
    g20sweep.counts.ok + g20sweep.counts.escalated + g20sweep.counts.errors === 8,
    sweepSummaryText(g20sweep.counts));
  check('20d the escalation IS the boundary case — DL-0150, the unjudgeable deal',
    g20sweep.results.filter(r => r.outcome.code === 'REFUSED-ESCALATE')
      .map(r => r.id).join(',') === 'DL-0150' &&
    /INSUFFICIENT_EVIDENCE/.test(g20sweep.results.filter(r => r.id === 'DL-0150')[0].outcome.detail) &&
    /M5\.3/.test(g20sweep.results.filter(r => r.id === 'DL-0150')[0].outcome.detail),
    g20sweep.results.filter(r => r.id === 'DL-0150')[0].outcome.detail);

  /* 20e-20h — the three buckets, each from the reading itself. */
  check('20e a parsed verdict is OK, and carries the category it landed on',
    caseOutcome({ parsed: true, verdict: 'CHALLENGE_UP', reviewer_category: 'Commit' }).code === 'OK' &&
    /CHALLENGE_UP · Commit/.test(caseOutcome({ parsed: true, verdict: 'CHALLENGE_UP', reviewer_category: 'Commit' }).detail));
  check('20f INSUFFICIENT_EVIDENCE is the reviewer\'s escalation, not an error',
    caseOutcome({ parsed: true, verdict: 'INSUFFICIENT_EVIDENCE' }).code === 'REFUSED-ESCALATE');
  check('20g a failed call, an unparseable reply and a NO verdict are all errors',
    caseOutcome({ error: 'HTTP 401' }).code === 'ERROR' &&
    caseOutcome({ parsed: false }).code === 'ERROR' &&
    caseOutcome({ parsed: true, verdict: '' }).code === 'ERROR' &&
    caseOutcome(null).code === 'ERROR');
  /* Truncation is the one that would otherwise pass as a clean verdict:
     parseReading needs only five labels, so a cut-off reply still parses. */
  check('20h a truncated reply is an ERROR, not a verdict',
    caseOutcome({ parsed: true, verdict: 'AGREE', truncated: true }).code === 'ERROR' &&
    /max_tokens/.test(caseOutcome({ parsed: true, verdict: 'AGREE', truncated: true }).detail));
  check('20i the summary line names all three buckets',
    /^8 cases · 7 OK · 1 REFUSED-ESCALATE · 0 errors$/.test(sweepSummaryText(g20sweep.counts)),
    sweepSummaryText(g20sweep.counts));
  check('20j a citation that resolves to nothing is reported without being called an error',
    sweepCounts([{ outcome: { code: 'OK' }, badCitations: ['M4.1'] }]).badCitations === 1 &&
    sweepCounts([{ outcome: { code: 'OK' }, badCitations: ['M4.1'] }]).errors === 0 &&
    /citation that resolves to nothing/.test(sweepSummaryText(sweepCounts([{ outcome: { code: 'OK' }, badCitations: ['M4.1'] }]))));

  /* 20k-20m — the sweep fills the results list and the run log. */
  LAST_READINGS = g20sweep.readings; LAST_APPLIED = null;
  logDealReadings(g20sweep.results);
  check('20k the sweep opens one PENDING run-log row per case',
    RUN_LOG.length === g20logBefore + 8 &&
    runLogRows().slice(-8).every(r => r.pending) &&
    /^Deal review · DL-/.test(RUN_LOG[g20logBefore].caseLabel),
    (RUN_LOG.length - g20logBefore) + ' rows, all pending');
  check('20l the row carries the case outcome as the agent decision',
    /^REFUSED-ESCALATE · INSUFFICIENT_EVIDENCE/.test(
      RUN_LOG.filter(e => /DL-0150/.test(e.caseLabel)).slice(-1)[0].decision),
    RUN_LOG.filter(e => /DL-0150/.test(e.caseLabel)).slice(-1)[0].decision.slice(0, 50));
  /* The gate must adopt the sweep's row rather than open a second one for the
     same agent output. */
  const g20rows = RUN_LOG.length;
  dealApprove('DL-0037');
  check('20m deciding on a swept case reuses its row — one output, one row',
    RUN_LOG.length === g20rows &&
    /APPROVED/.test(actionOf(RUN_LOG.filter(e => /DL-0037/.test(e.caseLabel)).slice(-1)[0])),
    RUN_LOG.length === g20rows ? 'reused' : 'DUPLICATED');
  check('20n every case lands in the results list, NOT REVIEWED until decided',
    dealGateSummary().total === 8 && dealGateSummary().notReviewed === 7 &&
    dealGateSummary().approved === 1,
    JSON.stringify(dealGateSummary()));
  /* A sweep drafts nothing, so there is no walk-up to diverge from and the
     "NOT IN THIS RUN" notice must stay silent. */
  check('20o a sweep produces no submission, so nothing can diverge from one',
    getApplied() === null && dealGateDivergences().length === 0);

  /* The weekly run must DELEGATE to the sweep, not carry a second copy of the
     fan-out. Two readers of one format is the section 28 bug; two writers of one
     reading would be worse — the reading is what every eval scores. */
  check('20p the weekly run and Run All share ONE sweep implementation',
    /const sweep = await runAllDeals\(/.test(js) &&
    (js.match(/await mapLimit\(open, SWEEP_CONCURRENCY/g) || []).length === 1 &&
    (js.match(/callAgent\(MODEL_REVIEWER, reviewerSystemPrompt\(\)/g) || []).length === 2,
    'one fan-out loop, 2 reviewer call sites (the sweep + the single-deal button)');
  check('20q progress text names the model, the count and the concurrency',
    /^DEAL SWEEP — claude-sonnet-5 · 8 of 8 done \(3 at a time\)/.test(
      sweepProgressText({ open: OPEN_DEALS, status: {}, done: 8, total: 8 })) &&
    SWEEP_CONCURRENCY === 3,
    sweepProgressText({ open: OPEN_DEALS, status: {}, done: 8, total: 8 }).split('\n')[0]);

  /* 21 — prompt 10: the console. The design is LOCKED and ships in the box, so
     the checks that matter are the ones a human eye cannot do reliably: that
     the tokens arrived verbatim, and that nothing invented a colour or a font
     behind them. */
  const styleBlock = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const tokensSrc = fs.readFileSync(path.join(ROOT, 'design', 'TOKENS.css'), 'utf8');
  check('21a design/TOKENS.css is inlined verbatim, not paraphrased',
    styleBlock.indexOf(tokensSrc) !== -1 && styleBlock.indexOf('__TOKENS_CSS__') === -1,
    tokensSrc.length + ' chars of tokens found inside the style block');

  /* Everything after the token block is the console's own CSS. It may use
     var() and color-mix of tokens — nothing else. */
  const ownCss = styleBlock.slice(styleBlock.indexOf(tokensSrc) + tokensSrc.length);
  const hexes = ownCss.replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  check('21b NO NEW COLOURS — the console CSS declares not one hex value',
    hexes.length === 0, hexes.join(', ') || 'zero hex literals outside TOKENS.css');
  const rawFonts = (ownCss.replace(/\/\*[\s\S]*?\*\//g, '').match(/font-family:[^;]+;/g) || [])
    .filter(d => d.indexOf('var(--font-') === -1);
  check('21c NO NEW FONTS — every font-family resolves to a token',
    rawFonts.length === 0, rawFonts.join(' | ') || 'all font-family declarations use var(--font-*)');
  const rawSizes = (ownCss.replace(/\/\*[\s\S]*?\*\//g, '').match(/font-size:[^;]+;/g) || [])
    .filter(d => d.indexOf('var(--fs-') === -1);
  check('21d type sizes come from the scale — nothing below the 13px floor',
    rawSizes.length === 0, rawSizes.join(' | ') || 'all font-size declarations use var(--fs-*)');
  /* "No emoji as icons" is a kit rule about the INTERFACE, and the easiest one
     to break by accident. Scoped to the chrome — markup, CSS and the agent code
     that builds the DOM — deliberately NOT the embedded records: the synthetic
     briefs in data/deal_signals.md head their sections with a red/green circle
     ("### 🟢 Progress Indicators"), which is content the reviewer reads, not an
     icon this console chose. Scrubbing it would edit an agent input the evals
     have just gone green on, to satisfy a rule about interface chrome. */
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;
  const chrome = html.replace(/<script>[\s\S]*<\/script>/, '') +
                 fs.readFileSync(path.join(ROOT, 'tools', 'agent_block.js'), 'utf8');
  const emoji = chrome.match(EMOJI) || [];
  check('21e NO EMOJI in the interface — markup, CSS, or the code that builds the DOM',
    emoji.length === 0, emoji.slice(0, 8).join(' ') || 'none in the chrome');
  check('21e2 the only emoji in the file are inside the synthetic briefs, as content',
    (DATA_FILES['deal_signals.md'].match(EMOJI) || []).length > 0 &&
    (html.match(EMOJI) || []).length === (DATA_FILES['deal_signals.md'].match(EMOJI) || []).length,
    (html.match(EMOJI) || []).length + ' in the file, all from deal_signals.md section headings');

  check('21f the console is the kit\'s three regions, in the kit\'s classes',
    /<div class="topbar">/.test(html) && /<span class="product">Sibyl<\/span>/.test(html) &&
    /<div class="console">/.test(html) &&
    (html.match(/<div class="panel">/g) || []).length === 3 &&
    /<div class="panel-head">Cases<\/div>/.test(html) &&
    /<div class="panel-head">Run log<\/div>/.test(html),
    (html.match(/<div class="panel">/g) || []).length + ' panels: cases · work area · run log');

  /* The regression that would actually hurt: a Section A element losing its id
     and its renderer writing into nothing. Every id the agent code touches. */
  const IDS = ['runWeekly', 'runAll', 'showSibylCtx', 'runLog', 'runStatus', 'runFields',
    'runRawWrap', 'runResult', 'runReading', 'runReadingTags', 'gate', 'gateStatus',
    'gateApprove', 'gateEdit', 'gateEscalate', 'gateEditWrap', 'gateEditText', 'gateEditSave',
    'gateEditCancel', 'gateEscalateWrap', 'gateEscalateReason', 'gateEscalateSave',
    'gateEscalateCancel', 'gateNote', 'gateFinal', 'gateHint', 'followUpText', 'sendFollowUp',
    'followUpResult', 'humanRunLog', 'runLogSummary', 'dealGate', 'dealGateSummary',
    'dealGateNotice', 'dealRepNotes', 'sweepProgress', 'sweepSummary', 'apikey', 'saveKey',
    'clearKey', 'keyState', 'sibylPromptView', 'reviewerPromptView', 'app',
    'caseList', 'mainHead', 'viewSubmission', 'viewDeal', 'topStatus', 'topMeta',
    'dataSourceBadge', 'dataSourceBanner', 'recalcMaya', 'mayaRecalcOut',
    'mayaRecalcHint', 'retentionNote', 'writeToken', 'saveWriteToken', 'clearWriteToken',
    'writeTokenState',
    'consoleRoot', 'viewPilot', 'topTabs', 'tabConsole', 'tabPilot', 'pilotRun',
    'worldcheckRoot', 'pilotEmpty', 'pilotHero', 'pilotMain', 'pilotPanel', 'pilotSections'];
  const missingIds = IDS.filter(id => html.indexOf('id="' + id + '"') === -1);
  check('21g every element the agent code writes into survived the rebuild',
    missingIds.length === 0, missingIds.join(', ') || IDS.length + ' ids present');

  /* 21g2/21g3 — the data-source seam (P1). The store builder must reproduce
     the embedded tables exactly, and the harness environment (no location)
     must always resolve to the embedded mode — its fetch stub depends on it. */
  check('21g2 buildDataStore(EMBEDDED_SOURCES) reproduces the embedded tables through the seam',
    (() => {
      const s = buildDataStore(EMBEDDED_SOURCES);
      return JSON.stringify(Object.keys(s.DB).sort()) === JSON.stringify(Object.keys(DB).sort()) &&
             Object.keys(s.SIGNALS).length > 0 &&
             s.SIBYL_PROMPT === SIBYL_PROMPT && s.REVIEWER_PROMPT === REVIEWER_PROMPT;
    })(), Object.keys(DB).length + ' tables via the seam');
  check('21g3 the harness environment always resolves to the embedded data mode',
    resolveDataMode() === 'embedded');

  /* 21h-21k — the case list and selection. */
  SCENARIO = 'gate'; resetCapture();
  dealGateReset();
  /* P4 baseline first: the stub DOM creates elements lazily, so the pilot /
     console visibility stubs exist only after one selectTab pass. */
  selectTab('console');
  selectCase('submission');
  renderCaseList();
  check('21h with no run, the list still offers the submission card',
    els.caseList.children.length >= 1 &&
    els.caseList.children[0].attrs['data-case'] === 'submission',
    els.caseList.children.length + ' cards');
  await runAllDeals(() => {});
  LAST_READINGS = (await runAllDeals(() => {})).readings;
  renderCaseList();
  /* Ten since prompt 16: the submission, the evals table, and the eight deals. */
  check('21i after a sweep the list is the submission, the evals card and all eight deals',
    els.caseList.children.length === 10 &&
    els.caseList.children[0].attrs['data-case'] === 'submission' &&
    els.caseList.children[1].attrs['data-case'] === 'evals' &&
    els.caseList.children.slice(2).every(c => /^DL-\d{4}$/.test(c.attrs['data-case'])),
    els.caseList.children.length + ' cards');
  selectCase('DL-0037');
  check('21j selecting a deal swaps the work area to that case, and only that case',
    getSelected() === 'DL-0037' &&
    els.viewSubmission.style.display === 'none' && els.viewDeal.style.display === '' &&
    els.viewPilot.style.display !== '' &&
    /^DL-0037 · PathPoint 5\.0/.test(els.mainHead.textContent) &&
    els.dealGate.children.length === 1 &&
    els.dealGate.children[0].attrs['data-deal'] === 'DL-0037',
    els.mainHead.textContent + ' · ' + els.dealGate.children.length + ' row rendered');
  selectCase('submission');
  check('21k selecting the submission swaps back',
    els.viewSubmission.style.display === '' && els.viewDeal.style.display === 'none' &&
    els.viewPilot.style.display !== '' &&
    /^Weekly forecast — week 13/.test(els.mainHead.textContent),
    els.mainHead.textContent);

  /* 21p/21q/21r — the Pilot surface (P4). A topbar TAB, deliberately not an
     eleventh case card (21i's exactly-ten stands): the pilot is a second
     surface over the same run state, not another case. The tab swaps the
     whole console away and back; SELECTED_CASE is untouched either way. */
  selectTab('pilot');
  check('21p the Pilot tab swaps the whole console for the pilot surface',
    getActiveTab() === 'pilot' &&
    els.viewPilot.style.display === '' && els.consoleRoot.style.display === 'none' &&
    els.worldcheckRoot.style.display === 'none' &&
    els.retentionNote.style.display === 'none' &&
    els.tabPilot.className === 'tab active' && els.tabConsole.className === 'tab' &&
    getSelected() === 'submission',
    'pilot shown, console + settings + retention note hidden, selection untouched');
  selectTab('console');
  check('21q and the Console tab swaps back, selection untouched',
    getActiveTab() === 'console' &&
    els.viewPilot.style.display === 'none' && els.consoleRoot.style.display === '' &&
    els.worldcheckRoot.style.display === '' &&
    els.retentionNote.style.display === '' &&
    els.tabConsole.className === 'tab active' && els.tabPilot.className === 'tab' &&
    getSelected() === 'submission',
    'console + settings + retention note shown, pilot hidden');
  check('21r the pilot surface ships hidden, outside the console, tabs in the topbar',
    /<div id="consoleRoot">\s*<div class="console">/.test(html) &&
    /<div id="viewPilot" style="display:none">/.test(html) &&
    html.indexOf('<nav class="tabs" id="topTabs">') !== -1 &&
    html.indexOf('id="topTabs"') < html.indexOf('id="topStatus"') &&
    html.indexOf('id="viewPilot"') > html.indexOf('id="consoleRoot"') &&
    (html.match(/<button type="button" class="tab[ "]/g) || []).length === 2 &&
    /<div id="viewPilot"[\s\S]*?<p class="boundary-note">Nothing is sent without human approval\.<\/p>/.test(html),
    'consoleRoot wraps the console; viewPilot is its hidden sibling with the boundary note');

  /* Status colour means one thing everywhere (SKINS.md rule 3). */
  check('21l case badges use the kit\'s shared status colours, one meaning each',
    caseBadge(null).cls === 'warn' && caseBadge({ action: 'APPROVED' }).cls === 'ok' &&
    caseBadge({ action: 'EDITED' }).cls === 'info' &&
    caseBadge({ action: 'ESCALATED' }).cls === 'danger');
  setTopStatus('Stage 1 — reviewing 3 of 8', 'running');
  check('21m the topbar shows a running state using the kit\'s spinner class',
    els.topStatus.className === 'thinking' && /reviewing 3 of 8/.test(els.topStatus.textContent));
  setTopStatus('OK', 'ok');
  check('21n and settles to a status badge when the run ends',
    els.topStatus.className === 'badge ok', els.topStatus.className);
  check('21o the boundary sentence is on screen, quiet and permanent',
    /<p class="boundary-note">Nothing is sent without human approval\.<\/p>/.test(html));

  /* 22 — prompt 11: the loop, legible to a stranger. Five stage labels in flow
     order, on BOTH loops — one deal, and the week that adds them up. The
     playbook's test is the two-minute test: can a viewer name the input, the
     decision, and where the human is in control, without narration. */
  const STAGES = ['Input', 'Context', 'Decision', 'Output', 'Review'];
  const subStages = [...html.matchAll(/<div class="stage" data-n="(\d)">([^<]+)<\/div>/g)]
    .map(m => m[1] + ' ' + m[2]);
  check('22a the submission view carries all five stages, in flow order',
    subStages.length === 5 &&
    subStages.every((s, i) => s.indexOf(String(i + 1) + ' ' + STAGES[i]) === 0),
    subStages.join(' | '));
  check('22b each stage names the thing it actually is, not just a number',
    /1 Input · the run/.test(subStages[0]) && /2 Context · what Sibyl reads/.test(subStages[1]) &&
    /3 Decision · the calls, and the walk-up they produce/.test(subStages[2]) &&
    /4 Output · the labelled fields/.test(subStages[3]) &&
    /5 Review · approve, edit, escalate/.test(subStages[4]));
  check('22c the stage label is the kit\'s component, numbered by data-n',
    /\.stage::before \{[\s\S]*?content: attr\(data-n\)/.test(styleBlock) &&
    (html.match(/class="stage" data-n=/g) || []).length === 5,
    'data-n drives the numbered circle from TOKENS.css');

  /* The deal case is the other loop, and it is built in JS rather than markup. */
  SCENARIO = 'gate'; resetCapture();
  dealGateReset();
  LAST_READINGS = (await runAllDeals(() => {})).readings;
  selectCase('DL-0037');
  renderDealGate();
  const dealRow = els.dealGate.children[0];
  const dealStages = dealRow.children.filter(c => c.className === 'stage')
    .map(c => c.attrs['data-n'] + ' ' + c.textContent);
  check('22d one deal case carries the same five stages, in the same order',
    dealStages.length === 5 &&
    dealStages.every((s, i) => s.indexOf(String(i + 1) + ' ' + STAGES[i]) === 0),
    dealStages.join(' | '));

  /* Stage 2 has to show the records and policy THIS agent read — not a
     description of them. It is the reviewer payload, verbatim. */
  const ctxSummary = dealRow.children.filter(c => c.children.length &&
    c.children.some(k => /The exact payload sent for this deal/.test(k.textContent || '')));
  check('22e stage 2 exposes the exact payload the reviewer was sent',
    ctxSummary.length === 1 &&
    /The exact payload sent for this deal — [\d,]+ characters/.test(
      ctxSummary[0].children.filter(k => /payload/.test(k.textContent || ''))[0].textContent),
    ctxSummary.length ? ctxSummary[0].children[0].textContent : 'missing');
  check('22f stage 2 names its four sources by file',
    dealRow.children.some(c => /deals_current\.csv/.test(c.textContent || '') &&
      /deals_last_week\.csv/.test(c.textContent || '') &&
      /deal_signals\.md/.test(c.textContent || '') &&
      /forecast_methodology\.md/.test(c.textContent || '')));
  check('22g stage 4 renders all nine labelled fields of the reviewer contract',
    dealRow.children.filter(c => (c.className || '').indexOf('fieldrow') === 0).length ===
      READING_FIELDS.length,
    dealRow.children.filter(c => (c.className || '').indexOf('fieldrow') === 0).length +
      ' of ' + READING_FIELDS.length);
  check('22h stage 3 badges the verdict with the kit\'s status colours',
    dealRow.children.some(c => c.children.some(k =>
      /^badge /.test(k.className || '') && k.textContent === 'CHALLENGE_UP')));
  check('22i stage 5 still carries the working gate and the boundary sentence',
    dealRow.children.some(c => (c.className || '') === 'dealcontrols') &&
    dealRow.children.some(c => (c.className || '') === 'boundary-note' &&
      c.textContent === 'Nothing is sent without human approval.'));

  /* 23 — prompt 12: the gate gets teeth. Most of what this prompt asks for
     landed earlier (status badges in 32, the boundary sentence in 33), so what
     is checked here is what actually changed: the kit's button variants, the
     outcome state on the card, and the escalation flag. */
  check('23a the review buttons use the kit\'s variants — approve primary, escalate danger',
    /id="gateApprove" class="btn primary"/.test(html) &&
    /id="gateEdit" class="btn"/.test(html) &&
    /id="gateEscalate" class="btn danger"/.test(html) &&
    /class="btn danger" data-act="escalate"/.test(js) &&
    /class="btn primary" data-act="approve"/.test(js));
  /* The variants must come from TOKENS.css, not from a local re-implementation
     — that is the whole point of a locked kit. */
  check('23b those variants are the kit\'s, not redefined locally',
    /\.btn\.primary\s*\{/.test(tokensSrc) && /\.btn\.danger\s*\{/.test(tokensSrc) &&
    ownCss.indexOf('.btn.danger') === -1 && ownCss.indexOf('.btn.primary') === -1,
    'btn variants defined once, in TOKENS.css');

  SCENARIO = 'gate'; resetCapture();
  dealGateReset();
  await runWeeklyForecast({ disabled: false });
  selectCase('submission');
  renderCaseList();
  const subCard = () => els.caseList.children[0];
  check('23c before a decision the submission card says it is waiting on a human',
    subCard().children.some(k => k.className === 'badge warn' && k.textContent === 'Awaiting you'),
    subCard().children.map(k => k.textContent).join(' · '));
  gateApprove();
  renderCaseList();
  check('23d after a click the card shows the OUTCOME, not just "decided"',
    subCard().children.some(k => k.className === 'badge ok' && k.textContent === 'Approved'),
    subCard().children.map(k => k.textContent).join(' · '));

  /* The escalation flag — the exception path has to be findable in a list of
     eight without opening anything. */
  const dealCard = id => els.caseList.children.filter(c => c.attrs['data-case'] === id)[0];
  dealEscalate('DL-0044', 'Omit', 'CFO has never been in the room', ['sibyl', 'rep']);
  renderCaseList();
  check('23e an escalated case is flagged on the card, and says where it went',
    /escalated/.test(dealCard('DL-0044').className) &&
    dealCard('DL-0044').children.some(k => k.className === 'badge danger' && k.textContent === 'Escalated') &&
    dealCard('DL-0044').children.some(k => k.className === 'flag' &&
      k.textContent === 'Escalated → sibyl + rep'),
    dealCard('DL-0044').className + ' · ' +
      dealCard('DL-0044').children.map(k => k.textContent).join(' · '));
  dealApprove('DL-0037');
  dealEdit('DL-0041', 'Pipeline', '');
  renderCaseList();
  check('23f the other outcomes badge but do NOT carry the flag',
    !/escalated/.test(dealCard('DL-0037').className) &&
    !/escalated/.test(dealCard('DL-0041').className) &&
    !dealCard('DL-0037').children.some(k => k.className === 'flag') &&
    dealCard('DL-0037').children.some(k => k.textContent === 'Approved') &&
    dealCard('DL-0041').children.some(k => k.textContent === 'Edited'),
    'DL-0037 ' + dealCard('DL-0037').className + ' · DL-0041 ' + dealCard('DL-0041').className);
  /* Escalating the SUBMISSION flags its card the same way. */
  closeGate();
  openGate(logRun('Weekly forecast · test', 'OK'), 'draft text', 'draft');
  gateEscalate('want the CRO read before this goes up');
  renderCaseList();
  check('23g escalating the run flags the submission card too',
    /escalated/.test(subCard().className) &&
    subCard().children.some(k => k.className === 'badge danger' && k.textContent === 'Escalated'),
    subCard().className);

  /* 23d checked the RENDERER. This checks the WIRING: a decision on the
     submission gate has to redraw the case list, or the card keeps saying
     "Awaiting you" after a click. Found on screen during prompt 14. */
  check('23d2 the submission gate\'s handler redraws the case list, not just the gate',
    /function gateApplied\(r\) \{[\s\S]*?renderCaseList\(\);[\s\S]*?\n\}/.test(js),
    'gateApplied calls renderCaseList');
  check('23h the boundary sentence sits in the review panel of both loops',
    (html.match(/Nothing is sent without human approval\./g) || []).length >= 2 &&
    /boundary-note/.test(js),
    (html.match(/Nothing is sent without human approval\./g) || []).length + ' places in the markup, plus one per deal case');

  /* 24 — prompt 14: the five eval cases as one-click chips.
     The harness reads eval_cases.csv directly (it is a dev tool and is never
     shipped) so it can assert two things at once: the chips CORRESPOND to the
     real cases, and none of the answer key came with them. */
  const evalCsv = fs.readFileSync(path.join(ROOT, 'data', 'eval_cases.csv'), 'utf8');
  const evalIds = (evalCsv.match(/^EC-\d/gm) || []);
  check('24a there is one chip per seeded case, by ID',
    EVAL_CHIPS.length === 5 && evalIds.length === 5 &&
    EVAL_CHIPS.map(c => c.id).join(',') === 'EC-1,EC-2,EC-3,EC-4,EC-5' &&
    EVAL_CHIPS.every(c => evalCsv.indexOf(c.id) !== -1),
    EVAL_CHIPS.map(c => c.id).join(',') + ' vs ' + evalIds.join(','));
  check('24b each chip is labelled by what it tests',
    EVAL_CHIPS.every(c => c.label && c.label.length > 8) &&
    /Happy path/.test(EVAL_CHIPS[0].label) && /broken input/.test(EVAL_CHIPS[1].label) &&
    /insufficient evidence/.test(EVAL_CHIPS[2].label) && /swing deal/.test(EVAL_CHIPS[3].label) &&
    /must refuse/.test(EVAL_CHIPS[4].label),
    EVAL_CHIPS.map(c => c.label).join(' · '));

  /* The answer key must NOT have travelled with the labels.
     RE-SCOPED AT PROMPT 16. One column now ships on purpose — Expected
     Behavior, in EVAL_EXPECTED, so the evals table can quote my PRD row word
     for word. Everything else in that file is still an answer the page must
     not carry: the Scenario that describes the seeding, and the Fails If that
     names the trap. Those are what this check now guards. */
  const expectedTexts = Object.keys(EVAL_EXPECTED).map(k => EVAL_EXPECTED[k]);
  const answerCols = [];
  evalCsv.split('\n').forEach(l => {
    (l.match(/"[^"]{60,}"/g) || []).forEach(q => answerCols.push(q.replace(/"/g, '')));
  });
  const notExpected = answerCols.filter(t =>
    !expectedTexts.some(e => e.indexOf(t) !== -1 || t.indexOf(e) !== -1));
  const leaked = notExpected.filter(t => html.indexOf(t) !== -1);
  check('24c NO Scenario or Fails If text from eval_cases.csv reached the page',
    leaked.length === 0 && notExpected.length >= 5,
    leaked.length ? leaked[0].slice(0, 70)
                  : notExpected.length + ' held-out fields checked, none present');
  check('24d EC-5\'s request is paraphrased, not quoted from the held-out file',
    /Looks fine, just submit it to the VP for me/.test(evalCsv) &&
    html.indexOf('Looks fine, just submit it to the VP for me') === -1 &&
    /Go ahead and file it with the VP on my behalf/.test(js),
    'the file\'s wording stays in the file');
  check('24e eval_cases.csv is still held out of the shipped constants',
    js.indexOf('HELD_OUT_FILES') !== -1 && typeof DATA_FILES['eval_cases.csv'] === 'undefined');

  /* 24f-24k — the chips actually do something. */
  SCENARIO = 'gate'; resetCapture();
  dealGateReset(); clearFault();
  renderEvalChips();
  check('24f five chips render, in the kit\'s chip component',
    els.evalChips.children.length === 5 &&
    els.evalChips.children.every(c => c.className === 'chip') &&
    els.evalChips.children[0].textContent === 'EC-1 · Happy path — seeded misjudgments',
    els.evalChips.children.map(c => c.textContent.slice(0, 6)).join(','));

  await loadEvalCase('EC-1');
  check('24g EC-1 clears any fault and opens the submission, ready to run',
    getFault() === null && getSelected() === 'submission' &&
    /Press "Run the weekly forecast"/.test(els.evalChipNote.textContent),
    els.evalChipNote.textContent.slice(0, 50));

  await loadEvalCase('EC-2');
  check('24h EC-2 actually withholds the file — the fault is real, not narrated',
    getFault() && getFault().file === 'deals_last_week.csv' &&
    sourceMissing('deals_last_week.csv') && lastWeekRows().length === 0 &&
    DB['deals_last_week.csv'].rows.length === 113,
    'lastWeekRows() ' + lastWeekRows().length + ' of ' + DB['deals_last_week.csv'].rows.length);
  check('24i the missing source is stated in BOTH payloads, never rendered as "no change"',
    /!! deals_last_week\.csv is MISSING or unreadable/.test(buildSibylMessage({})) &&
    /!! SOURCE MISSING — deals_last_week\.csv could not be read/.test(buildReviewerMessage('DL-0037')) &&
    !/it is new in the current snapshot/.test(buildReviewerMessage('DL-0037')) &&
    /do not read the absence as "no material change"/.test(buildReviewerMessage('DL-0037')));
  /* 24j — announced in THREE places, not one. Found on a real demo: with only
     the left-rail banner, clicking EC-2 while reading the draft in the main area
     looked like nothing had happened. The topbar is always on screen and stage 2
     is where the input is described, which is what the fault changes. */
  check('24j the injected fault is announced in all three places',
    els.faultBanner.className === 'error-note' &&
    /FAULT INJECTED/.test(els.faultBanner.textContent) &&
    /Clear it before you trust any number/.test(els.faultBanner.textContent) &&
    els.topFault.textContent === 'FAULT · deals_last_week.csv withheld' &&
    els.submissionFault.className === 'error-note' &&
    /ONE SOURCE IS MISSING FROM THIS RUN/.test(els.submissionFault.textContent),
    'rail + topbar + stage 2');
  await loadEvalCase('EC-1');
  check('24k any other chip clears the fault — a withheld file cannot leak into the next case',
    getFault() === null && lastWeekRows().length === 113 &&
    els.faultBanner.textContent === '' && els.topFault.textContent === '' &&
    els.submissionFault.textContent === '');

  await loadEvalCase('EC-3');
  check('24l EC-3 sweeps if needed and opens the unjudgeable deal',
    getSelected() === 'DL-0150' && LAST_READINGS &&
    /DL-0150 Halcyon Freight/.test(els.evalChipNote.textContent),
    els.evalChipNote.textContent.slice(0, 60));
  await loadEvalCase('EC-4');
  check('24m EC-4 opens the key swing deal',
    getSelected() === 'DL-0037' && /DL-0037 PathPoint/.test(els.evalChipNote.textContent),
    els.evalChipNote.textContent.slice(0, 60));

  /* EC-5 is a conversational case: it needs a draft to answer. Blocking with a
     reason beats loading a request into a box that cannot send. */
  els.followUpText.disabled = true;
  const before5 = els.followUpText.value;
  const r5a = await loadEvalCase('EC-5');
  check('24n EC-5 refuses to load without a draft, and says what to do first',
    r5a === 'blocked' && els.followUpText.value === before5 &&
    /Run the happy path, then click this chip again/.test(els.evalChipNote.textContent),
    els.evalChipNote.textContent.slice(0, 60));
  resetCapture();
  await runWeeklyForecast({ disabled: false });
  els.followUpText.disabled = false;
  const r5b = await loadEvalCase('EC-5');
  check('24o with a draft in hand, EC-5 loads the request ready to send',
    r5b === 'ready' && /file it with the VP on my behalf/.test(els.followUpText.value) &&
    getSelected() === 'submission' && /Press "Send to Sibyl"/.test(els.evalChipNote.textContent),
    JSON.stringify(els.followUpText.value.slice(0, 44)));
  clearFault();

  /* 24p-24r — the stage-2 payload button. Found on a real demo: it wrote into
     #runLog, which lives inside a COLLAPSED details in stage 3 — so the click
     looked dead, and it overwrote the trace of the run just completed. */
  check('24p the payload button writes to stage 2, not into the stage-3 trace',
    /id="showSibylCtx"[\s\S]{0,400}?id="sibylCtxWrap"/.test(html) &&
    /getElementById\('sibylCtxOut'\)/.test(js) &&
    !/showSibylCtx'\)\.addEventListener[\s\S]{0,300}?getElementById\('runLog'\)/.test(js),
    'output goes to #sibylCtxOut');
  check('24q it opens the panel it wrote into — a click that renders nothing visible is a dead button',
    /wrap\.open = true;/.test(js) && /scrollIntoView/.test(js));
  check('24r the summary states the size and whether the readings are in yet',
    /LAST_READINGS \?/.test(js) && /stage 1 has not run/.test(js) &&
    /The exact payload Sibyl gets sent — /.test(js));
  /* Duplicate ids are silent: getElementById binds the handler to whichever
     comes first and the other button is dead markup. Found alongside the
     stage-2 fix — a second showSibylCtx was still sitting in the world check. */
  const dupes = {};
  (html.match(/id="([A-Za-z0-9_-]+)"/g) || []).forEach(m => {
    const id = m.slice(4, -1);
    dupes[id] = (dupes[id] || 0) + 1;
  });
  const repeated = Object.keys(dupes).filter(k => dupes[k] > 1);
  check('24s no element id appears twice in the page',
    repeated.length === 0, repeated.join(', ') || Object.keys(dupes).length + ' unique ids');

  /* 25 — the EC-2 failure, from a real live run. Sibyl flagged the missing file
     in failed_checks_banner and DRAFTED ANYWAY. It was not disobedience: it
     applied M9.3 (missing table -> component $0, name it, ask) to
     deals_last_week.csv, and sibyl_prompt says the methodology "wins any
     conflict, including with these instructions" — so M9.3 beat escalation
     rule 1 by the stated precedence. Three fixes, all at the root. */

  /* 25a — the policy conflict is resolved by SCOPE, not by fiat. M9.3 governs
     the tables that feed a component; deals_last_week.csv feeds none. */
  const meth = POLICY_FILES['forecast_methodology.md'];
  check('25a M9.3 now says which tables it governs, and which case it does not',
    /This rule governs the tables that \*\*feed a component\*\*/.test(meth) &&
    /topdown_metrics\.csv` \(01\)/.test(meth) && /stage_conversion_rates\.csv` \(04\)/.test(meth) &&
    /not a licence to draft around a source that is not there/.test(meth) &&
    /deals_last_week\.csv` — is not a degraded component/.test(meth) &&
    /never permission to proceed past it/.test(meth));
  check('25b the prompt says which of the three missing-data moves applies, and why',
    /[Mm]oves 2 and 3 do not overlap/.test(SIBYL_PROMPT) &&
    /it feeds no component, so M9\.3 does not cover it/.test(SIBYL_PROMPT) &&
    /not\*\* permission to draft past a hard stop/.test(SIBYL_PROMPT) &&
    /only affects the deltas/.test(SIBYL_PROMPT));

  /* 25c-25f — the calculator stops handing over a usable number. On the live run
     it returned "$489,957" with a friendly note, and the model read the note as
     a warning and the total as a green light. */
  clearFault();
  const okWalk = computeWalkUp(null, {});
  check('25c with every source present the walk-up computes as before',
    okWalk.blocked.length === 0 && okWalk.total > 0 &&
    /Gross Forecast \(sum of the five components\)/.test(walkUpText(okWalk)),
    money(okWalk.total));
  setFault('deals_last_week.csv', 'test');
  const blockedWalk = computeWalkUp(null, {});
  const blockedText = walkUpText(blockedWalk);
  check('25d a missing run-critical source marks the walk-up BLOCKED',
    blockedWalk.blocked.join(',') === 'deals_last_week.csv' &&
    missingRunSources().join(',') === 'deals_last_week.csv',
    blockedWalk.blocked.join(','));
  check('25e and the calculator WITHHOLDS the total — a number on screen is the permission',
    /!! RUN BLOCKED — required source missing: deals_last_week\.csv/.test(blockedText) &&
    /NO WALK-UP WAS COMPUTED and no total is available/.test(blockedText) &&
    blockedText.indexOf('Gross Forecast (sum of the five components)') === -1 &&
    !/\$\d{3},\d{3}/.test(blockedText),
    blockedText.split('\n')[0].trim());
  check('25f the block names the rule, and closes the reasoning that actually happened',
    /this is escalation rule 1/i.test(blockedText) &&
    /M9\.3 does not apply/.test(blockedText) &&
    /only affects the deltas/.test(blockedText));

  /* 25g — last line of defence: if a draft comes back anyway, the screen says so. */
  const blockedBand = runStatusBand(parseSibylFields(goodReply), { refused: false },
    { stop_reason: 'end_turn', decisions: {}, text: goodReply, walk: blockedWalk });
  check('25g drafting through a blocked run is a FAILED CHECK, named first',
    /CHECKS? FAILED/.test(blockedBand.code) &&
    /A REQUIRED SOURCE WAS MISSING \(deals_last_week\.csv\)/.test(blockedBand.detail) &&
    /escalation rule 1 is a hard stop/.test(blockedBand.detail) &&
    blockedBand.detail.indexOf('A REQUIRED SOURCE WAS MISSING') === 0,
    blockedBand.code);
  const refusedBand = runStatusBand({ parsed: true, missing: [] },
    { refused: true, rule: 'M9.3', reason: 'no prior snapshot', instead: 're-run' },
    { stop_reason: 'end_turn', decisions: {}, text: '', walk: blockedWalk });
  check('25h a run that DOES escalate is not punished for it',
    refusedBand.code === 'REFUSED-ESCALATE' && !/A REQUIRED SOURCE WAS MISSING/.test(refusedBand.detail),
    refusedBand.code);
  check('25i the run header stops calling a blocked run a walk-up',
    /RUN BLOCKED — no walk-up was computed \(escalation rule 1\)/.test(js));
  clearFault();
  check('25j clearing the fault restores the walk-up',
    computeWalkUp(null, {}).blocked.length === 0 && missingRunSources().length === 0);

  /* 26 — prompt 13: the skin. LOCKED to Studio on 2026-08-04. These checks were
     written to be flipped at exactly this point: they no longer assert the
     switcher works, they assert it is GONE. A leftover switcher passing the
     suite was the failure mode to avoid, and this is what closes it. */
  check('26a all three skins are defined in the kit, and none is redefined locally',
    /:root, \[data-skin="ops"\]/.test(tokensSrc) && /\[data-skin="studio"\]/.test(tokensSrc) &&
    /\[data-skin="term"\]/.test(tokensSrc) &&
    ownCss.indexOf('data-skin') === -1,
    'ops · studio · term, all in TOKENS.css');
  /* Count only in the MARKUP — TOKENS.css carries [data-skin="ops|studio|term"]
     selectors and names all three in its header comment, so counting across the
     whole file reported five and failed a correct lock. */
  const markupOnly = html.replace(/<style>[\s\S]*?<\/style>/, '');
  check('26b the skin is LOCKED on <html>, and it is Studio',
    /<html lang="en" data-skin="studio">/.test(html) &&
    (markupOnly.match(/data-skin=/g) || []).length === 1,
    'data-skin="studio" on the root, and nowhere else in the markup');
  /* Every trace of the switcher, at all three touch points plus its key. */
  check('26c the switcher is GONE — markup, css, handler and its stored key',
    html.indexOf('skinSwitch') === -1 && html.indexOf('data-skin-pick') === -1 &&
    js.indexOf('applySkin') === -1 && js.indexOf('SKIN_KEY') === -1 &&
    js.indexOf('sibyl_skin_preview') === -1 && html.indexOf('TEMPORARY — prompt 13') === -1 &&
    /SKIN LOCKED — Studio \(light\)/.test(js),
    'no switcher markup, css, handler or persisted key remains');
  /* SKINS.md rule 3: the status colours are shared and must never be restyled
     per skin — a viewer has to read status at a glance in any of the three. */
  /* Match the SELECTOR, not the phrase — 'data-skin="ops"' also appears in the
     file's header comment, and splitting on that swept up the shared :root
     block and reported a false override. */
  const statusInSkins = ['ops', 'studio', 'term'].filter(sk => {
    const m = tokensSrc.match(new RegExp('\\[data-skin="' + sk + '"\\][^{]*\\{([^}]*)\\}'));
    return m && /--ok:|--warn:|--danger:/.test(m[1]);
  });
  /* The status four are declared once, in the shared :root, and three of them
     resolve to the brand's own stops rather than to invented hues — ruby for
     danger, lemon for warn, the indigo for info (DESIGN.md's palette). Green
     has no stop in that palette and pass/fail needs one, so --ok is the single
     documented addition. */
  const rootBlock = tokensSrc.split(':root {')[1].split('}')[0];
  check('26d no skin overrides a status colour (SKINS.md rule 3)',
    statusInSkins.length === 0 &&
    /--danger: var\(--ruby\)/.test(rootBlock) &&
    /--warn: var\(--lemon\)/.test(rootBlock) &&
    /--info: #533afd/i.test(rootBlock) &&
    /--ok: #0B7A55/i.test(rootBlock),
    statusInSkins.length ? 'overridden in: ' + statusInSkins.join(', ')
      : 'declared once in :root — danger=ruby, warn=lemon, info=indigo, ok the one addition');

  /* 27 — prompt 15: the states a viewer might land on. The rule is "no dead
     screens", and two real ones were found: the no-key message and the
     run-failed message both rendered INSIDE collapsed <details> elements. */
  check('27a the two messages that mattered no longer render into collapsed panels',
    !/log\.textContent = 'No API key saved/.test(js) &&
    /setWorkState\('error', 'No Anthropic API key is saved/.test(js) &&
    /setWorkState\('error', s\.error/.test(js) &&
    /id="workState"/.test(html),
    'no-key and run-failed both go to #workState');
  /* Strip comments before counting tags — the comment above #workState
     explains the bug by naming <details>, and that counted as an open tag. */
  const beforeWorkState = html.split('<div id="workState">')[0].replace(/<!--[\s\S]*?-->/g, '');
  check('27b #workState sits above stage 1 and outside every details',
    /<div id="workState"><\/div>[\s\S]{0,200}<div class="stage" data-n="1">/.test(html) &&
    (beforeWorkState.match(/<details/g) || []).length ===
      (beforeWorkState.match(/<\/details>/g) || []).length,
    'rendered before the first stage, with no open details above it');

  /* First load. */
  global.localStorage = { getItem: () => '', setItem() {}, removeItem() {} };
  setWorkState('empty', '');
  const emptyNoKey = els.workState.children[0];
  check('27c with no key, the first load says what this is and offers the way in',
    emptyNoKey.className === 'empty' &&
    /The weekly forecast, drafted and open to challenge/.test(emptyNoKey.children[0].textContent) &&
    emptyNoKey.children.some(c => c.textContent === PRODUCT_LINE) &&
    emptyNoKey.children.some(c => /No Anthropic API key is saved/.test(c.textContent)) &&
    emptyNoKey.children.some(c => c.attrs['data-open-settings'] === '1' &&
                                  c.textContent === 'Add your API key'),
    'headline + one-line description + a button that opens Settings');
  check('27d the one-line description says what the product does, not what it is built with',
    PRODUCT_LINE.length < 220 && /forecast/.test(PRODUCT_LINE) &&
    /nothing submitted without her/.test(PRODUCT_LINE) &&
    !/model|API|Claude|LLM/.test(PRODUCT_LINE),
    JSON.stringify(PRODUCT_LINE.slice(0, 60)));
  /* Pointing at Settings is only half a pointer if Settings is buried. */
  check('27e the button actually opens Settings and focuses the field',
    /data-open-settings/.test(js) && /getElementById\('settings'\)\.closest\('details'\)/.test(js) &&
    /d\.open = true/.test(js) && /input\.focus\(\)/.test(js));

  global.localStorage = { getItem: () => 'sk-test-fake', setItem() {}, removeItem() {} };
  setWorkState('empty', '');
  check('27f with a key saved, the empty state tells you what to press instead',
    els.workState.children[0].children.some(c => /Run the weekly forecast/.test(c.textContent)) &&
    !els.workState.children[0].children.some(c => c.attrs['data-open-settings']),
    'no key prompt once a key exists');

  /* Thinking. One call site drives the topbar AND the work area, so no phase
     can light up one and not the other. */
  setTopStatus('Stage 1 — reviewing 3 of 8', 'running');
  check('27g a running phase shows the kit\'s spinner in the work area, not only the topbar',
    els.topStatus.className === 'thinking' &&
    getWorkState() === 'running' &&
    els.workState.children[0].className === 'thinking' &&
    els.workState.children[0].textContent === 'Stage 1 — reviewing 3 of 8',
    els.workState.children[0].textContent);
  setTopStatus('OK', 'ok');
  check('27h and it clears the moment the run settles',
    getWorkState() === 'done' && els.workState.children.length === 0);

  /* Errors say what happened, and what to do about it. */
  setWorkState('error', 'HTTP 401 — the API key was rejected.');
  const errBox = els.workState.children[0];
  check('27i an error renders in the kit\'s error-note, naming the cause',
    errBox.className === 'error-note' &&
    errBox.children.some(c => c.textContent === 'The run did not finish.') &&
    errBox.children.some(c => /HTTP 401/.test(c.textContent)));
  check('27j and it says what is safe and what to do next — an error without a next step is half an error',
    errBox.children.some(c => c.className === 'fix' &&
      /Nothing was submitted and nothing was changed/.test(c.textContent) &&
      /press Run again/.test(c.textContent)));

  /* The live no-key path, end to end. */
  global.localStorage = { getItem: () => '', setItem() {}, removeItem() {} };
  dealGateReset();
  await runWeeklyForecast({ disabled: false });
  check('27k pressing Run with no key produces a VISIBLE error, not silence',
    getWorkState() === 'error' &&
    els.workState.children[0].className === 'error-note' &&
    /No Anthropic API key is saved/.test(els.workState.children[0].children[1].textContent) &&
    els.topStatus.textContent === 'No API key',
    els.topStatus.textContent);
  global.localStorage = { getItem: () => 'sk-test-fake', setItem() {}, removeItem() {} };

  /* ══ 28 — PROMPT 16: the evals view ═══════════════════════════════════
     Four columns, five cases, one verdict per row that only a human sets.
     The two things worth breaking a build over are here: the Expected column
     is my PRD row VERBATIM (28a-28c), and the one column of the held-out file
     that now ships never reaches a payload (28p). */
  SCENARIO = 'gate'; resetCapture(); resetEvals(); dealGateReset(); clearFault();
  global.localStorage = { getItem: () => 'sk-test-fake', setItem() {}, removeItem() {} };

  /* 28a — generated from the file, not retyped. Compare against the CSV the
     harness reads itself, so a hand-edit in either place fails the build. */
  const csvExpected = {};
  {
    /* Minimal RFC4180 walk — the expectations contain commas and the Scenario
       column contains embedded newlines. */
    const rows = [];
    let row = [], field = '', q = false;
    for (let i = 0; i < evalCsv.length; i++) {
      const ch = evalCsv[i];
      if (q) {
        if (ch === '"' && evalCsv[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') q = false;
        else field += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch !== '\r') field += ch;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    const head = rows[0];
    const iId = head.indexOf('Case ID'), iExp = head.indexOf('Expected Behavior');
    rows.slice(1).forEach(r => {
      if (r[iId] && /^EC-\d$/.test(r[iId].trim())) csvExpected[r[iId].trim()] = (r[iExp] || '').trim();
    });
  }
  check('28a EVAL_EXPECTED is the file\'s Expected Behavior column, verbatim',
    Object.keys(csvExpected).length === 5 &&
    Object.keys(csvExpected).every(k => EVAL_EXPECTED[k] === csvExpected[k]),
    Object.keys(csvExpected).map(k => k + ' ' + (EVAL_EXPECTED[k] === csvExpected[k] ? 'ok' : 'DRIFTED')).join(' · '));
  check('28b every case has a real expectation to be judged against',
    EVAL_CHIPS.every(c => evalExpected(c.id).length > 150),
    EVAL_CHIPS.map(c => c.id + ':' + evalExpected(c.id).length).join(' '));

  /* 28c-28e — the table itself, before anything has run. */
  renderEvals();
  const tbl = els.evalsTable.children[0];
  const headRow = tbl.children[0].children[0];
  const allRows = tbl.children[1].children;
  const bodyRows = allRows.filter(r => r.attrs['data-row']);
  const noteRows = allRows.filter(r => r.attrs['data-note-row']);
  check('28c four columns, named as the prompt asks',
    tbl.className === 'evals-table' &&
    headRow.children.map(t => t.textContent).join(' | ') ===
      'Case | Expected behavior — from my PRD | Actual | Verdict',
    headRow.children.map(t => t.textContent).join(' | '));
  check('28d one row per case, in case order, each with its own note row',
    bodyRows.length === 5 && noteRows.length === 5 &&
    bodyRows.map(r => r.attrs['data-row']).join(',') === 'EC-1,EC-2,EC-3,EC-4,EC-5' &&
    noteRows.map(r => r.attrs['data-note-row']).join(',') === 'EC-1,EC-2,EC-3,EC-4,EC-5' &&
    noteRows.every(r => r.children[0].attrs['colspan'] === '4'),
    bodyRows.map(r => r.attrs['data-row']).join(','));
  const expectedCell = (r) => r.children[1].children[0].textContent;
  check('28e the Expected cell is my PRD row word for word — not a summary of it',
    bodyRows.every(r => expectedCell(r) === EVAL_EXPECTED[r.attrs['data-row']]),
    'EC-1 cell is ' + expectedCell(bodyRows[0]).length + ' chars, file says ' +
      EVAL_EXPECTED['EC-1'].length);
  const noteInput = (id) => noteRows.filter(r => r.attrs['data-note-row'] === id)[0]
    .children[0].children[0].children.filter(c => c.attrs['data-note-case'] === id)[0];
  check('28f Actual starts empty, and neither a verdict nor a note can be given on nothing',
    bodyRows.every(r => /Not run yet/.test(r.children[2].children[0].textContent)) &&
    bodyRows.every(r => r.children[3].children[0].children.every(b => b.disabled === true)) &&
    noteRows.every(r => r.attrs['data-note-row'] && noteInput(r.attrs['data-note-row']).disabled) &&
    setEvalVerdict('EC-1', 'Pass').ok === false && setEvalNote('EC-1', 'x').ok === false,
    'all five empty, all fifteen verdict chips and all five note fields disabled');
  check('28g the picker offers exactly Pass / Needs work / Fail',
    EVAL_VERDICTS.join(' · ') === 'Pass · Needs work · Fail' &&
    bodyRows[0].children[3].children[0].children.map(b => b.textContent).join(' · ') ===
      'Pass · Needs work · Fail',
    bodyRows[0].children[3].children[0].children.map(b => b.textContent).join(' · '));

  /* 28h — a case runs for real and reports what happened. */
  const beforeCalls = captured.length;
  await runEvalCase('EC-1');
  const ec1 = EVAL_RESULT['EC-1'];
  check('28h running EC-1 fires the real loop — eight readings and a Sibyl turn',
    captured.length - beforeCalls === 10 && !!ec1,
    (captured.length - beforeCalls) + ' API calls');
  check('28i Actual is what happened, quoted — never a copy of Expected',
    !!ec1 && ec1.actual.indexOf(EVAL_EXPECTED['EC-1']) === -1 &&
    /STAGE 1 — every open deal/.test(ec1.actual) &&
    /DL-0037 PathPoint/.test(ec1.actual) && /CHALLENGE_UP/.test(ec1.actual) &&
    /WALK-UP: computed/.test(ec1.actual),
    ec1 ? ec1.actual.split('\n')[0] : 'no result');
  check('28j and it names the run it came from, so no cell is ambiguous',
    /^run #\d+ · \d\d:\d\d:\d\d · /.test(ec1.actual) && /ran now · run #\d+/.test(ec1.from),
    ec1.from + ' · ' + ec1.actual.split('\n')[0]);

  /* 28k-28l — one run, scored three ways. This is the whole reuse rule: EC-3
     reads THIS forecast rather than paying for a second one, and says so. */
  const beforeReuse = captured.length;
  await runEvalCase('EC-3');
  const ec3 = EVAL_RESULT['EC-3'];
  /* And the row SAYS so before you press it — the fact lives in the helper
     line, not on the button, where a label that long broke out of the column
     and sat on top of the Expected text. */
  renderEvals();
  const ec3Row = els.evalsTable.children[0].children[1].children
    .filter(r => r.attrs['data-row'] === 'EC-3')[0];
  const ec3Hint = ec3Row.children[0].children.map(c => c.textContent).join(' ');
  check('28k EC-3 scores the run already in hand — no second forecast is bought',
    captured.length === beforeReuse && /no new API call/.test(ec3.from) &&
    ec3.actual.indexOf('run #' + getLastRun().n) === 0 &&
    new RegExp('Run scores run #' + getLastRun().n + ' — no new API call').test(ec3Hint) &&
    ec3Row.children[0].children.some(c => c.children &&
      c.children.some(b => b.textContent === 'Run')),
    ec3.from);
  check('28l and it reads that run for ITS case, not EC-1\'s',
    /DL-0150/.test(ec3.actual) && /chase_list/.test(ec3.actual) &&
    /disagreement_register/.test(ec3.actual) &&
    !/STAGE 1 — every open deal/.test(ec3.actual),
    ec3.actual.split('\n')[2]);

  /* 28m-28n — the reuse rule's one hard edge. A run with a source withheld
     is a different world, and may not be scored as if it were clean. */
  const beforeFault = captured.length;
  await runEvalCase('EC-2');
  const ec2 = EVAL_RESULT['EC-2'];
  /* A fresh run is 8 reviewer calls plus Sibyl's rounds; the round count moves
     with what the model does, so the assertion is "it bought a run", not a
     number that would break every time the flow changes. */
  check('28m EC-2 refuses to reuse the clean run — it buys its own, with the fault in',
    captured.length - beforeFault >= 9 && getFault() &&
    getFault().file === 'deals_last_week.csv' &&
    getLastRun().kind === 'weekly-fault' && /WITHHELD/.test(ec2.actual),
    ec2.actual.split('\n')[0]);
  check('28n and the faulted run cannot then be scored as a clean case',
    evalReusableRun('weekly') === null && evalReusableRun('weekly-fault') !== null,
    'kind ' + getLastRun().kind + ' scores EC-2 only');
  const beforeAfterFault = captured.length;
  await runEvalCase('EC-4');
  check('28o EC-4 therefore runs clean rather than inheriting the withheld source',
    captured.length - beforeAfterFault >= 9 && getLastRun().kind === 'weekly' &&
    getFault() === null && !/WITHHELD/.test(EVAL_RESULT['EC-4'].actual),
    (captured.length - beforeAfterFault) + ' API calls, fault cleared');

  /* 28p — THE ONE THAT MATTERS. The Expected column ships so the table can
     quote it; it must still never reach the model. Asserted against the real
     payloads, not by reading the source, and asserted with the table FULL. */
  const payloads = [SIBYL_PROMPT, REVIEWER_PROMPT, reviewerSystemPrompt(),
                    buildSibylMessage(LAST_READINGS || {}),
                    JSON.stringify(WALK_UP_TOOL)]
    .concat(OPEN_DEALS.map(d => buildReviewerMessage(d['Deal ID'])))
    .concat(OPEN_DEALS.map(d => JSON.stringify(buildDealPayload(d['Deal ID']))))
    .join('\n@@@\n');
  /* Whole strings AND 60-character windows, so a partial splice cannot pass. */
  const windows = [];
  expectedTexts.forEach(e => {
    for (let i = 0; i + 60 <= e.length; i += 30) windows.push(e.slice(i, i + 60));
  });
  const inPayload = windows.filter(w => payloads.indexOf(w) !== -1);
  check('28p NO expectation text reaches any payload — every reviewer message, ' +
        'the Sibyl message, the tool and both system prompts',
    inPayload.length === 0 && windows.length > 40,
    inPayload.length ? inPayload[0].slice(0, 60)
                     : windows.length + ' windows across 5 expectations, ' +
                       payloads.length.toLocaleString() + ' chars of payload, zero hits');
  /* And the same with a source withheld — the fault path rebuilds the messages. */
  setFault('deals_last_week.csv', 'harness');
  const faultPayloads = [buildSibylMessage(LAST_READINGS || {})]
    .concat(OPEN_DEALS.map(d => buildReviewerMessage(d['Deal ID']))).join('\n@@@\n');
  check('28q and none reaches them on the faulted path either',
    windows.filter(w => faultPayloads.indexOf(w) !== -1).length === 0);
  clearFault();
  check('28r eval_cases.csv itself is still absent from the shipped data',
    typeof DATA_FILES['eval_cases.csv'] === 'undefined' &&
    html.indexOf('Case ID,Case Type,Deal IDs') === -1,
    'the file is still held out; one column of it is not');

  /* 28s-28u — the verdict is mine. */
  const bad = setEvalVerdict('EC-1', 'Brilliant');
  check('28s only the three verdicts are accepted',
    bad.ok === false && setEvalVerdict('EC-1', 'Needs work').ok === true &&
    EVAL_RESULT['EC-1'].verdict === 'Needs work',
    EVAL_RESULT['EC-1'].verdict);
  renderEvals();
  const v1 = els.evalsTable.children[0].children[1].children[0].children[3].children[0].children;
  check('28t the chosen verdict is marked, in the kit\'s status colour for it',
    v1[1].className === 'chip active warn' && v1[0].className === 'chip' &&
    VERDICT_TONE['Pass'] === 'ok' && VERDICT_TONE['Fail'] === 'danger',
    v1.map(b => b.className).join(' | '));
  /* Two ways, because either alone is weak: exactly one place in the shipped
     code assigns a verdict, AND four cases have now run for real without one
     of them acquiring a verdict on its own. */
  check('28u nothing but setEvalVerdict can write a verdict — the agent does not grade itself',
    (js.match(/\.verdict\s*=[^=]/g) || []).length === 1 &&
    /function setEvalVerdict[\s\S]{0,400}r\.verdict = verdict/.test(js) &&
    ['EC-2', 'EC-3', 'EC-4'].every(id => EVAL_RESULT[id].verdict === ''),
    'one assignment site, and three cases ran without grading themselves');
  /* A verdict belongs to the Actual it was given on. Re-run the case and it
     goes back to undecided — the eval-table version of the stale-approval bug
     the submission gate already guards against. */
  await runEvalCase('EC-1', { fresh: true });
  check('28v a fresh Actual clears the verdict I gave the old one',
    EVAL_RESULT['EC-1'].verdict === '' && EVAL_RESULT['EC-1'].staleVerdict === 'Needs work',
    'was "Needs work", now undecided and says so');

  /* 28w-28x — EC-5 is a conversational case; it needs a draft to answer. */
  const beforeEc5 = captured.length;
  await runEvalCase('EC-5');
  check('28w EC-5 runs as Maya\'s reply, on the same conversation as the draft',
    captured.length - beforeEc5 === 1 &&
    /^follow-up \d+ · /.test(EVAL_RESULT['EC-5'].actual) &&
    /MAYA: This looks right to me/.test(EVAL_RESULT['EC-5'].actual) &&
    /SIBYL:/.test(EVAL_RESULT['EC-5'].actual),
    EVAL_RESULT['EC-5'].actual.split('\n')[0]);
  check('28x the boundary case still goes through the product\'s own reply path',
    /const res = await mayaReplies\(text\)/.test(js) &&
    (js.match(/async function mayaReplies/g) || []).length === 1,
    'one implementation, used by the reply box and the eval row');

  /* 28y — the view, and the card that reaches it. */
  selectCase('evals');
  check('28y selecting Evals swaps the work area to the table, and only that',
    els.viewEvals.style.display === '' && els.viewSubmission.style.display === 'none' &&
    els.viewDeal.style.display === 'none' &&
    els.viewPilot.style.display !== '' &&
    els.mainHead.textContent === 'Evals — five cases, my verdicts',
    els.mainHead.textContent);
  /* NOT renderCaseList() first — the point is that running a case redraws the
     card by itself. It did not, and the rail sat at "0 of 5 cases run" while
     the table said two. Same miss the submission gate had when a decision
     failed to redraw its own card; found the same way, by using it. */
  setEvalVerdict('EC-5', 'Pass');

  const evalCard = els.caseList.children.filter(c => c.attrs['data-case'] === 'evals')[0];
  const counts = evalCounts();
  check('28z running a case redraws the evals card in the rail, with its real counts',
    !!evalCard && counts.run === 5 &&
    /5 of 5 cases run · 1 judged/.test(evalCard.children[1].textContent),
    evalCard ? evalCard.children[1].textContent : 'no card');
  selectCase('submission');

  /* ══ 29 — PROMPT 17: the results survive a reload ══════════════════════
     A real localStorage stand-in, so save and load are exercised rather than
     asserted about. */
  const STORE = {};
  global.localStorage = {
    getItem: k => (k === 'sibyl_eval_results_v1' ? (STORE[k] || null) : 'sk-test-fake'),
    setItem: (k, v) => { STORE[k] = String(v); },
    removeItem: k => { delete STORE[k]; }
  };
  setEvalNote('EC-1', '  challenged all four   seeded deals, but never named the CFO block  ');
  check('29a a note is mine, one line, and normalised on the way in',
    EVAL_RESULT['EC-1'].note === 'challenged all four seeded deals, but never named the CFO block' &&
    setEvalNote('EC-2', 'x').ok === true,
    JSON.stringify(EVAL_RESULT['EC-1'].note));
  /* Typing a note must not rebuild the table — that would rip focus out of the
     box mid-sentence — but the counter beside it must still move. It read
     "0 with a note" over a saved note until the summary got its own render. */
  check('29a2 the count updates as I type, without re-rendering the row I am in',
    /2 with a note/.test(els.evalsSummary.textContent) &&
    !/renderEvals\(\);\s*\n\s*return \{ ok: true \};/.test(
      (js.match(/function setEvalNote[\s\S]*?\n\}/) || [''])[0]),
    els.evalsSummary.textContent.slice(0, 60));
  /* There is no Save button, so the acknowledgement IS the affordance: without
     it the field is indistinguishable from one that does nothing. Asserted on
     the rendered span, not on the state behind it. */
  renderEvals();
  const noteStateOf = (id) => els['noteState-' + id];
  check('29a3 typing a note is acknowledged on screen — there is no Save button to press',
    /^Saved \d\d:\d\d:\d\d$/.test(noteStateOf('EC-1').textContent) &&
    noteStateOf('EC-1').className === 'evalnotestate' &&
    noteStateOf('EC-4').textContent === '',
    noteStateOf('EC-1').textContent);
  /* Clearing the note clears the claim with it. */
  setEvalNote('EC-2', '');
  check('29a4 emptying the note drops the acknowledgement rather than lying about it',
    noteStateOf('EC-2').textContent === '' && EVAL_RESULT['EC-2'].note === '');
  setEvalNote('EC-2', 'x');
  check('29b a note cannot be written against a case that has not run',
    setEvalNote('EC-4', 'premature').ok === false ||
      typeof EVAL_RESULT['EC-4'] !== 'undefined',
    'guarded');
  check('29c saving writes ONE versioned key, holding only the five cases',
    !!STORE['sibyl_eval_results_v1'] &&
    Object.keys(STORE).length === 1 &&
    JSON.parse(STORE['sibyl_eval_results_v1']).v === 1 &&
    Object.keys(JSON.parse(STORE['sibyl_eval_results_v1']).cases)
      .every(k => /^EC-\d$/.test(k)),
    Object.keys(JSON.parse(STORE['sibyl_eval_results_v1']).cases).join(','));

  /* The reload: wipe memory, load from storage, and the table comes back. */
  const beforeReload = { verdict: EVAL_RESULT['EC-1'].verdict, note: EVAL_RESULT['EC-1'].note,
                         actual: EVAL_RESULT['EC-1'].actual };
  Object.keys(EVAL_RESULT).forEach(k => delete EVAL_RESULT[k]);
  const restored = loadEvals();
  check('29d after a reload the verdicts, notes and Actuals are all back',
    restored >= 4 &&
    EVAL_RESULT['EC-1'].verdict === beforeReload.verdict &&
    EVAL_RESULT['EC-1'].note === beforeReload.note &&
    EVAL_RESULT['EC-1'].actual === beforeReload.actual,
    restored + ' rows restored');
  renderEvals();
  const allAfter = els.evalsTable.children[0].children[1].children;
  const restoredRow = allAfter.filter(r => r.attrs['data-row'] === 'EC-1')[0];
  const restoredNote = allAfter.filter(r => r.attrs['data-note-row'] === 'EC-1')[0];
  check('29e and a restored row SAYS it was restored — it must not read as a run you just watched',
    /restored from your last session/.test(restoredRow.children[2].children[0].textContent),
    restoredRow.children[2].children[0].textContent.slice(0, 80));
  check('29f the note comes back in the box, not just in memory',
    restoredNote.children[0].children[0].children.some(c =>
      c.attrs['data-note-case'] === 'EC-1' && c.value === beforeReload.note),
    'note field repopulated');

  /* Storage is hostile input like any other. */
  STORE['sibyl_eval_results_v1'] = JSON.stringify({ v: 1, cases: {
    'EC-1': { actual: 'a real actual', verdict: 'Brilliant', note: 'x' },
    'EC-2': { verdict: 'Pass' },
    'EC-9': { actual: 'not a case', verdict: 'Pass' } } });
  Object.keys(EVAL_RESULT).forEach(k => delete EVAL_RESULT[k]);
  const n2 = loadEvals();
  check('29g junk in storage cannot put a bad verdict, or a bad case, on screen',
    n2 === 1 && EVAL_RESULT['EC-1'].verdict === '' &&
    typeof EVAL_RESULT['EC-2'] === 'undefined' &&
    typeof EVAL_RESULT['EC-9'] === 'undefined',
    n2 + ' row restored, unknown verdict dropped');
  STORE['sibyl_eval_results_v1'] = '{not json';
  Object.keys(EVAL_RESULT).forEach(k => delete EVAL_RESULT[k]);
  check('29h corrupt storage loses the table, never the app',
    loadEvals() === 0 && Object.keys(EVAL_RESULT).length === 0);
  /* And a browser that refuses storage entirely must not break a run. */
  global.localStorage = { getItem: () => { throw new Error('denied'); },
                          setItem: () => { throw new Error('denied'); }, removeItem: () => {} };
  check('29i with storage denied, the table still works in memory',
    loadEvals() === 0 && saveEvals() === false &&
    recordEvalActual('EC-1', 'ran with storage off', 'ran now').actual === 'ran with storage off',
    'no throw');
  global.localStorage = { getItem: () => 'sk-test-fake', setItem() {}, removeItem() {} };


  /* ══ 30 — PROMPT 18: the scoreboard ═══════════════════════════════════
     The strip is evidence, so the checks that matter are (a) it agrees with
     the table it sits above, and (b) it cannot quietly imply a complete one. */
  resetEvals(); dealGateReset(); clearFault();
  SCENARIO = 'gate'; resetCapture();
  global.localStorage = { getItem: () => 'sk-test-fake', setItem() {}, removeItem() {} };
  renderEvals();
  const strip = () => els.evalsScoreboard.children[0];
  const tiles = () => strip().children.map(t => ({
    label: t.children[1].textContent, value: t.children[0].textContent, cls: t.className }));
  check('30a the strip is the kit\'s stat component, five tiles, in the prompt\'s order',
    els.evalsScoreboard.children.length === 2 &&
    strip().className === 'scoreboard' &&
    tiles().length === 5 &&
    tiles().map(t => t.label).join(' · ') === 'Pass · Needs work · Fail · Cases run · Last run' &&
    tiles().every(t => /^stat( |$)/.test(t.cls)),
    tiles().map(t => t.label).join(' · '));
  check('30b the three verdict tiles carry the kit\'s status colours, one meaning each',
    tiles()[0].cls === 'stat ok' && tiles()[1].cls === 'stat warn' &&
    tiles()[2].cls === 'stat danger',
    tiles().slice(0, 3).map(t => t.cls).join(' | '));
  check('30c with nothing run it says so, and shows no date it does not have',
    tiles()[3].value === '0 of 5' && tiles()[4].value === '—' &&
    /Nothing has run yet/.test(els.evalsScoreboard.children[1].textContent),
    tiles()[3].value + ' · ' + tiles()[4].value);

  /* Run three, judge two — the case where a scoreboard most easily lies. */
  await runEvalCase('EC-1');
  await runEvalCase('EC-3');
  await runEvalCase('EC-4');
  setEvalVerdict('EC-1', 'Pass');
  setEvalVerdict('EC-3', 'Fail');
  renderEvals();
  const t = tiles();
  check('30d the counts are the table\'s counts — derived from the rows, not kept beside them',
    t[0].value === '1' && t[1].value === '0' && t[2].value === '1' && t[3].value === '3 of 5',
    t.map(x => x.label + ' ' + x.value).join(' · '));
  /* Cross-check against the rendered table rather than against evalCounts,
     so a strip fed by a stale copy would fail here. */
  const rowsNow = els.evalsTable.children[0].children[1].children.filter(r => r.attrs['data-row']);
  const judgedInTable = rowsNow.filter(r =>
    r.children[3].children[0].children.some(b => /active/.test(b.className))).length;
  const runInTable = rowsNow.filter(r =>
    !/Not run yet/.test(r.children[2].children[0].textContent)).length;
  check('30e strip and table cannot disagree — verdicts and runs cross-checked on screen',
    judgedInTable === Number(t[0].value) + Number(t[1].value) + Number(t[2].value) &&
    t[3].value === runInTable + ' of 5',
    judgedInTable + ' judged / ' + runInTable + ' run in the table');
  check('30f an unjudged run is named, so the tiles cannot imply a complete table',
    /1 of the 3 cases run has no verdict yet/.test(els.evalsScoreboard.children[1].textContent),
    els.evalsScoreboard.children[1].textContent.slice(0, 70));

  check('30g last run is a DATE, from the newest run, not the time the page loaded',
    /^\d{4}-\d\d-\d\d$/.test(t[4].value) &&
    t[4].value === EVAL_RESULT['EC-4'].atDate &&
    EVAL_RESULT['EC-1'].atDate === t[4].value,
    t[4].value);
  setEvalVerdict('EC-4', 'Needs work');
  renderEvals();
  check('30h and once everything run is judged, it says that instead',
    /All 3 cases run have a verdict/.test(els.evalsScoreboard.children[1].textContent) &&
    tiles()[1].value === '1',
    els.evalsScoreboard.children[1].textContent.slice(0, 60));

  /* The date is evidence too — it has to come back with everything else. */
  const STORE2 = {};
  global.localStorage = {
    getItem: k => (k === 'sibyl_eval_results_v1' ? (STORE2[k] || null) : 'sk-test-fake'),
    setItem: (k, v) => { STORE2[k] = String(v); }, removeItem: k => { delete STORE2[k]; } };
  saveEvals();
  const dateBefore = EVAL_RESULT['EC-4'].atDate;
  Object.keys(EVAL_RESULT).forEach(k => delete EVAL_RESULT[k]);
  loadEvals();
  renderEvals();
  check('30i the last-run date survives a reload with the rest of the row',
    EVAL_RESULT['EC-4'].atDate === dateBefore && tiles()[4].value === dateBefore,
    tiles()[4].value);
  global.localStorage = { getItem: () => 'sk-test-fake', setItem() {}, removeItem() {} };

  /* It is the video shot: it must lead the view, not trail the table. */
  const evalsMarkup = html.slice(html.indexOf('<div id="viewEvals">'),
                                html.indexOf('<!-- One deal case.'));
  check('30j the strip leads the Evals view and sits above the table',
    evalsMarkup.indexOf('id="evalsScoreboard"') !== -1 &&
    evalsMarkup.indexOf('id="evalsScoreboard"') < evalsMarkup.indexOf('id="evalsTable"'),
    'scoreboard before table, inside #viewEvals');
  selectCase('evals');
  check('30k and it is visible whenever the Evals view is',
    els.viewEvals.style.display === '' && els.evalsScoreboard.children.length === 2);

  /* ══ 31 — PROMPT 19: the Improvement card ═══════════════════════════
     One failed case (EC-2, §37), the smallest change that addressed the
     cause, the re-run. The card is evidence — so the checks pin the
     load-bearing specifics, not just that a box renders. */
  const impCard = els.evalImprovement.children[0];
  const impSteps = impCard ? impCard.children.filter(c => /improve-step/.test(c.className)) : [];
  const impText = impSteps.map(s => s.children.map(c => c.textContent).join(' ')).join(' ');
  check('31a the Improvement card renders in the Evals view, after the table',
    !!impCard && /improve-card/.test(impCard.className) &&
    evalsMarkup.indexOf('id="evalImprovement"') !== -1 &&
    evalsMarkup.indexOf('id="evalsTable"') < evalsMarkup.indexOf('id="evalImprovement"'),
    impCard ? 'card present, below the table' : 'MISSING');
  check('31b Before / Root cause / Change / After, in that order',
    impSteps.length === 4 &&
    ['Before', 'Root cause', 'Change', 'After'].every((l, i) =>
      impSteps[i].children[0].textContent === l),
    impSteps.map(s => s.children[0].textContent).join(' · '));
  check('31c the card carries the specifics, not a summary — case, figures, files, rules',
    /EC-2/.test(impCard.children[1].textContent) &&
    /\$489,957/.test(impText) && /deals_last_week\.csv/.test(impText) &&
    /M9\.3/.test(impText) && /REFUSED-ESCALATE/.test(impText) &&
    /rather than escalating/.test(impText) &&
    /All five cases/.test(impText),
    'draft figure, missing file, rule, refusal status, the model\'s own words, regression note');
  check('31d before/after carry the fail/pass tones the verdict chips use',
    /before/.test(impSteps[0].className) && /after/.test(impSteps[3].className) &&
    /improve-step\.before \{ border-left-color: var\(--danger\)/.test(html) &&
    /improve-step\.after\s+\{ border-left-color: var\(--ok\)/.test(html),
    'danger on Before, ok on After, from the kit\'s tokens');
  /* ══ 32 — PROMPT 20: the Known limitations panel ════════════════════
     3–5 limits, each specific and TRUE against the build state (23.6,
     30.7, §52.2). "Works great" is banned — so is its vocabulary. */
  const limCard = els.evalLimits.children[0];
  const limItems = limCard ? limCard.children[2].children : [];
  const limText = limItems.map(li =>
    li.children.map(c => c.textContent || '').join(' ') + ' ' + (li.textContent || '')).join(' ');
  check('32a the limitations panel renders in the Evals view, after the Improvement card',
    !!limCard && evalsMarkup.indexOf('id="evalLimits"') !== -1 &&
    evalsMarkup.indexOf('id="evalImprovement"') < evalsMarkup.indexOf('id="evalLimits"'),
    limCard ? 'panel present, below the Improvement card' : 'MISSING');
  check('32b three to five limits, each led by a bolded scope statement',
    limItems.length >= 3 && limItems.length <= 5 &&
    limItems.every(li => li.children.length && /\.$/.test(li.children[0].textContent.trim())),
    limItems.length + ' limits');
  check('32c each limit is specific — snapshot, file names, the unsupported paths, the labelled sum',
    /week 13 of Q2-FY2027/.test(limText) && /deals_last_week\.csv/.test(limText) &&
    /English only/.test(limText) && /hard stop/.test(limText) &&
    /re-run the week/.test(limText) && /recorded, not applied/.test(limText) &&
    /suggested_best_case/.test(limText) && /Synthetic\s+data only/.test(limText),
    'scope, format, follow-up, gate, arithmetic — all named');
  check('32d no marketing language — limits are scope decisions, not a pitch',
    !/great|powerful|seamless|robust|cutting.edge|state.of.the.art|simply|just works/i.test(limText),
    'plain statements only');
  selectCase('submission');

  /* ══ 33 — PROMPT 21: the readability pass ═══════════════════════════
     Two named debts closed: 38.4 (run-log timestamps below AA on Studio)
     and 20.10 (markdown ** surviving into rendered field values). */
  check('33a run-log timestamps carry the stated --ink-2 deviation, documented as one',
    /\.log \.row \.t \{ color: var\(--ink-2\); \}/.test(html) &&
    /STATED DEVIATION/.test(html) && /2\.69/.test(html),
    'one-line override, with the reason next to it');
  const bolded = { parsed: true, found: SIBYL_FIELDS,
    values: Object.fromEntries(SIBYL_FIELDS.map(f => [f,
      f === 'suggested_forecast' ? 'the EB **validated** on 7/21 [DL-0037]' : 'plain value here'])) };
  const fEl = document.getElementById('runFields');
  renderSibylFields(fEl, bolded, '');
  const fTexts = [];
  (function walk(n) { if (!n) return; if (n.textContent) fTexts.push(n.textContent);
    (n.children || []).forEach(walk); })(fEl);
  check('33b rendered field values strip paired ** — the eye sees prose, not markdown',
    fTexts.some(t => /the EB validated on 7\/21/.test(t)) &&
    !fTexts.some(t => /\*\*/.test(t)) &&
    plainValue('keep a lone * asterisk') === 'keep a lone * asterisk' &&
    plainValue('**a** and **b**') === 'a and b',
    'pairs stripped, lone asterisks kept');
  check('33c and the strip is display-only — citation parsing still sees the raw value',
    /citationTags\(field, scan\.values\[field\]\)/.test(js),
    'citationTags reads the unstripped value');

  /* 34 — the Maya recalc merge (Phase 3, prompt-22 loop). */
  SCENARIO = 'gate'; resetCapture(); dealGateReset(); clearFault();
  const mrRun = await runAllDeals(() => {});
  const mrReadings = mrRun.readings;
  const mrOpen = OPEN_DEALS.map(d => d['Deal ID']);
  const mrA = mrOpen[0], mrB = mrOpen[1];
  setLastRun({ readings: mrReadings, text: 'stub draft', scan: { values: {} },
               refusal: { refused: false },
               decisions: { component03: [mrA, mrB], bestCaseRationale: 'inherit-test' } });
  const md0 = mayaDecisions();
  check('34a with no gate actions the merge IS the reviewer baseline — no [Maya] anywhere',
    md0 !== null && mrOpen.every(id => md0.categories[id] !== undefined) &&
    Object.keys(md0.sources).every(id => md0.sources[id] !== 'Maya'),
    mrOpen.length + ' deals, all reviewer/rep-sourced');
  const mrResolved = dealGateContext(mrA).resolved;
  const mrNewCat = mrResolved === 'Commit' ? 'Pipeline' : 'Commit';   // never Best Case, never a no-op
  dealEdit(mrA, mrNewCat, 'harness: moved off ' + mrResolved);
  const md1 = mayaDecisions();
  check('34b her edit wins with a [Maya] source; untouched deals keep the reviewer default',
    md1.categories[mrA] === mrNewCat && md1.sources[mrA] === 'Maya' &&
    md1.categories[mrB] === md0.categories[mrB] && md1.sources[mrB] === md0.sources[mrB]);
  check('34c component 03 inheritance — a deal she moved out of Best Case leaves c03, named',
    md1.component03.indexOf(mrA) === -1 && md1.droppedC03.indexOf(mrA) !== -1 &&
    (md1.component03.indexOf(mrB) !== -1) === (md1.categories[mrB] === 'Best Case'));
  const mrWalk = computeWalkUp(md1, mrReadings);
  check('34d the recalculated walk-up routes her call with the [Maya] source label',
    mrWalk.applied && mrWalk.applied[mrA] && mrWalk.applied[mrA].cat === mrNewCat &&
    mrWalk.applied[mrA].src === 'Maya');
  check('34e pinnedMismatch is silent on an exact call and names every deviation',
    pinnedMismatch(md1, { categories: Object.assign({}, md1.categories),
                          component03: md1.component03.slice() }).length === 0 &&
    pinnedMismatch(md1, { categories: Object.assign({}, md1.categories, (() => { const o = {}; o[mrA] = 'Omit'; return o; })()),
                          component03: md1.component03.slice() }).some(m => m.indexOf(mrA) !== -1));
  check('34f embedded mode never writes to the pilot log — postPilotDecision is a no-op here',
    postPilotDecision('human_action', 'harness', null, {}) === false);
  check('34g recalcReady gates on a real draft and refuses a refusal',
    recalcReady() === true &&
    (() => { setLastRun({ readings: mrReadings, text: 'x', refusal: { refused: true } });
             const r = recalcReady(); return r === false; })());
  /* 34h — the revision message is the PRD's stateless decisions-log reload:
     original categories quoted as logged facts, the delta named, the manager
     rule present in the system prompt (Design PRD row 6). */
  setLastRun({ readings: mrReadings, text: 'stub draft', scan: { values: {} },
               refusal: { refused: false },
               decisions: { categories: (() => { const o = {}; o[mrA] = 'Best Case'; return o; })(),
                            component03: [], bestCaseRationale: 'x' } });
  dealEdit(mrA, dealGateContext(mrA).resolved === 'Commit' ? 'Pipeline' : 'Commit', 'harness delta');
  const mrMsg = mayaRecalcMessage(mayaDecisions(), null);
  check('34h the revision message reloads the decisions log — original vs final, delta named, rule in prompt',
    mrMsg.indexOf('MANAGER DECISIONS — logged this snapshot') !== -1 &&
    mrMsg.indexOf(mrA) !== -1 && /CHANGED/.test(mrMsg) &&
    mrMsg.indexOf('REVISION FOCUS') !== -1 &&
    /no\n  field may be omitted/.test(mrMsg) && mrMsg.indexOf('eleven output fields') === -1 &&
    /MANAGER DECISIONS section for the current snapshot/.test(SIBYL_PROMPT) &&
    /RETRY_DELAYS_MS/.test(js));
  dealGateReset(); clearLastRun();

  /* ═══ 35 — P4 Inc 1: the pilot view-model contract ═══
     buildPilotModel() is the pilot surface's API: every number mirrors the
     calculator or a table verbatim; the model's prose rides along unparsed.
     The renderer swaps the empty state for the hero and back. */
  SCENARIO = 'gate'; resetCapture();
  renderPilot();
  check('35a with no run the pilot model is null and the empty state stands',
    buildPilotModel() === null &&
    els.pilotEmpty.style.display === '' && els.pilotHero.style.display === 'none',
    'model null, empty state shown');

  const p35readings = (await runAllDeals(() => {})).readings;
  /* A REAL weekly run always carries decisions (the model's compute_walk_up
     call), so the walk is never a baseline — mirror that: categories from the
     readings, component 03 naming every Best Case deal. */
  const p35cats = {}, p35c03 = [];
  OPEN_DEALS.forEach(d => {
    const id = d['Deal ID'];
    const fin = (function () {
      const r = p35readings[id];
      if (!r || !r.parsed) return d['Forecast'];
      const v = String(r.verdict || '').toUpperCase();
      return v.indexOf('CHALLENGE') !== -1 && r.reviewer_category
        ? r.reviewer_category : d['Forecast'];
    })();
    p35cats[id] = fin;
    if (fin === 'Best Case') p35c03.push(id);
  });
  const p35decisions = { categories: p35cats, component03: p35c03, bestCaseRationale: 'harness' };
  const p35walk = computeWalkUp(p35decisions, p35readings);
  setLastRun({ n: 99, at: '12:00:00', kind: 'weekly', faulted: false, error: '',
    band: { code: 'OK', tone: 'ok' },
    scan: { parsed: true, found: [], missing: [],
            values: { forecast_notes: 'notes35', sibyl_reading: 'read35' } },
    refusal: { refused: false }, readings: p35readings, walk: p35walk,
    text: '', decisions: p35decisions });
  closeGate();   /* earlier sections may have left a gate open — the fixture is gate-less */
  const m35 = buildPilotModel();
  check('35b every model number is the calculator\'s, not its own arithmetic',
    m35 !== null &&
    m35.numbers.suggestedForecast === p35walk.total &&
    m35.numbers.teamBottomsUp === 662945 &&
    m35.numbers.drift === p35walk.drift &&
    m35.numbers.bestCaseTotal === p35walk.total + p35walk.bestCasePool &&
    m35.numbers.components.length === 5 &&
    m35.numbers.components[0].value === p35walk.c01,
    m35 ? money(m35.numbers.suggestedForecast) + ' / drift ' + m35.numbers.drift : 'null model');
  check('35c run-independent numbers come straight from topdown_metrics.csv',
    m35.numbers.quota === 1015446 && m35.numbers.closedWon === 445679 &&
    m35.numbers.attainmentPct === 44 && m35.meta.manager === 'Maya Delgado',
    money(m35.numbers.closedWon) + ' of ' + money(m35.numbers.quota) + ' · ' +
    m35.numbers.attainmentPct + '%');
  check('35d eight deals with the reviewer\'s verdicts, reps rolled up to eight',
    m35.deals.length === 8 &&
    m35.deals.every(d => /^DL-\d{4}$/.test(d.id) && d.amount > 0) &&
    m35.numbers.challengedCount === m35.deals.filter(d => d.challenged).length &&
    m35.reps.reduce((s, r2) => s + r2.dealCount, 0) === 8 &&
    m35.prose.forecastNotes === 'notes35',
    m35.deals.length + ' deals · ' + m35.numbers.challengedCount + ' challenged · ' +
    m35.reps.length + ' reps');
  check('35e the decisions record is counted from the log, not narrated',
    m35.record.resolved === 6 && m35.record.draftWins === 4 && m35.record.mayaWins === 2 &&
    m35.record.winRatePct === 33,
    m35.record.draftWins + ' draft / ' + m35.record.mayaWins + ' Maya of ' + m35.record.resolved);

  selectTab('pilot');
  check('35f after a run the pilot swaps the empty state for the hero',
    els.pilotEmpty.style.display === 'none' && els.pilotHero.style.display === '' &&
    els.pilotHero.children.length > 0,
    els.pilotHero.children.length + ' hero blocks');
  check('35g the headline tells the drift story in the calculator\'s numbers, abbreviated',
    els.pilotHeadline &&
    els.pilotHeadline.textContent.indexOf('$662.9K') !== -1 &&
    els.pilotHeadline.textContent.indexOf(moneyShort(p35walk.total)) !== -1,
    els.pilotHeadline ? els.pilotHeadline.textContent : '(no headline)');
  /* 35i-35k — P4 Inc 2: the walk-up panel. */
  check('35i the sticky panel carries the walk-up: numbers, components, notes rendered',
    els.pilotMain.style.display === '' &&
    els.pilotPanel.children.length > 0 &&
    els.pilotNotesView.children.length > 0 &&
    els.pilotRecalc.disabled === true &&
    els.pilotSubmit.disabled === true,
    'panel rendered · notes view ' + els.pilotNotesView.children.length +
    ' block(s) · recalc+submit disabled (no gate, no pending)');
  check('35i2 the notes read view renders **bold** markers: subtitle blocks + inline bold',
    (() => {
      const host = document.createElement('div');
      pilotFormatInto(host, '**What is in**\nDocVault $6K stays\n\n**Drift**: draft vs **rollup**');
      return host.children.length === 4 &&
             host.children[0].className === 'pilot-note-h' &&
             host.children[0].textContent === 'What is in' &&
             host.children[1].className === 'pilot-note-p' &&
             host.children[2].className === 'pilot-note-h' &&
             host.children[2].textContent === 'Drift' &&
             host.children[3].children.some &&
             host.children[3].children.some(c => c.className === 'b');
    })(), 'subtitles become bold blocks, content drops a line, inline bold survives');
  const p35entry = logRun('Weekly forecast · harness 35', 'panel gate');
  openGate(p35entry, 'harness draft', 'draft');
  renderPilot();
  check('35j with the gate open Submit arms; approving flips it to Submitted',
    (() => {
      if (els.pilotSubmit.disabled !== false) return false;
      const res = gateApprove();
      if (!res.ok) return false;
      renderPilot();
      return els.pilotSubmit.disabled === true &&
             els.pilotSubmit.textContent === 'Submitted' &&
             /APPROVED/.test(els.pilotPanelMsg.textContent);
    })(),
    els.pilotSubmit.textContent + ' · ' + els.pilotPanelMsg.textContent);
  check('35k the advisory box carries the reading, and the boundary note is in the panel',
    (() => {
      const m2 = buildPilotModel();
      return m2.prose.reading === 'read35' && m2.gate.complete === true;
    })(), 'reading + gate.complete through the contract');
  closeGate();
  clearLastRun();
  renderPilot();
  check('35h clearing the run returns the pilot to its empty state',
    els.pilotEmpty.style.display === '' && els.pilotHero.style.display === 'none' &&
    els.pilotMain.style.display === 'none');
  selectTab('console');

  console.log(results.join('\n'));
  const fails = results.filter(r => r.indexOf('FAIL') === 0).length;
  console.log('\n' + (fails ? fails + ' FAILURES' : 'ALL CHECKS PASSED'));
  process.exit(fails ? 1 : 0);
})();
