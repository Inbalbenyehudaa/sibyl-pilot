#!/usr/bin/env python3
"""Sibyl Pilot ETL (P2.3) — load the source files into Supabase Postgres.

Per CSV: drops and recreates sibyl_src_<stem> (all text columns + _row int,
sanitized column names), inserts every row, enables RLS with an anon SELECT
policy, and registers headers+columns in sibyl_source_meta. Markdown/prompt
files land verbatim in sibyl_text_assets.

Idempotent: the whole load runs in ONE transaction; run twice -> same state.
eval_cases.csv is deliberately NEVER loaded (held-out answer key).

Connection comes from .env (SUPABASE_DB_URL) or the environment.
Requires: pip install psycopg2-binary
"""
import csv
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CSV_FILES = [
    "deals_current.csv", "deals_last_week.csv", "forecast_history.csv",
    "rep_accuracy_history.csv", "stage_conversion_rates.csv",
    "create_and_close_history.csv", "topdown_metrics.csv", "decisions_log.csv",
]
HELD_OUT = {"eval_cases.csv"}
TEXT_ASSETS = [
    ("data/deal_signals.md", "data-md"),
    ("policies/forecast_methodology.md", "policy"),
    ("policies/SKILL.md", "policy"),
    ("sibyl_prompt.md", "prompt"),
    ("deal_reviewer_prompt.md", "prompt"),
]


def env():
    envfile = ROOT / ".env"
    if envfile.exists():
        for line in envfile.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        sys.exit("SUPABASE_DB_URL not set (put it in .env or the environment)")
    return url


def colnames(headers):
    """Sanitized, unique, <=63-byte column names, order-preserving."""
    seen, out = set(), []
    for i, h in enumerate(headers):
        base = re.sub(r"[^a-z0-9]+", "_", h.lower()).strip("_") or "col"
        base = base[:55]
        name = base
        n = 2
        while name in seen:
            name = f"{base}_{n}"
            n += 1
        seen.add(name)
        out.append(name)
    return out


def qi(name):  # quoted identifier
    return '"' + name.replace('"', '""') + '"'


def load_csv(cur, fname):
    path = ROOT / "data" / fname
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = [r for r in csv.reader(f)]
    rows = [r for r in rows if len(r) > 1 or (len(r) == 1 and r[0].strip())]
    headers, data = rows[0], rows[1:]
    cols = colnames(headers)
    table = "sibyl_src_" + re.sub(r"[^a-z0-9]+", "_", fname[:-4].lower()).strip("_")

    cur.execute(f"drop table if exists {qi(table)} cascade")
    cur.execute(
        f"create table {qi(table)} (_row int primary key, "
        + ", ".join(f"{qi(c)} text" for c in cols) + ")"
    )
    ins = (f"insert into {qi(table)} (_row, " + ", ".join(qi(c) for c in cols)
           + ") values (" + ", ".join(["%s"] * (len(cols) + 1)) + ")")
    for i, r in enumerate(data, start=1):
        vals = [(r[j] if j < len(r) else "") for j in range(len(cols))]
        cur.execute(ins, [i] + vals)

    cur.execute(f"alter table {qi(table)} enable row level security")
    pol = table + "_read"
    cur.execute(f"drop policy if exists {qi(pol)} on {qi(table)}")
    cur.execute(f"create policy {qi(pol)} on {qi(table)} for select to anon, authenticated using (true)")
    cur.execute(
        "insert into sibyl_source_meta (name, table_name, headers, columns, loaded_at) "
        "values (%s, %s, %s, %s, now()) "
        "on conflict (name) do update set table_name = excluded.table_name, "
        "headers = excluded.headers, columns = excluded.columns, loaded_at = now()",
        (fname, table, headers, cols),
    )
    return table, len(data)


def main():
    import psycopg2
    url = env()
    conn = psycopg2.connect(url)
    conn.autocommit = False
    cur = conn.cursor()

    for fname in CSV_FILES:
        assert fname not in HELD_OUT
        table, n = load_csv(cur, fname)
        print(f"  {fname:32} -> {table} ({n} rows)")

    for rel, kind in TEXT_ASSETS:
        body = (ROOT / rel).read_text(encoding="utf-8")
        if kind == "prompt":
            body = body.rstrip()  # matches build_index.py / sync_assets.py
        cur.execute(
            "insert into sibyl_text_assets (name, kind, content) values (%s, %s, %s) "
            "on conflict (name) do update set kind = excluded.kind, content = excluded.content",
            (Path(rel).name, kind, body),
        )
        print(f"  {Path(rel).name:32} -> sibyl_text_assets ({kind})")

    conn.commit()
    cur.close()
    conn.close()
    print("ETL complete — one transaction, committed.")


if __name__ == "__main__":
    main()
