-- Sibyl Pilot — static schema (P2.2). Idempotent: safe to re-run.
-- Per-CSV source tables (sibyl_src_*) are created by tools/etl_load.py, which
-- derives their DDL from each file's headers and registers them in
-- sibyl_source_meta. This file owns everything that is not header-derived.
--
-- Held-out rule: eval_cases.csv is NEVER loaded and never served (the app
-- embeds its Expected column separately; the answer key stays out of context).

-- ---------------------------------------------------------------- meta

create table if not exists sibyl_source_meta (
  name        text primary key,          -- e.g. 'deals_current.csv'
  table_name  text not null,             -- e.g. 'sibyl_src_deals_current'
  headers     text[] not null,           -- original header order, verbatim
  columns     text[] not null,           -- sanitized column names, same order
  loaded_at   timestamptz not null default now()
);
alter table sibyl_source_meta enable row level security;

-- ------------------------------------------------------- text assets

create table if not exists sibyl_text_assets (
  name    text primary key,              -- 'deal_signals.md', 'SKILL.md', ...
  kind    text not null check (kind in ('data-md', 'policy', 'prompt')),
  content text not null
);
alter table sibyl_text_assets enable row level security;
drop policy if exists sibyl_text_assets_read on sibyl_text_assets;
create policy sibyl_text_assets_read on sibyl_text_assets
  for select to anon, authenticated using (true);

-- -------------------------------------------------------------- config
-- Holds the write token. RLS with NO policies: only definer functions read it.

create table if not exists sibyl_config (
  key   text primary key,
  value text not null
);
alter table sibyl_config enable row level security;

-- ------------------------------------------------- live decisions log
-- Append-only. This is the pilot's real persistence: run entries, Maya's
-- human actions, and her per-deal category calls.

create table if not exists sibyl_pilot_decisions (
  id         bigserial primary key,
  ts         timestamptz not null default now(),
  session_id text,
  kind       text not null check (kind in ('run', 'human_action', 'maya_category')),
  case_id    text,
  deal_id    text,
  payload    jsonb not null
);
alter table sibyl_pilot_decisions enable row level security;

-- Reads are public (synthetic data, public-read posture chosen 2026-08-06).
drop policy if exists sibyl_pilot_decisions_read on sibyl_pilot_decisions;
create policy sibyl_pilot_decisions_read on sibyl_pilot_decisions
  for select to anon, authenticated using (true);

-- Writes require the x-write-token request header to match sibyl_config.
-- The check runs as a definer function because the inserting role (anon)
-- must not be able to read sibyl_config itself.
create or replace function sibyl_check_write_token()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (nullif(current_setting('request.headers', true), '')::json ->> 'x-write-token'),
    ''
  ) = coalesce((select value from sibyl_config where key = 'write_token'), '__unset__');
$$;

drop policy if exists sibyl_pilot_decisions_insert on sibyl_pilot_decisions;
create policy sibyl_pilot_decisions_insert on sibyl_pilot_decisions
  for insert to anon, authenticated
  with check (sibyl_check_write_token());

-- ------------------------------------------------------- the sources RPC
-- Returns {data: {<file>: <csv text>}, policies: {...}, prompts: {...}} —
-- the exact shape of the app's embedded constants, so buildDataStore()
-- consumes it unchanged. Rows re-serialize to RFC-4180 CSV; the result
-- parses identically to the file the row came from.

create or replace function sibyl_csv_escape(v text)
returns text
language sql
immutable
as $$
  select case
    when v is null then ''
    when v ~ '[",\n\r]' then '"' || replace(v, '"', '""') || '"'
    else v
  end;
$$;

create or replace function sibyl_sources()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  meta     record;
  hdr      text;
  body     text;
  data_obj jsonb := '{}'::jsonb;
  pol_obj  jsonb := '{}'::jsonb;
  prompts  jsonb := '{}'::jsonb;
  a        record;
begin
  for meta in select * from sibyl_source_meta order by name loop
    select string_agg(sibyl_csv_escape(h), ',' order by ord) into hdr
      from unnest(meta.headers) with ordinality as u(h, ord);
    -- Values come out by sanitized column name (meta.columns), in the same
    -- positional order as the verbatim headers above.
    execute format(
      'select coalesce(string_agg(line, e''\n'' order by _row), '''') from (' ||
      '  select _row, (select string_agg(sibyl_csv_escape(j ->> c), '','' order by ord) ' ||
      '     from unnest($1) with ordinality as u(c, ord)) as line ' ||
      '  from (select _row, to_jsonb(t.*) as j from %I t) s' ||
      ') lines', meta.table_name)
    into body using meta.columns;
    data_obj := data_obj || jsonb_build_object(meta.name, hdr || e'\n' || body || e'\n');
  end loop;

  for a in select * from sibyl_text_assets loop
    if a.kind = 'data-md' then
      data_obj := data_obj || jsonb_build_object(a.name, a.content);
    elsif a.kind = 'policy' then
      pol_obj := pol_obj || jsonb_build_object(a.name, a.content);
    elsif a.kind = 'prompt' then
      prompts := prompts || jsonb_build_object(
        case a.name when 'sibyl_prompt.md' then 'sibyl'
                    when 'deal_reviewer_prompt.md' then 'reviewer'
                    else a.name end,
        a.content);
    end if;
  end loop;

  return jsonb_build_object('data', data_obj, 'policies', pol_obj, 'prompts', prompts);
end;
$$;

grant execute on function sibyl_sources() to anon, authenticated;
grant execute on function sibyl_check_write_token() to anon, authenticated;
