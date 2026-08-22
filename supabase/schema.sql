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
  circuit_no int not null,           -- nomor urut tampilan 1..N (rapat, tidak loncat)
  revit_circuit_number text,         -- "Circuit Number" Revit apa adanya: "(D)/4", "DB-FG/42", "1,3,5"
                                     -- dipakai Pull buat mencocokkan baris ini dengan circuit di model
  function_name text not null,       -- "LIGHTING (D)/4"
  breaker_type text,                 -- MCB 1P / MCB 3P / MCCB 3P / RCBO 2P / RCBO 4P
  breaker_rating text,               -- "10A"
  outgoing_cable text,               -- "NYM 3C x 2.5mm2"
  phase_r numeric default 0,         -- watt di fase R (1PH: isi salah satu kolom saja;
  phase_s numeric default 0,         --  3PH: diisi balance di R/S/T)
  phase_t numeric default 0,
  phase_lock text check (phase_lock in ('R', 'S', 'T')),
                                     -- fase hasil "Rebalance Loads"/edit manual di website.
                                     -- null = ikut pembagian fase dari model Revit.
                                     -- Push memindahkan watt terbaru ke fase ini (bukan
                                     -- mempertahankan watt lamanya), dicocokkan lewat
                                     -- revit_circuit_number.
  remarks text,
  is_spare boolean default false,
  source text not null default 'revit',  -- 'revit' = dari push add-in (ditimpa tiap push);
                                         -- 'manual' = input di website (tidak disentuh push)
  unique (panel_id, circuit_no)
);

-- migrasi untuk database yang sudah ada (create table if not exists di atas
-- tidak menambah kolom ke tabel lama) — aman dijalankan ulang
alter table circuits add column if not exists source text not null default 'revit';
alter table circuits add column if not exists revit_circuit_number text;
alter table circuits add column if not exists phase_lock text;
do $$
begin
  alter table circuits add constraint circuits_phase_lock_check
    check (phase_lock in ('R', 'S', 'T'));
exception
  when duplicate_object then null;  -- constraint sudah ada
end $$;

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
  foreach t in array array['projects', 'panels', 'circuits', 'circuit_fixtures'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception
      when duplicate_object then null;  -- sudah terdaftar di publication
      when undefined_object then null;  -- publication belum ada (realtime off) — skip
    end;
  end loop;
end $$;
