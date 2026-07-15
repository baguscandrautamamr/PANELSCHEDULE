-- ============================================================
-- PANEL SCHEDULE — Supabase schema (Phase 1)
-- Run this once in the Supabase SQL Editor
-- Project: ptkhwoabeclqbfemxgnj
-- ============================================================

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text,
  created_at timestamptz default now()
);

create table if not exists panels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  panel_code text not null,          -- "P-011.4"
  location text,                     -- "LDB Production 1st"
  ip_rating text,                    -- "IP42"
  box_type text,                     -- "BOX PANEL"
  symbol_tag text,                   -- "L4"
  source_panel text,                 -- "FROM MLDB"
  main_breaker_type text,            -- "MCB 3P"
  main_breaker_rating text,          -- "32A"
  fuse_rating text,                  -- "F 2A"
  incoming_cable text,               -- "NYY 4C x 6mm2 + NYA 1C x 6mm2"
  voltage text default '400V',
  phase text default '3PH',
  wire text default '4W',
  freq text default '50Hz',
  power_factor numeric default 0.8,  -- dipakai buat hitung TOTAL VA & CONNECTED AMPERE
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists circuits (
  id uuid primary key default gen_random_uuid(),
  panel_id uuid references panels(id) on delete cascade,
  circuit_no int not null,
  function_name text not null,       -- "LIGHTING (L4-1)"
  breaker_type text,                 -- MCB 1P / MCB 3P / MCCB 3P / RCBO 2P / RCBO 4P
  breaker_rating text,               -- "10A"
  outgoing_cable text,               -- "NYM 3C x 2.5mm2"
  phase_r numeric default 0,         -- watt di fase R (1PH: isi salah satu kolom saja;
  phase_s numeric default 0,         --  3PH: diisi balance di R/S/T)
  phase_t numeric default 0,
  remarks text,
  is_spare boolean default false,
  unique (panel_id, circuit_no)
);

create table if not exists circuit_fixtures (
  id uuid primary key default gen_random_uuid(),
  circuit_id uuid references circuits(id) on delete cascade,
  fixture_type text not null,        -- "LED LOWBAY" (type family Revit)
  fixture_label text,                -- "75 WATT"
  quantity int not null default 0,
  watt_per_unit numeric
);

-- updated_at otomatis
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists panels_updated_at on panels;
create trigger panels_updated_at before update on panels
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- RLS: permissive dulu untuk Phase 1 (publishable key bisa
-- read + write, dipakai website & Revit add-in).
-- TODO Phase selanjutnya: pindah write ke service role / auth.
-- ------------------------------------------------------------
alter table projects enable row level security;
alter table panels enable row level security;
alter table circuits enable row level security;
alter table circuit_fixtures enable row level security;

drop policy if exists "public full access" on projects;
create policy "public full access" on projects for all using (true) with check (true);
drop policy if exists "public full access" on panels;
create policy "public full access" on panels for all using (true) with check (true);
drop policy if exists "public full access" on circuits;
create policy "public full access" on circuits for all using (true) with check (true);
drop policy if exists "public full access" on circuit_fixtures;
create policy "public full access" on circuit_fixtures for all using (true) with check (true);

-- enable realtime (idempotent: aman dijalankan ulang / kalau tabel sudah terdaftar)
do $$
declare
  t text;
begin
  foreach t in array array['panels', 'circuits', 'circuit_fixtures'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception
      when duplicate_object then null;  -- sudah terdaftar di publication
      when undefined_object then null;  -- publication belum ada (realtime off) — skip
    end;
  end loop;
end $$;
