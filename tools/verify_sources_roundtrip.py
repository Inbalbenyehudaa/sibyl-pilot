#!/usr/bin/env python3
"""P2 verify — the sibyl_sources() RPC must round-trip: every CSV it serves
parses to exactly the rows of the local file it was loaded from, and every
text asset matches byte-for-byte (prompts modulo the rstrip both sides apply).
Run after etl_load.py. Exits non-zero on any mismatch."""
import csv
import io
import sys
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from etl_load import CSV_FILES, TEXT_ASSETS, env  # noqa: E402


def parse(text):
    rows = [r for r in csv.reader(io.StringIO(text))]
    return [r for r in rows if len(r) > 1 or (len(r) == 1 and r[0].strip())]


def main():
    import psycopg2
    conn = psycopg2.connect(env())
    cur = conn.cursor()
    cur.execute("select sibyl_sources()")
    payload = cur.fetchone()[0]
    if isinstance(payload, str):
        payload = json.loads(payload)
    conn.close()

    failures = []

    for fname in CSV_FILES:
        local = parse((ROOT / "data" / fname).read_text(encoding="utf-8-sig"))
        served_text = payload["data"].get(fname)
        if served_text is None:
            failures.append(f"{fname}: missing from payload")
            continue
        served = parse(served_text)
        if served != local:
            n = sum(1 for a, b in zip(local, served) if a != b)
            failures.append(f"{fname}: parsed rows differ (local {len(local)}, served {len(served)}, {n} row diffs)")

    if "eval_cases.csv" in payload["data"]:
        failures.append("eval_cases.csv: SERVED — the held-out answer key must never leave the DB")

    for rel, kind in TEXT_ASSETS:
        name = Path(rel).name
        local = (ROOT / rel).read_text(encoding="utf-8")
        if kind == "prompt":
            local = local.rstrip()
            served = payload["prompts"].get({"sibyl_prompt.md": "sibyl", "deal_reviewer_prompt.md": "reviewer"}[name])
        elif kind == "policy":
            served = payload["policies"].get(name)
        else:
            served = payload["data"].get(name)
        if served != local:
            failures.append(f"{name}: text differs (local {len(local)} chars, served {len(served or '')} chars)")

    if failures:
        print("ROUND-TRIP FAILURES:")
        for f in failures:
            print("  " + f)
        sys.exit(1)
    print(f"ROUND-TRIP CLEAN — {len(CSV_FILES)} CSVs parse identically, "
          f"{len(TEXT_ASSETS)} text assets match, answer key absent.")


if __name__ == "__main__":
    main()
