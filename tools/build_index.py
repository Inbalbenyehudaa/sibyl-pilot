#!/usr/bin/env python3
"""Generate index.html for Sibyl (prompt 02 — the skeleton).

Embeds every data/ and policies/ file as a JavaScript constant inside one
self-contained HTML file. eval_cases.csv is deliberately NOT embedded: it is
the held-out answer key and must never reach the agent's context.

Run:  python3 build_index.py
"""
import csv
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
POLICIES = os.path.join(ROOT, "policies")
OUT = os.path.join(ROOT, "index.html")

HELD_OUT = {"eval_cases.csv"}


def esc(text: str) -> str:
    """Escape for a JS template literal."""
    return text.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")


def read(path: str) -> str:
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def collect(folder: str):
    out = {}
    for name in sorted(os.listdir(folder)):
        if name.startswith("."):
            continue
        if name in HELD_OUT:
            continue
        path = os.path.join(folder, name)
        if os.path.isfile(path):
            out[name] = read(path)
    return out


PROMPTS = {
    "__SIBYL_PROMPT__": "sibyl_prompt.md",
    "__REVIEWER_PROMPT__": "deal_reviewer_prompt.md",
}
prompt_text = {}
for token, fname in PROMPTS.items():
    path = os.path.join(ROOT, fname)
    if not os.path.exists(path):
        raise SystemExit(fname + " is missing. It is the source of truth for an agent's "
                         "instructions; refusing to generate index.html without it.")
    prompt_text[token] = read(path).rstrip()

# The agent-side JavaScript is spliced in verbatim from tools/agent_block.js at
# build time — it is NOT carried as a copy inside this file, so there is no
# backslash-doubling step and no escaping trap. Edit agent_block.js, rebuild.
AGENT_BLOCK_PATH = os.path.join(ROOT, "tools", "agent_block.js")
if not os.path.exists(AGENT_BLOCK_PATH):
    raise SystemExit("tools/agent_block.js is missing. It is the source of truth for the "
                     "agent-side JavaScript; refusing to generate index.html without it.")
agent_block = read(AGENT_BLOCK_PATH).rstrip()

# design/TOKENS.css is inlined verbatim at build time — disk is the source of
# truth, exactly as it is for the data, the policies and the two prompts. Note
# that sync_assets.py does NOT cover it (it regenerates JS constants, and this
# is a <style> block), so a TOKENS.css edit needs a full build_index.py run.
TOKENS_PATH = os.path.join(ROOT, "design", "TOKENS.css")
if not os.path.exists(TOKENS_PATH):
    raise SystemExit("design/TOKENS.css is missing. The design is locked and ships in the box; "
                     "refusing to generate index.html without it.")
tokens_css = read(TOKENS_PATH)
if "</style>" in tokens_css.lower():
    raise SystemExit("TOKENS.css contains '</style>', which would break the HTML splice.")
if "</script>" in agent_block.lower():
    raise SystemExit("agent_block.js contains '</script>', which would break the HTML splice.")

data_files = collect(DATA)
policy_files = collect(POLICIES)

# ── PROMPT 16 — the ONE column of the held-out file that ships ──────────
# The evals table has to show Expected Behavior word for word, or it grades
# against a paraphrase. Generated from eval_cases.csv rather than copied by
# hand, so the screen cannot drift from the answer key.
#
# Nothing else from that file crosses this line: Scenario, Fails If, Deal IDs,
# Result and Verdict stay held out. And this constant is NEVER read by a
# payload builder — check 25 proves that against the real payloads.
EVAL_CSV = os.path.join(DATA, "eval_cases.csv")
if not os.path.exists(EVAL_CSV):
    raise SystemExit("data/eval_cases.csv is missing. It is the source of truth for the evals "
                     "table's Expected column; refusing to generate index.html without it.")
with open(EVAL_CSV, encoding="utf-8", newline="") as fh:
    eval_rows = list(csv.DictReader(fh))
eval_expected = {}
for r in eval_rows:
    cid = (r.get("Case ID") or "").strip()
    exp = (r.get("Expected Behavior") or "").strip()
    if not cid:
        continue
    if not exp:
        raise SystemExit("eval case %s has no Expected Behavior. An eval row with no expectation "
                         "cannot be judged; fill it in before building." % cid)
    eval_expected[cid] = exp
if len(eval_expected) != 5:
    raise SystemExit("expected 5 eval cases in eval_cases.csv, found %d" % len(eval_expected))

def emit(mapping):
    parts = []
    for name, body in mapping.items():
        parts.append("  %s: `%s`" % (repr(name).replace("'", '"'), esc(body)))
    return ",\n".join(parts)


HTML = """<!doctype html>
<html lang="en" data-skin="studio">
<head>
<meta charset="utf-8">
<title>Sibyl — weekly forecast console</title>
<style>
__TOKENS_CSS__

/* ═══════════════════════════════════════════════════════════════════
   SIBYL — the console, built ONLY from the tokens above.
   Every colour here is a var() or a color-mix of one. No new hues, no
   new fonts, no emoji.

   The rule that shaped this file: the agent code in agent_block.js
   writes into fixed element IDs and emits fixed class names
   (.ok / .warn / .advisory / .fieldrow / .statusband / .tag / .dealrow).
   Renaming those would have meant editing ~40 call sites and reverifying
   every one. So the CLASS NAMES ARE UNCHANGED and only their definitions
   moved onto tokens. Behaviour never pays for looks.
   ═══════════════════════════════════════════════════════════════════ */

/* Bare elements the agent code emits without classes. */
button { display: inline-flex; align-items: center; gap: var(--sp-2);
  padding: 8px 16px; border-radius: var(--radius-pill);
  border: var(--border-w) solid var(--line); background: var(--bg-raise); color: var(--ink);
  font-family: var(--font-body); font-size: var(--fs-2); font-weight: var(--w-strong);
  line-height: 1; cursor: pointer;
  transition: background-color .12s ease, border-color .12s ease, color .12s ease; }
button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
button:disabled { opacity: .45; cursor: not-allowed; }
button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
button.primary:hover:not(:disabled) { background: var(--accent-deep, var(--accent));
  border-color: var(--accent-deep, var(--accent)); color: var(--accent-ink); }
button.primary:active:not(:disabled) { background: var(--accent-press, var(--accent));
  border-color: var(--accent-press, var(--accent)); }

/* text-input: white field, cooler hairline, 6px radius, 8px 12px. */
input[type="text"], input[type="password"], select, textarea {
  font-family: var(--font-body); font-size: var(--fs-1); font-weight: var(--w-body);
  background: var(--bg-raise); color: var(--ink);
  border: var(--border-w) solid var(--line-input, var(--line)); border-radius: var(--radius-sm);
  padding: 8px 12px; }
textarea { width: 100%; line-height: var(--lh); }
input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent); }
label { font-size: var(--fs-0); color: var(--ink-2); letter-spacing: var(--track-caption); }

/* Display tier: weight 300, negative tracking. Bumping these to 400+
   is what collapses the brand's editorial air — leave them thin. */
h1, h2, h3 { color: var(--ink); font-weight: var(--w-display); line-height: 1.2; }
h1 { font-size: var(--fs-display-lg); letter-spacing: var(--track-display-lg);
     margin: var(--sp-5) 0 var(--sp-3); }
h2 { font-size: var(--fs-heading-md); letter-spacing: var(--track-heading-md);
     margin: var(--sp-5) 0 var(--sp-2); }
h3 { font-size: var(--fs-heading-sm); letter-spacing: var(--track-heading-sm);
     margin: var(--sp-5) 0 var(--sp-2); }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
p { margin: var(--sp-2) 0; }
details { margin: var(--sp-2) 0; }
summary { cursor: pointer; padding: var(--sp-1) 0; color: var(--accent); font-size: var(--fs-0);
  letter-spacing: var(--track-caption); }
summary:hover { color: var(--accent-deep, var(--accent)); }
code { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

/* Every table in this app holds money, counts or dates — body-tabular. */
table { border-collapse: collapse; margin: var(--sp-2) 0; width: 100%;
        font-size: var(--fs-tabular); letter-spacing: var(--track-tabular); }
td, th { border-bottom: var(--border-w) solid var(--line); padding: var(--sp-2);
         text-align: left; vertical-align: top; color: var(--ink-2);
         font-variant-numeric: tabular-nums; }
th { color: var(--ink-3); font-size: var(--fs-micro-cap); font-weight: var(--w-label);
     letter-spacing: var(--track-micro-cap); text-transform: uppercase; }

pre { white-space: pre-wrap; word-break: break-word;
      background: var(--bg-inset); border: var(--border-w) solid var(--line);
      border-radius: var(--radius-md); padding: var(--sp-4); margin: var(--sp-2) 0;
      font-family: var(--font-mono); font-size: var(--fs-0); color: var(--ink-2);
      font-variant-numeric: tabular-nums;
      max-height: 460px; overflow: auto; }
/* An empty <pre> is a dead dark bar on screen — the gate's record panel and the
   follow-up output are both empty until used. */
pre:empty { display: none; }

.hint { color: var(--ink-3); font-size: var(--fs-0); letter-spacing: var(--track-caption); }

/* ── Status tones. The agent code sets .ok / .warn on an element to mean
      "this passed" / "this needs attention"; the token status colours are
      shared across skins and must never be restyled. ── */
.ok, .warn, .advisory, .fieldnote, .error-note {
  border-radius: var(--radius-md); padding: var(--sp-3) var(--sp-4); margin: var(--sp-2) 0;
  font-size: var(--fs-1); }
.ok { color: var(--ok); background: color-mix(in srgb, var(--ok) 12%, transparent);
      border: var(--border-w) solid color-mix(in srgb, var(--ok) 40%, transparent); }
.warn { color: var(--warn); background: color-mix(in srgb, var(--warn) 12%, transparent);
        border: var(--border-w) solid color-mix(in srgb, var(--warn) 40%, transparent); }
p.hint.ok, p.hint.warn { font-size: var(--fs-0); }

/* The M10.4 boundary, on screen: the reading is a visibly separate,
   advisory-only panel — never part of the submission. */
.advisory { background: var(--bg-inset); color: var(--ink-2);
            border: var(--border-w) solid var(--line);
            border-left: 3px solid var(--accent); }

/* Prompt 05 — the parsed fields as labelled rows. */
.fieldrow { display: grid; grid-template-columns: 190px 1fr; gap: var(--sp-3);
            padding: var(--sp-3) 0; border-bottom: var(--border-w) solid var(--line); }
.fieldrow .flabel { font-size: var(--fs-micro-cap); font-weight: var(--w-label);
                    letter-spacing: var(--track-micro-cap);
                    text-transform: uppercase; color: var(--ink-3); }
.fieldrow .fval { white-space: pre-wrap; margin: 0; color: var(--ink); }
.fieldrow.lead .flabel { color: var(--accent); }
.fieldrow.absent .fval { color: var(--danger); }
@media (max-width: 900px) { .fieldrow { grid-template-columns: 1fr; gap: var(--sp-1); } }

.fieldnote { color: var(--ink-2); background: var(--bg-inset);
             border: var(--border-w) solid var(--line); }
.fieldnote.warn { color: var(--warn);
                  border-color: color-mix(in srgb, var(--warn) 40%, transparent);
                  background: color-mix(in srgb, var(--warn) 12%, transparent); }
.fieldnote.ok { color: var(--ok);
                border-color: color-mix(in srgb, var(--ok) 40%, transparent);
                background: color-mix(in srgb, var(--ok) 12%, transparent); }

/* Prompt 06 — the status band. One line a reviewer cannot miss. */
.statusband { padding: var(--sp-3) var(--sp-4); margin: var(--sp-2) 0; border-radius: var(--radius-md);
              border: var(--border-w) solid var(--line); background: var(--bg-inset);
              color: var(--ink-2); font-size: var(--fs-1); }
.statusband:empty { display: none; }
.statusband .statuscode { font-weight: var(--w-label); letter-spacing: var(--track-body); }
.statusband.ok { color: var(--ok); background: color-mix(in srgb, var(--ok) 12%, transparent);
                 border-color: color-mix(in srgb, var(--ok) 40%, transparent); }
.statusband.warn { color: var(--warn); background: color-mix(in srgb, var(--warn) 12%, transparent);
                   border-color: color-mix(in srgb, var(--warn) 40%, transparent); }
.statusband.advisory { color: var(--ink-2); border-left: 3px solid var(--accent); }

/* Prompt 07 — the human gate. */
#gate button { margin-right: var(--sp-2); }
.gatewrap { display: none; margin: var(--sp-3) 0; padding: var(--sp-4);
            background: var(--bg-inset); border: var(--border-w) solid var(--line);
            border-radius: var(--radius); }
.gatewrap.open { display: block; }
.recordpanel { background: var(--bg-inset); border: var(--border-w) solid var(--line);
               border-left: 3px solid var(--accent); border-radius: var(--radius-md);
               padding: var(--sp-4); margin: var(--sp-2) 0; white-space: pre-wrap;
               font-family: var(--font-mono); font-size: var(--fs-0); color: var(--ink-2);
               font-variant-numeric: tabular-nums; }
.recordpanel:empty { display: none; }

/* The run log, in the right rail — the kit's .log component. Rows stack rather
   than tabulate, because 320px cannot hold five columns without clipping the
   decision, which is the column the log exists for. */
#humanRunLog .log { max-height: 60vh; }
#humanRunLog .row { align-items: flex-start; border-bottom: var(--border-w) solid var(--line);
                    padding: var(--sp-2) 0; }
#humanRunLog .row:last-child { border-bottom: 0; }
#humanRunLog .row > div { min-width: 0; }
#humanRunLog .case { color: var(--ink); }
#humanRunLog .decision { color: var(--ink-2); }
#humanRunLog .action { margin-top: 2px; white-space: pre-wrap; font-weight: var(--w-label); }
#humanRunLog .row.pending .action { color: var(--warn); }

/* Prompt 08 — citation tags, as the kit's chips. */
.tags { margin: var(--sp-2) 0 0 0; }
.tags:empty { display: none; }
.tag { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: var(--radius-pill);
       margin: var(--sp-1) var(--sp-1) 0 0; background: var(--chip); color: var(--ink-2);
       border: var(--border-w) solid var(--line);
       font-family: var(--font-mono); font-size: var(--fs-0);
       font-variant-numeric: tabular-nums; }
.tag.bad { color: var(--danger); border-color: var(--danger);
           background: color-mix(in srgb, var(--danger) 12%, transparent); font-weight: var(--w-label); }
.tag.none { color: var(--warn); border-color: var(--warn);
            background: color-mix(in srgb, var(--warn) 12%, transparent); }

/* The per-deal gate, in the main work area. */
.dealrow { border: var(--border-w) solid var(--line); border-left: 3px solid var(--line);
           border-radius: var(--radius-md); padding: var(--sp-5); margin: var(--sp-3) 0;
           background: var(--bg-raise); box-shadow: var(--shadow); }
.dealrow.notreviewed { border-left-color: var(--warn); }
.dealrow.approved { border-left-color: var(--ok); }
.dealrow.edited { border-left-color: var(--info); }
.dealrow.escalated { border-left-color: var(--danger); }
.dealhead { font-size: var(--fs-heading-md); font-weight: var(--w-display);
            letter-spacing: var(--track-heading-md); color: var(--ink); }
.dealcall { color: var(--ink-2); font-size: var(--fs-0); font-family: var(--font-mono);
            font-variant-numeric: tabular-nums; margin: var(--sp-2) 0; }
.dealstatus { font-weight: var(--w-label); font-size: var(--fs-micro-cap);
              letter-spacing: var(--track-micro-cap);
              text-transform: uppercase; margin: var(--sp-2) 0; }
.dealstatus.notreviewed { color: var(--warn); }
.dealstatus.approved { color: var(--ok); }
.dealstatus.edited { color: var(--info); }
.dealstatus.escalated { color: var(--danger); }
.dealnotapplied { color: var(--danger);
                  background: color-mix(in srgb, var(--danger) 10%, transparent);
                  border: var(--border-w) solid var(--danger); border-radius: var(--radius-md);
                  padding: var(--sp-2) var(--sp-3); margin: var(--sp-2) 0;
                  font-size: var(--fs-0); font-weight: var(--w-label); }
.dealcontrols { margin-top: var(--sp-3); display: flex; flex-wrap: wrap; align-items: center;
                gap: var(--sp-2); }
.dealcontrols label { display: inline-flex; align-items: center; gap: var(--sp-1);
                      white-space: nowrap; }
.dealnote { margin: var(--sp-3) 0 0 0; }
.dealnote:empty { display: none; }

/* Prompt 09 — the sweep. */
#sweepSummary { white-space: pre-wrap; font-family: var(--font-mono); }
#sweepSummary:empty, #sweepProgress:empty { display: none; }
#sweepProgress { max-height: 220px; }

/* ── The case list ── */
/* Prompt 14 — the demo chips, in the kit's chip component. */
#evalChips { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
#evalChips .chip { text-align: left; font-family: var(--font-body); white-space: normal; }
#evalChips .chip.active { border-color: var(--accent); color: var(--ink); }
#faultBanner:empty, #topFault:empty, #submissionFault:empty { display: none; }
#sibylCtxOut { max-height: 340px; }
.case-card .meta { display: block; font-size: var(--fs-0); color: var(--ink-3);
                   font-family: var(--font-mono); margin-top: 2px; }
.case-card .badge { margin-top: var(--sp-2); }
.case-card.submission, .case-card.evals { background: var(--chip); }
/* PROMPT 12 — the exception path is flagged on the card, not just badged. An
   escalation is the one outcome that means a human stopped the loop, and it has
   to be findable in a list of eight without reading every badge. */
.case-card.escalated { border-color: var(--danger);
                       box-shadow: inset 3px 0 0 var(--danger); }
.case-card .flag { display: block; margin-top: var(--sp-1); font-size: var(--fs-micro-cap);
                   font-weight: var(--w-label); letter-spacing: var(--track-micro-cap);
                   text-transform: uppercase;
                   color: var(--danger); }

/* Prompt 16 — the evals table. The table, the header and the cells are the
   kit's .evals-table; these rules are layout only — column widths, the two
   long cells scrolling inside themselves, and the verdict picker's states. */
/* table-layout: fixed, or the browser ignores the widths and sizes the columns
   by content — which gave Actual 85px next to a 1,900-character expectation.
   The min-width is on the TABLE, so a narrow window scrolls this box and never
   the page. */
/* PROMPT 21 — readability pass, STATED DEVIATION from the kit (38.4): the
   kit's .log .row .t uses --ink-3, which lands at 2.69:1 contrast on the
   Studio skin — below AA and faint at video compression. Timestamps are
   evidence in this product (every human decision is logged against one), so
   they move one step up the ink ramp. One line, deliberate, documented. */
.log .row .t { color: var(--ink-2); }

/* PROMPT 19 — the Improvement card. Kit tokens only; layout rules here. The
   card is evidence, so it reads as a record: micro-cap section labels, the
   Before block carrying the danger accent and After carrying ok — the same
   two tones the verdict chips already use for fail/pass. */
#evalImprovement { margin-top: var(--sp-5); }
.improve-card { border: var(--border-w) solid var(--line); border-radius: var(--radius-md);
                background: var(--bg-raise); padding: var(--sp-4); }
.improve-card h3 { margin: 0 0 var(--sp-1) 0; font-size: var(--fs-heading-sm); }
.improve-card .improve-case { font-family: var(--font-mono); font-size: var(--fs-0);
                              color: var(--ink-3); margin-bottom: var(--sp-3); }
.improve-card .improve-step { margin-top: var(--sp-3); padding-left: var(--sp-3);
                              border-left: 3px solid var(--line); }
.improve-card .improve-step.before { border-left-color: var(--danger); }
.improve-card .improve-step.after  { border-left-color: var(--ok); }
.improve-card .improve-label { display: block; font-size: var(--fs-micro-cap);
                               font-weight: var(--w-label); letter-spacing: var(--track-micro-cap);
                               text-transform: uppercase; color: var(--ink-3);
                               margin-bottom: var(--sp-1); }
.improve-card p { margin: 0; font-size: var(--fs-0); line-height: var(--lh); }
.improve-card .improve-quote { font-family: var(--font-mono); color: var(--ink-2); }

/* PROMPT 20 — known limitations. Same card shell as the Improvement card so
   the two evidence panels read as one family; the list is plain rows, no
   accent colors — limits are scope decisions, not alarms. */
#evalLimits { margin-top: var(--sp-5); }
.limits-list { margin: var(--sp-3) 0 0 0; padding: 0; list-style: none; }
.limits-list li { font-size: var(--fs-0); line-height: var(--lh);
                  padding: var(--sp-2) 0 var(--sp-2) var(--sp-3);
                  border-left: 3px solid var(--line); }
.limits-list li + li { margin-top: var(--sp-2); }
.limits-list strong { color: var(--ink); }

#evalsTable { overflow-x: auto; }
#evalsTable .evals-table { table-layout: fixed; min-width: 620px; }
.evals-table td:nth-child(1), .evals-table th:nth-child(1) { width: 18%; }
.evals-table td:nth-child(2), .evals-table th:nth-child(2) { width: 30%; }
.evals-table td:nth-child(3), .evals-table th:nth-child(3) { width: 32%; }
.evals-table td:nth-child(4), .evals-table th:nth-child(4) { width: 20%; }
/* Long unbroken tokens in a quoted field must not push the column wider. */
.evals-table td { overflow-wrap: anywhere; }
.evals-table .evalid { font-family: var(--font-mono); font-size: var(--fs-0);
                       color: var(--ink-3); font-variant-numeric: tabular-nums; }
.evals-table .hint { margin: var(--sp-2) 0 0 0; }
/* Long cells scroll in their own box — the page never scrolls sideways and a
   1,900-character expectation must not set the height of the whole row. */
.evalcell { max-height: 260px; overflow: auto; white-space: pre-wrap;
            font-size: var(--fs-0); line-height: 1.5; }
.evalcell.actual { font-family: var(--font-mono); }
.evalsrc { font-family: var(--font-mono); font-size: var(--fs-0); color: var(--ink-3);
           margin-bottom: var(--sp-2); }
.evalbtns { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-3); }
.verdict-pick { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
/* The note row is attached to the case above it: the case row drops its rule,
   the note row carries it, and the two read as one unit. */
.evals-table tr:not(.evalnoterow) td { border-bottom: 0; }
.evals-table tr.evalnoterow td { padding-top: 0; }
.evalnotewrap { display: flex; align-items: center; gap: var(--sp-3); }
.evalnotelabel { flex: none; font-size: var(--fs-micro-cap); font-weight: var(--w-label);
                 letter-spacing: var(--track-micro-cap); text-transform: uppercase;
                 color: var(--ink-3); }
.evalnote { flex: 1; min-width: 0; }
.evalnotestate { flex: none; font-size: var(--fs-0); color: var(--ink-3);
                 letter-spacing: var(--track-caption); }
.evalnotestate:empty { display: none; }
.evalnotestate.warn { color: var(--warn); }
/* Prompt 18 — the scoreboard. .scoreboard / .stat are the kit's; these are
   layout only. The last-run tile holds a date, which at the stat tier's 26px
   would wrap, so it drops one step to heading-sm. */
#evalsScoreboard { margin-bottom: var(--sp-4); }
#evalsScoreboard .hint { margin: var(--sp-2) 0 0 0; }
/* Layout override, scoped to this strip: the kit's .scoreboard is a flex row,
   and five tiles in the middle column means one wraps — as flex it then
   stretched to the full width and read as a sixth, larger stat. As a grid the
   wrapped tile keeps its siblings' width. The .stat treatment is the kit's,
   untouched; only the track changes. */
#evalsScoreboard .scoreboard {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}
#evalsScoreboard .stat { padding: var(--sp-4) var(--sp-3); }
.stat .n.small { font-size: var(--fs-heading-sm); letter-spacing: var(--track-heading-sm); }
.evalnote:disabled { opacity: .45; cursor: not-allowed; }
.verdict-pick .chip:disabled { opacity: .45; cursor: not-allowed; }
/* The chosen verdict carries the kit's status colour, meaning what it means
   everywhere else in the app: green ok, amber warn, red danger. */
.verdict-pick .chip.active { color: var(--ink); border-color: var(--accent); }
.verdict-pick .chip.active.ok { color: var(--ok); border-color: var(--ok);
  background: color-mix(in srgb, var(--ok) 14%, transparent); }
.verdict-pick .chip.active.warn { color: var(--warn); border-color: var(--warn);
  background: color-mix(in srgb, var(--warn) 14%, transparent); }
.verdict-pick .chip.active.danger { color: var(--danger); border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 14%, transparent); }


/* Prompt 15 — the empty / thinking / error states. */
#workState:empty { display: none; }
/* The first thing anyone sees on load — the one warm surface in the app,
   the brand's cream interlude, so an empty console reads as an invitation
   rather than a missing panel. */
#workState .empty { border: var(--border-w) solid var(--line); border-radius: var(--radius);
                    background: var(--cream, var(--bg-inset));
                    margin-bottom: var(--sp-5); }
#workState .empty .lede { max-width: 52ch; margin: 0 auto var(--sp-4); font-size: var(--fs-2); }
#workState .thinking { margin: var(--sp-3) 0; font-size: var(--fs-2); }
#workState .error-note { margin-bottom: var(--sp-4); }
#workState .error-note .what { display: block; font-weight: var(--w-label); margin-bottom: var(--sp-1); }
#workState .error-note .fix { display: block; color: var(--ink-2); margin-top: var(--sp-2);
                              font-size: var(--fs-0); }

.stack > * + * { margin-top: var(--sp-3); }
.worldcheck { padding: 0 var(--sp-5) var(--sp-7); }
.worldcheck > details > summary { font-size: var(--fs-1); }
/* The world-check tables are the raw 56-column deal snapshots. They must scroll
   inside their own box — the page itself never scrolls sideways. */
.worldcheck details > div, .worldcheck details > table, #app details { overflow-x: auto; }
#app table { min-width: max-content; }
body { overflow-x: hidden; }
</style>
</head>
<body>

<div class="topbar">
  <span class="product">Sibyl</span>
  <span class="badge neutral" id="topStatus">Idle</span>
  <span class="badge danger" id="topFault"></span>
  <span class="badge neutral" id="dataSourceBadge">Embedded</span>
  <span class="meta" id="topMeta">the number you can defend</span>
</div>
<div class="statusband warn" id="dataSourceBanner" style="display:none"></div>

<div class="console">

  <!-- ══ LEFT — the cases ══════════════════════════════════════════ -->
  <div class="panel">
    <div class="panel-head">Cases</div>
    <div class="panel-body">
      <div class="stack">
        <div>
          <button type="button" id="runWeekly" class="btn primary">Run the weekly forecast</button>
          <button type="button" id="runAll" class="btn">Run all deals</button>
        </div>
        <p class="hint">Run all deals sweeps every open deal through the reviewer. Run the weekly
           forecast does the same sweep, then Sibyl drafts on top.</p>
        <pre id="sweepProgress"></pre>
        <p id="sweepSummary"></p>
        <div>
          <div class="panel-head" style="padding: 0 0 var(--sp-2) 0; border: 0;">Demo cases</div>
          <div id="evalChips"></div>
          <p id="evalChipNote" class="hint">Five seeded cases. One click loads each one ready to run.</p>
          <p id="faultBanner"></p>
        </div>
        <p id="dealGateSummary" class="hint">No run yet.</p>
        <div id="caseList"></div>
      </div>
    </div>
  </div>

  <!-- ══ MAIN — the selected case ══════════════════════════════════ -->
  <div class="panel">
    <div class="panel-head" id="mainHead">No case selected</div>
    <div class="panel-body">

      <!-- The weekly submission. PROMPT 11 — the same five stages, in the same
           flow order, for the run that produces the draft. Sibyl has two nested
           loops (one deal, and the week that adds them up); a stranger should be
           able to follow either without narration, so both are labelled. -->
      <div id="viewSubmission">

        <!-- PROMPT 15 — the state a viewer might actually land on. One element,
             three modes: the first-load empty state, the thinking state while
             the agent runs, and the error state when it fails. Deliberately
             ABOVE stage 1 and outside the collapsed panels: the no-key message
             and the run-failed message both used to render inside <details>
             elements that are closed by default, which is a dead screen. -->
        <div id="workState"></div>

        <div class="stage" data-n="1">Input · the run</div>
        <p id="runInput" class="hint">Not run yet. The trigger is Friday's snapshot — every open deal
           on the book, each read on its own evidence by the deal reviewer first.</p>

        <div class="stage" data-n="2">Context · what Sibyl reads</div>
        <p class="hint">The eight deal readings, the fixed components the calculator settled
           (01 Closed Won, 05 Create &amp; Close), the top-down metrics, the forecast history and rep
           accuracy for this week of quarter, the decisions log — and both policy files.
           <strong>Not</strong> the raw deal records: Sibyl is the manager here, not the deal reader.</p>
        <p id="submissionFault"></p>
        <p><button type="button" id="showSibylCtx" class="btn">Show the exact payload Sibyl gets sent</button></p>
        <details id="sibylCtxWrap"><summary id="sibylCtxSummary">The exact payload Sibyl gets sent</summary>
        <pre id="sibylCtxOut"></pre>
        </details>

        <div class="stage" data-n="3">Decision · the calls, and the walk-up they produce</div>
        <p class="hint">Sibyl states its calls through the <code>compute_walk_up</code> tool mid-turn.
           The calculator — not the model — produces every figure (M2.5a).</p>
        <div id="runStatus" class="statusband"></div>
        <details id="runRawWrap"><summary>The walk-up, the failed checks, and Sibyl's raw reply</summary>
        <pre id="runResult">Not run yet.</pre>
        </details>
        <details><summary>Stage trace — the reviewer fan-out, the tool call, the round trips</summary>
        <pre id="runLog">Not run yet.</pre>
        </details>

        <div class="stage" data-n="4">Output · the labelled fields</div>
        <div id="runFields"></div>
        <h3>Sibyl's reading — advisory · Maya's eyes only · never submitted (M10.4)</h3>
        <pre id="runReading" class="advisory">Not run yet.</pre>
        <div id="runReadingTags" class="tags"></div>

        <div class="stage" data-n="5">Review · approve, edit, escalate</div>
        <div id="gate">
          <div id="gateStatus" class="statusband"></div>
          <p><button type="button" id="gateApprove" class="btn primary" disabled>Approve</button>
             <button type="button" id="gateEdit" class="btn" disabled>Edit</button>
             <button type="button" id="gateEscalate" class="btn danger" disabled>Escalate</button></p>
          <p class="hint" id="gateHint">The three buttons wake up as soon as an agent output exists.</p>

          <div id="gateEditWrap" class="gatewrap">
            <p><strong>Edit the draft.</strong> This is Sibyl's submission text. Change what you need,
               then Save — your version becomes the version of record and the change is written into
               the run log.</p>
            <p><textarea id="gateEditText" rows="14"></textarea></p>
            <p><button type="button" id="gateEditSave" class="btn primary">Save edit</button>
               <button type="button" id="gateEditCancel" class="btn">Cancel</button></p>
          </div>

          <div id="gateEscalateWrap" class="gatewrap">
            <p><strong>Escalate.</strong> One line: why this run does not get a decision from you.
               The reason is the record.</p>
            <!-- Deliberately generic. A placeholder never reaches the API, but a hint at the
                 expected answer sitting in the shipped file is the habit section 23.5 closed. -->
            <p><input type="text" id="gateEscalateReason" size="70" placeholder="One line: why this run needs another pair of eyes before it goes anywhere."></p>
            <p><button type="button" id="gateEscalateSave" class="btn danger">Record escalation</button>
               <button type="button" id="gateEscalateCancel" class="btn">Cancel</button></p>
          </div>

          <p id="gateNote"></p>
          <pre id="gateFinal"></pre>
        </div>

        <h3>Maya replies — back to Sibyl</h3>
        <p class="hint">Push back, ask for a change, or test the boundary. Sibyl answers on the same
           conversation. <strong>Sibyl cannot submit to the VP</strong> — asking it to is refused
           under M8.1. A reply is itself a human action: it is logged, and the gate re-opens on
           Sibyl's answer.</p>
        <p><textarea id="followUpText" rows="2" placeholder="Maya's reply to the draft — approve it, change a call, or ask Sibyl to do something." disabled></textarea></p>
        <p><button type="button" id="sendFollowUp" class="btn" disabled>Send to Sibyl</button></p>
        <pre id="followUpResult"></pre>
        <p class="boundary-note">Nothing is sent without human approval.</p>
      </div>

      <!-- PROMPT 16 — the evals view. My five cases, the behaviour I said each
           one would produce, what the agent actually did, and my verdict.
           The table is built by renderEvals(); this is the shell. -->
      <div id="viewEvals">
        <!-- PROMPT 18 — the scoreboard. Evidence, so it leads the view rather
             than sitting under a long table, and it never leaves the Evals
             view. Built from the same counts the table and the rail read. -->
        <div id="evalsScoreboard"></div>

        <p class="hint">Five cases from my PRD. <strong>Expected</strong> is my own row, word for
           word. <strong>Actual</strong> is what the agent did on a real run, quoted — never a
           summary of Expected. <strong>Verdict</strong> is mine: the agent does not grade itself.</p>
        <p class="hint">EC-1, EC-3 and EC-4 are three questions about <em>one</em> weekly forecast, so
           Run scores the current run when there is one and says which run it used. Fresh run forces
           a new one. EC-2 always runs with its source withheld; EC-5 answers a draft, so run EC-1
           first.</p>
        <p id="evalsSummary" class="hint">Nothing run yet.</p>
        <div id="evalsTable"></div>
        <!-- PROMPT 19 — the improvement, on the record. One failed case, the
             smallest change that addressed the cause, and the re-run. Built by
             renderImprovementCard(); this is the shell. -->
        <div id="evalImprovement"></div>
        <!-- PROMPT 20 — known limitations. Scope decisions, stated plainly;
             they feed the Deploy pilot plan. Built by renderLimitsPanel(). -->
        <div id="evalLimits"></div>
        <p class="boundary-note">Nothing is sent without human approval.</p>
      </div>

      <!-- One deal case. -->
      <div id="viewDeal">
        <p id="dealGateNotice"></p>
        <div id="dealGate"></div>
        <div id="dealRepNotes"></div>
      </div>

    </div>
  </div>

  <!-- ══ RIGHT — the run log ═══════════════════════════════════════ -->
  <div class="panel">
    <div class="panel-head">Run log</div>
    <div class="panel-body">
      <p id="runLogSummary" class="hint">0 runs this session.</p>
      <div id="humanRunLog"></div>
      <p class="boundary-note">Nothing is sent without human approval.</p>
    </div>
  </div>

</div>

<div class="worldcheck">
  <details>
    <summary>Settings — your Anthropic API key</summary>
    <div id="settings">
      <p class="hint">Stored in this browser only (localStorage). It is never written into this file.</p>
      <p><label for="apikey">Anthropic API key</label>
         <input type="password" id="apikey" autocomplete="off" size="44" placeholder="sk-ant-...">
         <button type="button" id="saveKey">Save key</button>
         <button type="button" id="clearKey">Clear key</button></p>
      <p id="keyState">checking…</p>
    </div>
  </details>
  <details>
    <summary>SIBYL_PROMPT — the manager's instructions (sibyl_prompt.md)</summary>
    <pre id="sibylPromptView"></pre>
  </details>
  <details>
    <summary>REVIEWER_PROMPT — the deal-reviewer sub-worker's instructions (deal_reviewer_prompt.md + M1 injected from forecast_methodology.md)</summary>
    <pre id="reviewerPromptView"></pre>
  </details>
  <details>
    <summary>World check — every record and policy loaded into this file</summary>
    <!-- The "show the payload" button lives in stage 2 of the submission now, where
         the context is described. A second copy here left TWO elements sharing the
         id showSibylCtx, so getElementById bound the handler to whichever came
         first and the other was dead markup. -->
    <div id="app">Loading…</div>
  </details>
</div>

<script>
/* ------------------------------------------------------------------ */
/* THE WORLD — every data and policy file, embedded verbatim.          */
/* eval_cases.csv is deliberately absent: held-out answer key.         */
/* ------------------------------------------------------------------ */

const DATA_FILES = {
__DATA__
};

let POLICY_FILES = {
__POLICIES__
};

const HELD_OUT_FILES = ["eval_cases.csv"];

/* ------------------------------------------------------------------ */
/* PROMPT 16 — the Expected Behavior column of eval_cases.csv, verbatim.*/
/*                                                                     */
/* THE ONLY PART OF THE HELD-OUT FILE THAT SHIPS. It is here so the     */
/* evals table can show what each case was PROMISED to do, word for     */
/* word — a table that grades against a paraphrase grades the           */
/* paraphrase. Scenario, Fails If, Deal IDs, Result and Verdict are     */
/* still held out, and eval_cases.csv is still absent from DATA_FILES.  */
/*                                                                     */
/* IT MUST NEVER REACH A PAYLOAD. Nothing in buildDealPayload,          */
/* buildReviewerMessage or buildSibylMessage may read this object. That */
/* is not a convention: check 25 builds every real payload and asserts  */
/* none of this text appears in any of them.                           */
/* ------------------------------------------------------------------ */

const EVAL_EXPECTED = {
__EVAL_EXPECTED__
};

/* ------------------------------------------------------------------ */
/* THE AGENT — model and endpoint. Change the model here.              */
/* ------------------------------------------------------------------ */

/* explainError names the model that failed.

   Stage 1 history, because it decides whether a downgrade is safe:
   - until 2026-08-02 it ran claude-sonnet-4-5 with NO reasoning pass, so a wrong
     verdict arrived with no account of how it was reached — nothing to debug;
   - moved to claude-opus-4-8 WITH extended thinking deliberately, to buy
     visibility into the reviewer's reasoning while the prompt was diagnosed.
     That was instrumentation, not a bet that the job needed a bigger model;
   - 2026-08-04: the traces did their job. Every failure was read off a trace and
     fixed in the prompt (M1 injected, judge-ability gate, M1.1-height Commit
     bar, Next Step verbatim), and all five evals went green.
   With the prompt right, the instrument comes off: Stage 1 runs Sonnet 5 for
   cost. `thinking` STAYS — the traces are how this build gets debugged, and
   they cost little. Re-run the evals after any change here: Stage 1 is judgment,
   and this is the cheap half of the run only if the verdicts hold. Revert to
   'claude-opus-4-8' if they regress, or to regain headroom while debugging. */
/* 2026-08-04: Stage 1 was tried on `claude-haiku-4-5` for cost and reverted the
   same day — it failed EC-1's precision control, challenging DL-0033 Vidora
   instead of agreeing. That deal is seeded to punish exactly this: eight
   MEDDPICC fields False, Red risk, amount revised down — a mechanical scrub
   challenges it, and only reading the narrative holds the Commit. Stage 1 is
   judgment, and that is what the cheaper model gave up. See section 22. */
/* BASELINE PAIR — the configuration that went 5/5 in section 19 was
   sonnet-5 / opus-4-8. Both thinking blocks and both token budgets are still at
   their section-19 values. Do not change one stage's model without re-running
   all five evals: the day proved the precision control (DL-0033) is what breaks
   first, and it is Stage 1's verdict but Stage 2 can override it.

   2026-08-04, on the user's instruction: STAGE 2 MOVED TO SONNET 5, pending a
   live validation run. Sonnet 5 is 4.6-and-later, so the Stage 2 request shape
   is unchanged and legal as it stands — `thinking: {adaptive, summarized}` and
   `output_config.effort` are both supported, and `budget_tokens` still 400s.
   This is not an untried configuration: Stage 2 ran Sonnet 5 through section
   21's cost experiment and again, unintentionally, during the section 24
   DL-0033 diagnosis. What was reverted in section 22 was the HAIKU reviewer on
   Stage 1, which failed the precision control — not this half of the pair.
   Revert to 'claude-opus-4-8' if the evals regress. */
const MODEL_REVIEWER = 'claude-sonnet-5';     /* stage 1 — one deal reviewer per open deal */
const MODEL_SIBYL = 'claude-sonnet-5';        /* stage 2 — the judgment-heavy Sibyl turn */
const API_URL = 'https://api.anthropic.com/v1/messages';

/* Both stages think, but THE TWO MODELS TAKE DIFFERENT THINKING SHAPES — this is
   the trap when changing MODEL_REVIEWER, and the shape must move with the model:

     Haiku 4.5 (pre-4.6)  -> { type: 'enabled', budget_tokens: N }
                             `adaptive` is NOT supported and 400s.
                             budget_tokens must be < max_tokens, minimum 1024.
                             There is no `display` field — the reply carries the
                             thinking text itself, not a summary.
                             `output_config.effort` ALSO 400s on this model, which
                             is why the reviewer call has never sent one. Do not
                             add effort to callAgent without checking the model.
     Sonnet 5 / Opus 4.8  -> { type: 'adaptive', display: 'summarized' }
                             budget_tokens 400s; adaptive sizes itself, and
                             `display` defaults to "omitted" so summarized is set
                             explicitly to keep the traces in the run log.

   THE TWO CONSTANTS MUST MOVE TOGETHER. Changing MODEL_REVIEWER across the 4.6
   boundary without changing THINKING_REVIEWER 400s every Stage 1 call. Check 10d
   derives the expected shape from the model id and fails if they disagree, so
   the suite catches a half-done swap rather than the next live run.

   The traces are the whole reason thinking is on here (sections 17–19: every
   prompt fix was read off one). Set THINKING_REVIEWER to null for a no-thinking
   reviewer — but that is the configuration that produced three wrong verdicts on
   2026-08-02, so do not pair it with a model downgrade. */
const THINKING_REVIEWER = { type: 'adaptive', display: 'summarized' };

/* Thinking and the response text share one budget on both models, so these cover
   the reasoning pass AND the labeled fields together. Raised 2026-08-02 so a
   whole run completes in one pass with nothing truncated — the point is
   debugging the prompts and the reasoning, and a truncated reply teaches
   nothing about either.

   The model's ceiling is 128,000 output tokens, but these calls are plain
   non-streaming POSTs from the browser: a request that generates for many
   minutes risks the connection dropping rather than the reply truncating, and
   the failure is harder to read than a max_tokens stop. ~16K is the documented
   comfortable non-streaming budget; 32K for Sibyl is deliberate headroom for
   thinking at effort "high" plus eleven fields, and is the practical ceiling
   here. Going past it means switching these calls to streaming first. */
const MAX_TOKENS_REVIEWER = 16000;
const MAX_TOKENS_SIBYL = 32000;

/* ------------------------------------------------------------------ */
/* THE AGENT'S INSTRUCTIONS                                            */
/* Compiled from the Design PRD. The RULES block is quoted word for    */
/* word from Discovery row 9 and Design row 1.                         */
/* ------------------------------------------------------------------ */

let SIBYL_PROMPT = `__SIBYL_PROMPT__`;

let REVIEWER_PROMPT = `__REVIEWER_PROMPT__`;

/* ------------------------------------------------------------------ */
/* CSV parsing — quoted fields, embedded commas and newlines.          */
/* ------------------------------------------------------------------ */

function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [], field = '', i = 0, inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\\r') { i++; continue; }
    if (c === '\\n') { row.push(field); field = ''; rows.push(row); row = []; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function toObjects(text) {
  const rows = parseCSV(text).filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0];
  const out = rows.slice(1).map(r => {
    const o = {};
    headers.forEach((h, idx) => { o[h] = r[idx] === undefined ? '' : r[idx]; });
    return o;
  });
  return { headers: headers, rows: out };
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function money(n) {
  if (n === '' || n === null || n === undefined || isNaN(n)) return '—';
  return '$' + Math.round(Number(n)).toLocaleString('en-US');
}
function num(v) {
  if (v === undefined || v === null) return 0;
  const cleaned = String(v).replace(/[$,%\\s,]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}
function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function isClosed(stage) { return String(stage).indexOf('Closed') === 0; }

/* Split deal_signals.md into briefs keyed by the "## <Deal Name>" heading. */
function parseSignals(md) {
  const briefs = {};
  if (!md) return briefs;
  const lines = md.split('\\n');
  let key = null, buf = [];
  for (const line of lines) {
    const m = line.match(/^##\\s+(.+?)\\s*$/);
    if (m && !line.startsWith('###')) {
      if (key) briefs[key] = buf.join('\\n').trim();
      key = m[1]; buf = [];
    } else if (key) {
      buf.push(line);
    }
  }
  if (key) briefs[key] = buf.join('\\n').trim();
  return briefs;
}
/* Policy section headings, so we can show each file is real and sectioned. */
function headings(md) {
  return md.split('\\n').filter(l => /^#{1,3}\\s/.test(l)).map(l => l.replace(/^#+\\s*/, ''));
}

/* ------------------------------------------------------------------ */
/* The data store — ONE seam between the sources and every reader.     */
/* buildDataStore parses a {data, policies, prompts} payload; today    */
/* that payload is the embedded constants, and an api mode can hand    */
/* in a fetched copy of the exact same shape. applyDataStore swaps it  */
/* in BEFORE init runs, so the 30+ DB[...] read sites never know.      */
/* ------------------------------------------------------------------ */

const EMBEDDED_SOURCES = {
  data: DATA_FILES,
  policies: POLICY_FILES,
  prompts: { sibyl: SIBYL_PROMPT, reviewer: REVIEWER_PROMPT }
};

function buildDataStore(sources) {
  const db = {}, rawMd = {};
  const data = (sources && sources.data) || {};
  for (const name in data) {
    if (name.endsWith('.csv')) db[name] = toObjects(data[name]);
    else rawMd[name] = data[name];
  }
  return {
    DB: db,
    RAW_MD: rawMd,
    SIGNALS: parseSignals(rawMd['deal_signals.md'] || ''),
    POLICIES: (sources && sources.policies) || {},
    SIBYL_PROMPT: (sources && sources.prompts && sources.prompts.sibyl) || '',
    REVIEWER_PROMPT: (sources && sources.prompts && sources.prompts.reviewer) || ''
  };
}

let DB = {};
let RAW_MD = {};
let SIGNALS = {};

function applyDataStore(store) {
  DB = store.DB;
  RAW_MD = store.RAW_MD;
  SIGNALS = store.SIGNALS;
  POLICY_FILES = store.POLICIES;
  SIBYL_PROMPT = store.SIBYL_PROMPT;
  REVIEWER_PROMPT = store.REVIEWER_PROMPT;
  /* The citation vocabulary is derived from the store; a swapped store
     invalidates the memo (defined later in the agent block, hence the guard). */
  if (typeof CITE_VOCAB_MEMO !== 'undefined') CITE_VOCAB_MEMO = null;
}

applyDataStore(buildDataStore(EMBEDDED_SOURCES));

/* ------------------------------------------------------------------ */
/* Data mode. Embedded (the constants above) is the default everywhere */
/* — file://, the harness, and any origin without an API configured.   */
/* Api mode is opt-in (?source=api or the localStorage flag) and       */
/* fetches a payload of the exact same shape from Supabase (P2.4).     */
/* ------------------------------------------------------------------ */

const DATA_MODE_KEY = 'sibyl_data_mode';
const DATA_API = {
  url: '',      /* Supabase project URL — set in P2.4 */
  anonKey: ''   /* anon key, public by design — set in P2.4 */
};

function resolveDataMode() {
  try {
    if (typeof location === 'undefined') return 'embedded';
    const q = new URLSearchParams(location.search || '');
    if (q.get('source') === 'api') return 'api';
    if (q.get('source') === 'embedded') return 'embedded';
    if (typeof localStorage !== 'undefined' &&
        localStorage.getItem(DATA_MODE_KEY) === 'api') return 'api';
  } catch (e) { /* any surprise means the safe default */ }
  return 'embedded';
}

__AGENT_BLOCK__

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

function render() {
  const current = DB['deals_current.csv'];
  const lastWeek = DB['deals_last_week.csv'];
  const lastByID = {};
  lastWeek.rows.forEach(d => { lastByID[d['Deal ID']] = d; });

  const open = current.rows.filter(d => !isClosed(d['Stage']));
  const won = current.rows.filter(d => d['Stage'] === 'Closed Won');
  const lost = current.rows.filter(d => d['Stage'] === 'Closed Lost');

  const openTotal = open.reduce((s, d) => s + num(d['Exit ARR Impact Amount']), 0);
  const wonTotal = won.reduce((s, d) => s + num(d['Exit ARR Impact Amount']), 0);

  const stageRates = {};
  (DB['stage_conversion_rates.csv'] || { rows: [] }).rows.forEach(r => {
    stageRates[r['Stage']] = r;
  });

  const decisionsByDeal = {};
  (DB['decisions_log.csv'] || { rows: [] }).rows.forEach(r => {
    const id = r['Deal ID'];
    if (!id) return;
    (decisionsByDeal[id] = decisionsByDeal[id] || []).push(r);
  });

  const accuracyByRep = {};
  (DB['rep_accuracy_history.csv'] || { rows: [] }).rows.forEach(r => {
    (accuracyByRep[r['Name']] = accuracyByRep[r['Name']] || []).push(r);
  });

  const H = [];

  /* --- The run ------------------------------------------------------ */
  const snapshot = current.rows.length ? current.rows[0]['Snapshot Date'] : '?';
  const week = current.rows.length ? current.rows[0]['Forecast Week #'] : '?';
  const td = (DB['topdown_metrics.csv'] || { rows: [] }).rows[0] || {};

  H.push('<h2>1 · The run</h2>');
  H.push('<table>');
  H.push(row2('Snapshot date', esc(snapshot)));
  H.push(row2('Forecast week', esc(week)));
  H.push(row2('Prior snapshot', esc(lastWeek.rows.length ? lastWeek.rows[0]['Snapshot Date'] : '?')));
  H.push(row2('Quota (top-down)', esc(td['Quota'] || '—')));
  H.push(row2('Closed Won QTD <em>(summed from the snapshot)</em>', money(wonTotal)));
  H.push(row2('Closed Won QTD <em>(top-down file)</em>', esc(td['Gross New ARR Attainment'] || '—')));
  H.push(row2('Open pipeline <em>(summed from the snapshot)</em>', money(openTotal)));
  H.push(row2('Deals in snapshot', current.rows.length + ' (' + open.length + ' open, ' + won.length + ' won, ' + lost.length + ' lost)'));
  H.push('</table>');

  const reconciles = Math.abs(wonTotal - num(td['Gross New ARR Attainment'])) < 1;
  H.push('<p class="' + (reconciles ? 'ok' : 'warn') + '">Closed Won reconciliation: snapshot ' +
    money(wonTotal) + ' vs top-down ' + esc(td['Gross New ARR Attainment'] || '—') + ' — ' +
    (reconciles ? 'MATCH' : 'MISMATCH') + '</p>');

  /* --- Files loaded -------------------------------------------------- */
  H.push('<h2>2 · Data files loaded</h2><table><tr><th>File</th><th>Kind</th><th>Rows</th><th>Columns</th></tr>');
  Object.keys(DATA_FILES).sort().forEach(name => {
    if (name.endsWith('.csv')) {
      const t = DB[name];
      H.push('<tr><td>' + esc(name) + '</td><td>csv</td><td>' + t.rows.length + '</td><td>' + t.headers.length + '</td></tr>');
    } else {
      const md = DATA_FILES[name];
      H.push('<tr><td>' + esc(name) + '</td><td>markdown</td><td>' + Object.keys(SIGNALS).length +
        ' briefs</td><td>' + md.length.toLocaleString() + ' chars</td></tr>');
    }
  });
  HELD_OUT_FILES.forEach(name => {
    H.push('<tr class="warn"><td>' + esc(name) + '</td><td colspan="3">HELD OUT — deliberately not embedded. It is the answer key; it must never reach the agent.</td></tr>');
  });
  H.push('</table>');

  /* --- Policies ------------------------------------------------------ */
  H.push('<h2>3 · Policy files loaded</h2><table><tr><th>File</th><th>Size</th><th>Sections</th></tr>');
  Object.keys(POLICY_FILES).sort().forEach(name => {
    const md = POLICY_FILES[name];
    H.push('<tr><td>' + esc(name) + '</td><td>' + md.length.toLocaleString() + ' chars</td><td>' +
      headings(md).length + '</td></tr>');
  });
  H.push('</table>');
  Object.keys(POLICY_FILES).sort().forEach(name => {
    H.push('<details><summary>' + esc(name) + ' — section headings</summary><pre>' +
      esc(headings(POLICY_FILES[name]).join('\\n')) + '</pre></details>');
  });

  /* --- Open deals + linked context ----------------------------------- */
  H.push('<h2>4 · Open deals — ' + open.length + ' cases, each with its linked context</h2>');
  H.push('<p>Total ' + money(openTotal) + '. Expand a deal to see every record that joins to it — ' +
    'the <strong>Run</strong> button is at the bottom of each panel.</p>');
  H.push('<p><button type="button" id="expandAll">Open all 8 deals</button> ' +
    '<button type="button" id="collapseAll">Close all</button></p>');

  open.sort((a, b) => num(b['Exit ARR Impact Amount']) - num(a['Exit ARR Impact Amount']));
  open.forEach(d => {
    const id = d['Deal ID'];
    const name = d['Deal Name'];
    const prev = lastByID[id];
    const brief = SIGNALS[name];
    const share = openTotal ? (num(d['Exit ARR Impact Amount']) / openTotal * 100) : 0;

    H.push('<details><summary><strong>' + esc(id) + '</strong> — ' + esc(name) + ' · ' +
      money(num(d['Exit ARR Impact Amount'])) + ' · ' + esc(d['Owner']) + ' · rep says ' +
      esc(d['Forecast']) + (brief ? '' : ' · <span class="warn">NO BRIEF</span>') + '</summary>');

    H.push('<table><tr><th>Field</th><th>This week</th><th>Last week</th></tr>');
    ['Snapshot Date', 'Stage', 'Forecast', 'Exit ARR Impact Amount', 'Close Date', 'Days in Stage',
     '# Pushed', 'Next Step', 'Next Call', 'Economic Buyer', 'Economic Buyer: Validated',
     'Champion', 'Champion: Validated', 'Compelling Event', 'Compelling Event: Validated',
     'Identified Pain: Validated', 'Metrics: Validated', 'Aggregate Risk Score',
     'Contacts Engaged (AE, 30d)', 'Main Competitors'].forEach(f => {
      const a = d[f] === undefined ? '' : d[f];
      const b = prev ? (prev[f] === undefined ? '' : prev[f]) : '';
      const changed = String(a) !== String(b);
      H.push('<tr' + (changed ? ' class="warn"' : '') + '><td>' + esc(f) + '</td><td>' +
        esc(a) + '</td><td>' + esc(b) + '</td></tr>');
    });
    H.push('</table>');
    H.push('<p>Share of open pipeline: <strong>' + share.toFixed(1) + '%</strong>' +
      (share >= 15 ? ' — key swing deal threshold (≥15%) met' : '') + '</p>');

    if (!prev) H.push('<p class="warn">No matching row in deals_last_week.csv — new this week.</p>');

    const sr = stageRates[d['Stage']];
    H.push('<p>Stage conversion rate for <em>' + esc(d['Stage']) + '</em>: ' +
      (sr ? esc(sr['Historical Conversion Rate']) + ' (' + esc(sr['Stage Label']) + ')'
          : '<span class="warn">no rate row for this stage</span>') + '</p>');

    H.push('<p>L1 note (the rep\\'s own words):</p><pre>' + esc(d['L1 Notes'] || '(none)') + '</pre>');

    if (brief) {
      H.push('<details><summary>deal_signals.md brief — ' + esc(name) + '</summary><pre>' +
        esc(brief) + '</pre></details>');
    } else {
      H.push('<p class="warn">No entry in deal_signals.md for this deal.</p>');
    }

    const dec = decisionsByDeal[id];
    if (dec) {
      H.push('<p>decisions_log.csv entries: ' + dec.length + '</p><pre>' +
        esc(dec.map(r => r['Week Ending'] + ' · ' + r['Record Type'] + ' · rep said ' +
          r['Rep Category'] + ' · draft said ' + r['Draft Category'] + ' · Maya ' +
          r['Maya Action'] + ' · outcome ' + (r['Outcome'] || 'open')).join('\\n')) + '</pre>');
    }

    const acc = accuracyByRep[d['Owner']];
    if (acc && acc.length) {
      const wk = acc.filter(r => String(r['Week #']) === String(week))[0] || acc[acc.length - 1];
      H.push('<p>' + esc(d['Owner']) + ' forecast accuracy, week ' + esc(wk['Week #']) + ': ' +
        ['Q2 FY2026', 'Q3 FY2026', 'Q4 FY2026', 'Q1 FY2027']
          .map(q => q + ' ' + (wk[q] || '—')).join(' · ') + '</p>');
    }

    H.push('<hr><p><button type="button" class="runBtn" data-deal="' + esc(id) + '">Run the reviewer on ' +
      esc(id) + '</button> <button type="button" class="ctxBtn" data-deal="' + esc(id) +
      '">Show exactly what gets sent</button></p>');
    H.push('<pre id="out-' + esc(id) + '">Not run yet.</pre>');

    H.push('</details>');
  });

  /* --- Briefs with no open deal (join check, other direction) --------- */
  const openNames = {};
  open.forEach(d => { openNames[d['Deal Name']] = true; });
  const orphanBriefs = Object.keys(SIGNALS).filter(k => !openNames[k]);
  if (orphanBriefs.length) {
    H.push('<h3>Briefs that do not join to an open deal</h3><ul>');
    orphanBriefs.forEach(k => H.push('<li>' + esc(k) + '</li>'));
    H.push('</ul>');
  }

  /* --- Closed deals -------------------------------------------------- */
  H.push('<h2>5 · Closed deals — the reconciliation base</h2>');
  H.push('<details><summary>Closed Won — ' + won.length + ' deals, ' + money(wonTotal) + '</summary><table>' +
    '<tr><th>Deal ID</th><th>Name</th><th>Owner</th><th>Amount</th><th>Close Date</th></tr>' +
    won.map(d => '<tr><td>' + esc(d['Deal ID']) + '</td><td>' + esc(d['Deal Name']) + '</td><td>' +
      esc(d['Owner']) + '</td><td>' + money(num(d['Exit ARR Impact Amount'])) + '</td><td>' +
      esc(d['Close Date']) + '</td></tr>').join('') + '</table></details>');
  H.push('<details><summary>Closed Lost — ' + lost.length + ' deals</summary><table>' +
    '<tr><th>Deal ID</th><th>Name</th><th>Owner</th><th>Amount</th></tr>' +
    lost.map(d => '<tr><td>' + esc(d['Deal ID']) + '</td><td>' + esc(d['Deal Name']) + '</td><td>' +
      esc(d['Owner']) + '</td><td>' + money(num(d['Exit ARR Impact Amount'])) + '</td></tr>').join('') +
    '</table></details>');

  /* --- The remaining context tables ----------------------------------- */
  H.push('<h2>6 · The rest of the world</h2>');
  ['topdown_metrics.csv', 'create_and_close_history.csv', 'stage_conversion_rates.csv',
   'decisions_log.csv', 'rep_accuracy_history.csv', 'forecast_history.csv'].forEach(name => {
    const t = DB[name];
    if (!t) return;
    const cap = name === 'forecast_history.csv' ? 25 : t.rows.length;
    H.push('<details><summary>' + esc(name) + ' — ' + t.rows.length + ' rows' +
      (cap < t.rows.length ? ' (showing first ' + cap + ')' : '') + '</summary><table><tr>' +
      t.headers.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr>' +
      t.rows.slice(0, cap).map(r => '<tr>' + t.headers.map(h =>
        '<td>' + esc(String(r[h]).slice(0, 160)) + '</td>').join('') + '</tr>').join('') +
      '</table></details>');
  });

  document.getElementById('app').innerHTML = H.join('\\n');

  /* Expand / collapse all the deal panels. */
  const dealPanels = () => document.querySelectorAll('#app > details');
  const expandBtn = document.getElementById('expandAll');
  const collapseBtn = document.getElementById('collapseAll');
  if (expandBtn) expandBtn.addEventListener('click', () => dealPanels().forEach(d => d.open = true));
  if (collapseBtn) collapseBtn.addEventListener('click', () => dealPanels().forEach(d => d.open = false));

  /* Wire the Run buttons after the markup exists. */
  document.querySelectorAll('.runBtn').forEach(btn => {
    btn.addEventListener('click', function () {
      const id = btn.getAttribute('data-deal');
      runReviewer(id, btn, document.getElementById('out-' + id));
    });
  });
  document.querySelectorAll('.ctxBtn').forEach(btn => {
    btn.addEventListener('click', function () {
      const id = btn.getAttribute('data-deal');
      const out = document.getElementById('out-' + id);
      const msg = buildReviewerMessage(id);
      out.className = '';
      out.textContent = '--- Exact user message sent to the deal reviewer (' +
        msg.length.toLocaleString() + ' characters). REVIEWER_PROMPT is sent separately. ---\\n\\n' + msg;
    });
  });
}

function row2(k, v) { return '<tr><td>' + k + '</td><td>' + v + '</td></tr>'; }

/* ------------------------------------------------------------------ */
/* Settings — the API key lives in localStorage and nowhere else.      */
/* It is never written into this file and never echoed back on screen. */
/* ------------------------------------------------------------------ */

const KEY_STORAGE = 'sibyl_anthropic_api_key';

function getApiKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch (e) { return ''; }
}

function refreshKeyState() {
  const el = document.getElementById('keyState');
  let stored = '';
  try {
    stored = localStorage.getItem(KEY_STORAGE) || '';
  } catch (e) {
    el.className = 'warn';
    el.textContent = 'This browser is blocking localStorage, so the key cannot be saved. Check your privacy settings.';
    return;
  }
  if (stored) {
    el.className = 'ok';
    el.textContent = 'Key saved — stored in this browser only.';
    setTopMeta(MODEL_REVIEWER + ' · ' + MODEL_SIBYL + ' · key saved');
  } else {
    el.className = 'warn';
    el.textContent = 'No key saved. Paste your Anthropic API key above and press Save key.';
    setTopMeta('No API key — open Settings to add one');
  }
  if (typeof renderWorkState === 'function') renderWorkState();
}

document.getElementById('saveKey').addEventListener('click', function () {
  const input = document.getElementById('apikey');
  const value = input.value.trim();
  const el = document.getElementById('keyState');
  if (!value) {
    el.className = 'warn';
    el.textContent = 'Nothing to save — the field is empty.';
    return;
  }
  try {
    localStorage.setItem(KEY_STORAGE, value);
  } catch (e) {
    el.className = 'warn';
    el.textContent = 'Could not save: this browser is blocking localStorage.';
    return;
  }
  input.value = '';   /* never leave the key sitting in the DOM */
  refreshKeyState();
});

document.getElementById('clearKey').addEventListener('click', function () {
  try { localStorage.removeItem(KEY_STORAGE); } catch (e) {}
  document.getElementById('apikey').value = '';
  refreshKeyState();
});

document.getElementById('sibylPromptView').textContent = SIBYL_PROMPT;
document.getElementById('reviewerPromptView').textContent = reviewerSystemPrompt();

document.getElementById('runWeekly').addEventListener('click', function () {
  runWeeklyForecast(this);
});
document.getElementById('runAll').addEventListener('click', function () {
  runSweep(this);
});
document.getElementById('sendFollowUp').addEventListener('click', async function () {
  const box = document.getElementById('followUpText');
  const out = document.getElementById('followUpResult');
  const text = (box.value || '').trim();
  if (!text) { out.className = 'warn'; out.textContent = 'Type something for Maya to say first.'; return; }
  this.disabled = true; box.disabled = true;
  out.className = ''; out.textContent = 'Sending to Sibyl on the same conversation…';
  /* The band, the log entry and the gate move all happen in mayaReplies —
     one door, shared with the EC-5 eval row, so the boundary case cannot be
     graded on a code path this button does not use. */
  const res = await mayaReplies(text);
  this.disabled = false; box.disabled = false;
  if (!res.ok) { out.className = 'warn'; out.textContent = res.error; return; }
  const r = res.r;
  const refusal = res.refusal;
  box.value = '';

  out.className = refusal.refused ? 'warn' : 'ok';
  out.textContent = '[' + r.model + '  ·  ' + r.seconds + 's  ·  stop reason: ' + r.stop_reason + ']\\n\\n' +
    'MAYA: ' + text + '\\n\\n' +
    'SIBYL:\\n' + r.text +
    (r.thinkingSummary ? '\\n\\nTHINKING SUMMARY:\\n' + r.thinkingSummary : '');
});

/* ------------------------------------------------------------------ */
/* Prompt 07 — the gate's three buttons. The decisions themselves live  */
/* in agent_block.js (gateApprove / gateSaveEdit / gateEscalate); this  */
/* is wiring only, so the rules stay in one testable place.            */
/* ------------------------------------------------------------------ */

function showGateForm(which) {
  ['gateEditWrap', 'gateEscalateWrap'].forEach(id => {
    document.getElementById(id).className = 'gatewrap' + (id === which ? ' open' : '');
  });
}

function gateApplied(r) {
  const note = document.getElementById('gateNote');
  if (!r.ok) {
    note.className = 'fieldnote warn';
    note.textContent = r.error;
    return false;
  }
  note.className = 'fieldnote ok';
  note.textContent = r.message;
  showGateForm(null);
  renderGate();
  /* The submission's CARD carries its outcome badge (prompt 12), and the card
     lives in the case list — so a decision here has to redraw that list too.
     Without this, approving the run left the card reading "Awaiting you". */
  renderCaseList();
  renderRunLog();
  return true;
}

document.getElementById('gateApprove').addEventListener('click', function () {
  gateApplied(gateApprove());
});
document.getElementById('gateEdit').addEventListener('click', function () {
  if (!GATE) return;
  document.getElementById('gateEditText').value = GATE.draft;
  showGateForm('gateEditWrap');
});
document.getElementById('gateEditSave').addEventListener('click', function () {
  gateApplied(gateSaveEdit(document.getElementById('gateEditText').value));
});
document.getElementById('gateEditCancel').addEventListener('click', function () {
  showGateForm(null);
});
document.getElementById('gateEscalate').addEventListener('click', function () {
  showGateForm('gateEscalateWrap');
  document.getElementById('gateEscalateReason').focus();
});
document.getElementById('gateEscalateSave').addEventListener('click', function () {
  const box = document.getElementById('gateEscalateReason');
  if (gateApplied(gateEscalate(box.value))) box.value = '';
});
document.getElementById('gateEscalateCancel').addEventListener('click', function () {
  showGateForm(null);
});

/* Case cards are rebuilt on every render, so this is delegated too. */
/* SKIN LOCKED — Studio (light), 2026-08-04. It is one attribute on <html>
   (SKINS.md), set in the markup above; the kit does the rest. The prompt-13
   switcher and its localStorage key were removed when the choice was made —
   flipping skins mid-demo reads as indecision (SKINS.md rule 1). */

/* Prompt 15 — the empty state points at Settings, so it has to be able to open
   it. Settings sits below the console in a <details>; pointing at something the
   viewer has to hunt for is only half a pointer. */
document.getElementById('workState').addEventListener('click', function (ev) {
  const b = ev.target.closest ? ev.target.closest('[data-open-settings]') : null;
  if (!b) return;
  const d = document.getElementById('settings').closest('details');
  if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); }
  const input = document.getElementById('apikey');
  if (input && input.focus) input.focus();
});

document.getElementById('evalChips').addEventListener('click', async function (ev) {
  const chip = ev.target.closest ? ev.target.closest('.chip[data-eval]') : null;
  if (!chip) return;
  document.querySelectorAll('#evalChips .chip').forEach(c => {
    c.className = 'chip' + (c === chip ? ' active' : '');
  });
  await loadEvalCase(chip.getAttribute('data-eval'));
});

document.getElementById('caseList').addEventListener('click', function (ev) {
  const card = ev.target.closest ? ev.target.closest('.case-card[data-case]') : null;
  if (!card) return;
  selectCase(card.getAttribute('data-case'));
});

/* ------------------------------------------------------------------ */
/* The per-deal gate. Rows are rebuilt on every render, so the handler  */
/* is delegated on the container rather than bound per button.         */
/* ------------------------------------------------------------------ */

function dealFieldValue(id, role) {
  const el = document.querySelector('[data-role="' + role + '"][data-deal="' + id + '"]');
  if (!el) return '';
  return el.type === 'checkbox' ? el.checked : el.value;
}

function dealApplied(id, r) {
  /* The note element is rebuilt by renderDealGate, so write it AFTER the
     re-render, not before. */
  if (r.ok) renderDealGate();
  const note = document.getElementById('dealnote-' + id);
  if (note) {
    note.className = 'dealnote ' + (r.ok ? 'ok' : 'warn');
    note.textContent = r.ok ? r.message : r.error;
  }
  if (r.ok) renderRunLog();
  return r.ok;
}

document.getElementById('dealGate').addEventListener('click', async function (ev) {
  const btn = ev.target.closest ? ev.target.closest('button[data-act]') : null;
  if (!btn) return;
  const id = btn.getAttribute('data-deal');
  const act = btn.getAttribute('data-act');

  if (act === 'approve') { dealApplied(id, dealApprove(id)); return; }
  if (act === 'edit') {
    dealApplied(id, dealEdit(id, dealFieldValue(id, 'cat'), dealFieldValue(id, 'reason')));
    return;
  }
  if (act === 'escalate') {
    const to = [];
    if (dealFieldValue(id, 'to-sibyl')) to.push('sibyl');
    if (dealFieldValue(id, 'to-rep')) to.push('rep');
    const reason = dealFieldValue(id, 'reason');
    const r = dealEscalate(id, dealFieldValue(id, 'cat'), reason, to);
    if (!dealApplied(id, r)) return;
    /* Destination 1: ask Sibyl on the SAME conversation, through the follow-up
       turn prompt 06 built. That re-opens the submission gate via logFollowUp,
       because the artifact just moved. */
    if (to.indexOf('sibyl') !== -1) {
      const out = document.getElementById('followUpResult');
      out.className = '';
      out.textContent = 'Escalating ' + id + ' to Sibyl on the same conversation…';
      const msg = escalationToSibyl(id);
      const reply = await continueSibyl(msg);
      if (!reply.ok) { out.className = 'warn'; out.textContent = reply.error; return; }
      const refusal = parseRefusal(reply.text);
      const claims = detectSubmitClaim(reply.text);
      const band = refusal.refused
        ? runStatusBand({ parsed: true, missing: [] }, refusal, null)
        : (claims.length
            ? { code: 'OK — 1 CHECK FAILED', tone: 'warn',
                detail: 'the reply appears to claim it acted: "' + claims[0].slice(0, 90) + '"' }
            : { code: 'OK', tone: 'ok', detail: 'Sibyl answered your deal escalation. Nothing was submitted (M8.1).' });
      renderStatusBand(document.getElementById('runStatus'), band);
      document.getElementById('gateNote').textContent = '';
      document.getElementById('gateNote').className = '';
      logFollowUp('Deal escalation — ' + id + ': ' + reason,
                  band.code + (refusal.refused && refusal.rule ? ' · ' + refusal.rule : ''));
      out.className = refusal.refused ? 'warn' : 'ok';
      out.textContent = '[' + reply.model + '  ·  ' + reply.seconds + 's  ·  stop reason: ' +
        reply.stop_reason + ']\\n\\nMAYA (deal escalation, ' + id + '):\\n' + msg +
        '\\n\\nSIBYL:\\n' + reply.text;
    }
  }
});

document.getElementById('showSibylCtx').addEventListener('click', function () {
  /* This belongs to stage 2 and now renders there. It used to write into
     #runLog — which sits inside a COLLAPSED details in stage 3, so the click
     looked like it did nothing, AND it overwrote the trace of the run you had
     just done. Two defects in one line, both found on a real demo. */
  const msg = buildSibylMessage(LAST_READINGS || {});
  const out = document.getElementById('sibylCtxOut');
  const wrap = document.getElementById('sibylCtxWrap');
  const sum = document.getElementById('sibylCtxSummary');
  out.textContent = msg;
  sum.textContent = 'The exact payload Sibyl gets sent — ' + msg.length.toLocaleString() +
    ' characters' + (LAST_READINGS ? ', with this run\\'s eight readings'
                                   : ', with the deal readings still empty (stage 1 has not run)');
  wrap.open = true;
  wrap.scrollIntoView({ block: 'nearest' });
});

/* ------------------------------------------------------------------ */
/* Prompt 16 — the evals table. Wiring only: runEvalCase and            */
/* setEvalVerdict live in agent_block.js so the rules stay testable.    */
/* Delegated from the container, because the table is re-rendered on    */
/* every state change and per-button listeners would die with it.       */
/* ------------------------------------------------------------------ */
/* The note is saved on every keystroke — a one-line note lost to a stray
   reload is the kind of thing that quietly turns into "mostly fine" the
   second time you write it. */
document.getElementById('evalsTable').addEventListener('input', function (ev) {
  const box = ev.target.closest ? ev.target.closest('input[data-note-case]') : null;
  if (!box) return;
  const r = setEvalNote(box.getAttribute('data-note-case'), box.value);
  const s = document.getElementById('evalsSummary');
  if (!r.ok) { s.className = 'warn'; s.textContent = r.error; }
});

document.getElementById('evalsTable').addEventListener('click', async function (ev) {
  const el = ev.target;
  const closest = (sel) => (el.closest ? el.closest(sel) : null);

  const verdictBtn = closest('button[data-verdict-case]');
  if (verdictBtn) {
    const r = setEvalVerdict(verdictBtn.getAttribute('data-verdict-case'),
                             verdictBtn.getAttribute('data-verdict'));
    if (!r.ok) {
      const s = document.getElementById('evalsSummary');
      s.className = 'warn';
      s.textContent = r.error;
    }
    return;
  }

  const runBtn = closest('button[data-run-eval]') || closest('button[data-fresh-eval]');
  if (!runBtn) return;
  const fresh = !!runBtn.getAttribute('data-fresh-eval');
  const id = runBtn.getAttribute('data-fresh-eval') || runBtn.getAttribute('data-run-eval');
  await runEvalCase(id, { fresh: fresh });
});

/* ------------------------------------------------------------------ */
/* Boot. The embedded path is FULLY SYNCHRONOUS — the harness runs it  */
/* with stubbed DOM and no event loop, so an await here fails 300+     */
/* checks at once. Only api mode goes async, and any failure on that   */
/* path falls back to the embedded snapshot loudly, never silently.    */
/* ------------------------------------------------------------------ */

function renderDataSource(liveLabel, failNote) {
  const badge = document.getElementById('dataSourceBadge');
  if (badge) badge.textContent = liveLabel || 'Embedded';
  const banner = document.getElementById('dataSourceBanner');
  if (banner) {
    if (failNote) { banner.textContent = failNote; banner.style.display = ''; }
    else { banner.textContent = ''; banner.style.display = 'none'; }
  }
}

function initApp() {
  refreshKeyState();
  renderWorkState();
  renderGate();
  renderRunLog();
  renderEvalChips();
  /* Prompt 17 — last session's results come back before anything paints. */
  loadEvals();
  renderEvals();
  renderDealGate();
  render();
}

async function bootAsync() {
  try {
    if (!DATA_API.url) throw new Error('no data API configured');
    const r = await fetch(DATA_API.url + '/rest/v1/rpc/sibyl_sources', {
      method: 'POST',
      headers: {
        'apikey': DATA_API.anonKey,
        'Authorization': 'Bearer ' + DATA_API.anonKey,
        'content-type': 'application/json'
      },
      body: '{}'
    });
    if (!r.ok) throw new Error('sources fetch failed: HTTP ' + r.status);
    const payload = await r.json();
    if (!payload || !payload.data) throw new Error('sources payload has no data');
    applyDataStore(buildDataStore(payload));
    initApp();
    renderDataSource('Live: Supabase', null);
  } catch (e) {
    /* The embedded store was applied at load; re-apply for a clean state
       and say so on screen — a fallback nobody sees is a lie in a badge. */
    applyDataStore(buildDataStore(EMBEDDED_SOURCES));
    initApp();
    renderDataSource(null,
      'Live data unavailable — using the embedded snapshot (' + e.message + ').');
  }
}

if (resolveDataMode() === 'api') { bootAsync(); }
else { initApp(); renderDataSource(null, null); }
</script>
</body>
</html>
"""

html = (HTML.replace("__TOKENS_CSS__", tokens_css)
            .replace("__DATA__", emit(data_files))
            .replace("__POLICIES__", emit(policy_files))
            .replace("__EVAL_EXPECTED__", emit(eval_expected))
            .replace("__AGENT_BLOCK__", agent_block))
for token, body in prompt_text.items():
    html = html.replace(token, esc(body))

# Syntax-gate the generated script: a broken build must not ship silently.
import re as _re, shutil as _shutil, subprocess as _subprocess, tempfile as _tempfile
_node = _shutil.which("node")
if _node:
    _js = _re.search(r"<script>(.*)</script>", html, _re.S).group(1)
    with _tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as _fh:
        _fh.write(_js)
        _tmp = _fh.name
    _check = _subprocess.run([_node, "--check", _tmp], capture_output=True, text=True)
    if _check.returncode != 0:
        raise SystemExit("Generated JavaScript has a syntax error; index.html NOT written.\n" + _check.stderr)
    print("syntax check: OK")
else:
    print("syntax check: skipped (node not installed)")

with open(OUT, "w", encoding="utf-8") as fh:
    fh.write(html)

print("wrote", OUT)
print("size: %.0f KB" % (len(html) / 1024))
print("data files embedded:", len(data_files), "->", ", ".join(data_files))
print("policy files embedded:", len(policy_files), "->", ", ".join(policy_files))
print("held out:", ", ".join(HELD_OUT))
print("tokens: design/TOKENS.css   %6d chars inlined" % len(tokens_css))
for token, fname in PROMPTS.items():
    print("prompt: %-26s %6d chars" % (fname, len(prompt_text[token])))
print("agent block: tools/agent_block.js  %6d chars (spliced verbatim)" % len(agent_block))
