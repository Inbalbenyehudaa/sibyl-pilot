#!/usr/bin/env python3
"""
Re-generate the asset blocks inside index.html from the files on disk.

Single source of truth is the disk:
    data/*.csv, data/*.md   ->  const DATA_FILES
    policies/*.md           ->  const POLICY_FILES
    sibyl_prompt.md         ->  const SIBYL_PROMPT
    deal_reviewer_prompt.md ->  const REVIEWER_PROMPT

index.html also tries to fetch these files live at run time; the embedded copies
are the fallback for when the page is opened straight off the filesystem, where
browsers block fetch(). Run this after editing any data file, policy, or prompt.

    python3 sync_assets.py
    python3 sync_assets.py --check      # exit 1 if index.html is stale
"""
import csv, re, sys, pathlib, hashlib

ROOT = pathlib.Path(__file__).parent
HTML = ROOT / "index.html"
HELD_OUT = {"eval_cases.csv"}          # never embedded — the answer key

def js_literal(text: str) -> str:
    """Escape a string so it survives inside a JS backtick template literal."""
    return text.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")

def collect(folder: pathlib.Path, suffixes) -> dict:
    out = {}
    for p in sorted(folder.iterdir()):
        if p.suffix in suffixes and p.name not in HELD_OUT:
            out[p.name] = p.read_text(encoding="utf-8")
    return out

def object_block(name: str, files: dict, kw: str = "const") -> str:
    lines = [f"{kw} {name} = {{"]
    for i, (fn, body) in enumerate(files.items()):
        comma = "," if i < len(files) - 1 else ""
        lines.append(f'  "{fn}": `{js_literal(body)}`{comma}')
    lines.append("};")
    return "\n".join(lines)

def eval_expected() -> dict:
    """Case ID -> Expected Behavior, from the held-out file.

    ONLY that column. Scenario, Fails If, Deal IDs, Result and Verdict stay in
    data/eval_cases.csv, which is still absent from DATA_FILES.
    """
    out = {}
    with open(ROOT / "data" / "eval_cases.csv", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            cid = (row.get("Case ID") or "").strip()
            if cid:
                out[cid] = (row.get("Expected Behavior") or "").strip()
    return out

def literal_block(name: str, body: str, kw: str = "const") -> str:
    return f"{kw} {name} = `{js_literal(body)}`;"

def find_block(html: str, name: str):
    """Return (start, end) char offsets of `const|let NAME = ...;` including terminator."""
    m = re.search(r"^(?:const|let) " + name + r"\s*=\s*(\{|`)", html, re.M)
    if not m:
        raise SystemExit(f"could not find `const|let {name}` in index.html")
    if m.group(1) == "{":
        end = html.index("\n};", m.start()) + len("\n};")
    else:
        i = m.end() - 1                      # sitting on the opening backtick
        while True:
            i = html.index("`", i + 1)
            if html[i - 1] != "\\":          # unescaped closing backtick
                break
        end = html.index(";", i) + 1
    return m.start(), end

def main() -> int:
    check_only = "--check" in sys.argv
    html = HTML.read_text(encoding="utf-8")
    before = hashlib.sha256(html.encode()).hexdigest()

    blocks = {
        "DATA_FILES":      object_block("DATA_FILES", collect(ROOT / "data", {".csv", ".md"})),
        "POLICY_FILES":    object_block("POLICY_FILES", collect(ROOT / "policies", {".md"}), kw="let"),
        # .rstrip() matches tools/build_index.py. Without it the two generators
        # disagree by one trailing newline and --check reports STALE forever,
        # which is how a real drift went unnoticed on 2026-08-03.
        "SIBYL_PROMPT":    literal_block("SIBYL_PROMPT", (ROOT / "sibyl_prompt.md").read_text(encoding="utf-8").rstrip(), kw="let"),
        "REVIEWER_PROMPT": literal_block("REVIEWER_PROMPT", (ROOT / "deal_reviewer_prompt.md").read_text(encoding="utf-8").rstrip(), kw="let"),
        # Prompt 16 — the evals table's Expected column, and the ONLY part of
        # the held-out file that ships. Covered here as well as in
        # build_index.py, or editing an expectation and running sync_assets.py
        # would leave the table quoting the previous wording with nothing to
        # warn you — the same silent-drift trap TOKENS.css still has.
        "EVAL_EXPECTED":   object_block("EVAL_EXPECTED", eval_expected()),
    }
    for name, new_text in blocks.items():
        start, end = find_block(html, name)
        html = html[:start] + new_text + html[end:]

    after = hashlib.sha256(html.encode()).hexdigest()
    if before == after:
        print("index.html already in sync with disk.")
        return 0
    if check_only:
        print("STALE: index.html does not match the files on disk. Run: python3 sync_assets.py")
        return 1
    HTML.write_text(html, encoding="utf-8")
    print("index.html re-synced from disk.")
    for name in blocks:
        print(f"  rebuilt {name}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
