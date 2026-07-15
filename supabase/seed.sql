-- ============================================================
-- SEED DATA — contoh panel P-011.4 LDB PRODUCTION 1st
-- (format Barry Callebaut / Archetype, data sample)
-- Jalankan SETELAH schema.sql di Supabase SQL Editor
-- ============================================================

do $$
declare
  v_project uuid;
  v_panel   uuid;
  v_circuit uuid;
begin
  insert into projects (name, client)
  values ('Barry Callebaut - Production Facility', 'Barry Callebaut')
  returning id into v_project;

  insert into panels (
    project_id, panel_code, location, ip_rating, box_type, symbol_tag,
    source_panel, main_breaker_type, main_breaker_rating, fuse_rating,
    incoming_cable, voltage, phase, wire, freq, power_factor
  ) values (
    v_project, 'P-011.4', 'LDB PRODUCTION 1st', 'IP42', 'BOX PANEL', 'L4',
    'FROM MLDB', 'MCB 3P', '32A', 'F 2A',
    'NYY 4C x 6mm2 + NYA 1C x 6mm2', '400V', '3PH', '4W', '50Hz', 0.8
  ) returning id into v_panel;

  -- ---- circuits 1PH (fase diisi di satu kolom saja) ----
  -- L4-1  R : 6x LED Surface 2x18W = 216 W
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, outgoing_cable, phase_r)
  values (v_panel, 1, 'LIGHTING (L4-1)', 'MCB 1P', '10A', 'NYM 3C x 2.5mm2', 216) returning id into v_circuit;
  insert into circuit_fixtures (circuit_id, fixture_type, fixture_label, quantity, watt_per_unit)
  values (v_circuit, 'LED SURFACE MOUNTED', '2x18 WATT', 6, 36);

  -- L4-2  S : 2x Lowbay 75W + 4x Surface = 294 W
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, outgoing_cable, phase_s)
  values (v_panel, 2, 'LIGHTING (L4-2)', 'MCB 1P', '10A', 'NYM 3C x 2.5mm2', 294) returning id into v_circuit;
  insert into circuit_fixtures (circuit_id, fixture_type, fixture_label, quantity, watt_per_unit) values
    (v_circuit, 'LED LOWBAY', '75 WATT', 2, 75),
    (v_circuit, 'LED SURFACE MOUNTED', '2x18 WATT', 4, 36);

  -- L4-3  T : 10x Surface = 360 W
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, outgoing_cable, phase_t)
  values (v_panel, 3, 'LIGHTING (L4-3)', 'MCB 1P', '10A', 'NYM 3C x 2.5mm2', 360) returning id into v_circuit;
  insert into circuit_fixtures (circuit_id, fixture_type, fixture_label, quantity, watt_per_unit)
  values (v_circuit, 'LED SURFACE MOUNTED', '2x18 WATT', 10, 36);

  -- L4-4  R : 10x Recessed + 1x Insect Killer = 390 W
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, outgoing_cable, phase_r)
  values (v_panel, 4, 'LIGHTING (L4-4)', 'MCB 1P', '10A', 'NYM 3C x 2.5mm2', 390) returning id into v_circuit;
  insert into circuit_fixtures (circuit_id, fixture_type, fixture_label, quantity, watt_per_unit) values
    (v_circuit, 'LED RECESSED MOUNTED', '2x18 WATT', 10, 36),
    (v_circuit, 'INSECT KILLER', '30 WATT', 1, 30);

  -- L4-5  S : 9x Recessed + 1x Insect = 354 W
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, outgoing_cable, phase_s)
  values (v_panel, 5, 'LIGHTING (L4-5)', 'MCB 1P', '10A', 'NYM 3C x 2.5mm2', 354) returning id into v_circuit;
  insert into circuit_fixtures (circuit_id, fixture_type, fixture_label, quantity, watt_per_unit) values
    (v_circuit, 'LED RECESSED MOUNTED', '2x18 WATT', 9, 36),
    (v_circuit, 'INSECT KILLER', '30 WATT', 1, 30);

  -- L4-6  T : 11x Recessed + 1x Insect = 426 W
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, outgoing_cable, phase_t)
  values (v_panel, 6, 'LIGHTING (L4-6)', 'MCB 1P', '10A', 'NYM 3C x 2.5mm2', 426) returning id into v_circuit;
  insert into circuit_fixtures (circuit_id, fixture_type, fixture_label, quantity, watt_per_unit) values
    (v_circuit, 'LED RECESSED MOUNTED', '2x18 WATT', 11, 36),
    (v_circuit, 'INSECT KILLER', '30 WATT', 1, 30);

  -- L4-7  R : 16x Surface = 576 W
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, outgoing_cable, phase_r)
  values (v_panel, 7, 'LIGHTING (L4-7)', 'MCB 1P', '10A', 'NYM 3C x 2.5mm2', 576) returning id into v_circuit;
  insert into circuit_fixtures (circuit_id, fixture_type, fixture_label, quantity, watt_per_unit)
  values (v_circuit, 'LED SURFACE MOUNTED', '2x18 WATT', 16, 36);

  -- L4-8  S : 14x Surface = 504 W
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, outgoing_cable, phase_s)
  values (v_panel, 8, 'LIGHTING (L4-8)', 'MCB 1P', '10A', 'NYM 3C x 2.5mm2', 504) returning id into v_circuit;
  insert into circuit_fixtures (circuit_id, fixture_type, fixture_label, quantity, watt_per_unit)
  values (v_circuit, 'LED SURFACE MOUNTED', '2x18 WATT', 14, 36);

  -- L4-9  T : 17x Surface = 612 W
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, outgoing_cable, phase_t)
  values (v_panel, 9, 'LIGHTING (L4-9)', 'MCB 1P', '10A', 'NYM 3C x 2.5mm2', 612) returning id into v_circuit;
  insert into circuit_fixtures (circuit_id, fixture_type, fixture_label, quantity, watt_per_unit)
  values (v_circuit, 'LED SURFACE MOUNTED', '2x18 WATT', 17, 36);

  -- L4-10 R : 10x Lowbay 75W + 2x Insect = 810 W
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, outgoing_cable, phase_r)
  values (v_panel, 10, 'LIGHTING (L4-10)', 'MCB 1P', '10A', 'NYM 3C x 2.5mm2', 810) returning id into v_circuit;
  insert into circuit_fixtures (circuit_id, fixture_type, fixture_label, quantity, watt_per_unit) values
    (v_circuit, 'LED LOWBAY', '75 WATT', 10, 75),
    (v_circuit, 'INSECT KILLER', '30 WATT', 2, 30);

  -- L4-11 S : 3x Lowbay 120W + 1x Insect = 390 W
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, outgoing_cable, phase_s)
  values (v_panel, 11, 'LIGHTING (L4-11)', 'MCB 1P', '10A', 'NYM 3C x 2.5mm2', 390) returning id into v_circuit;
  insert into circuit_fixtures (circuit_id, fixture_type, fixture_label, quantity, watt_per_unit) values
    (v_circuit, 'LED LOWBAY', '120 WATT', 3, 120),
    (v_circuit, 'INSECT KILLER', '30 WATT', 1, 30);

  -- L4-12 T : 22x Recessed = 792 W
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, outgoing_cable, phase_t)
  values (v_panel, 12, 'LIGHTING (L4-12)', 'MCB 1P', '10A', 'NYM 3C x 2.5mm2', 792) returning id into v_circuit;
  insert into circuit_fixtures (circuit_id, fixture_type, fixture_label, quantity, watt_per_unit)
  values (v_circuit, 'LED RECESSED MOUNTED', '2x18 WATT', 22, 36);

  -- L4-13 R : 23x Surface = 828 W
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, outgoing_cable, phase_r)
  values (v_panel, 13, 'LIGHTING (L4-13)', 'MCB 1P', '10A', 'NYM 3C x 2.5mm2', 828) returning id into v_circuit;
  insert into circuit_fixtures (circuit_id, fixture_type, fixture_label, quantity, watt_per_unit)
  values (v_circuit, 'LED SURFACE MOUNTED', '2x18 WATT', 23, 36);

  -- L4-14 S : 10x Lowbay 120W = 1200 W
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, outgoing_cable, phase_s)
  values (v_panel, 14, 'LIGHTING (L4-14)', 'MCB 1P', '10A', 'NYM 3C x 2.5mm2', 1200) returning id into v_circuit;
  insert into circuit_fixtures (circuit_id, fixture_type, fixture_label, quantity, watt_per_unit)
  values (v_circuit, 'LED LOWBAY', '120 WATT', 10, 120);

  -- L4-15 T : 5x Lowbay 120W + 3x Lowbay 75W = 825 W
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, outgoing_cable, phase_t)
  values (v_panel, 15, 'LIGHTING (L4-15)', 'MCB 1P', '10A', 'NYM 3C x 2.5mm2', 825) returning id into v_circuit;
  insert into circuit_fixtures (circuit_id, fixture_type, fixture_label, quantity, watt_per_unit) values
    (v_circuit, 'LED LOWBAY', '120 WATT', 5, 120),
    (v_circuit, 'LED LOWBAY', '75 WATT', 3, 75);

  -- L4-16 R : 8x Lowbay 75W = 600 W
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, outgoing_cable, phase_r)
  values (v_panel, 16, 'LIGHTING (L4-16)', 'MCB 1P', '10A', 'NYM 3C x 2.5mm2', 600) returning id into v_circuit;
  insert into circuit_fixtures (circuit_id, fixture_type, fixture_label, quantity, watt_per_unit)
  values (v_circuit, 'LED LOWBAY', '75 WATT', 8, 75);

  -- L4-17 S : 12x Recessed = 432 W
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, outgoing_cable, phase_s)
  values (v_panel, 17, 'LIGHTING (L4-17)', 'MCB 1P', '10A', 'NYM 3C x 2.5mm2', 432) returning id into v_circuit;
  insert into circuit_fixtures (circuit_id, fixture_type, fixture_label, quantity, watt_per_unit)
  values (v_circuit, 'LED RECESSED MOUNTED', '2x18 WATT', 12, 36);

  -- L4-18 T : 6x Lowbay 120W = 720 W
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, outgoing_cable, phase_t)
  values (v_panel, 18, 'LIGHTING (L4-18)', 'MCB 1P', '10A', 'NYM 3C x 2.5mm2', 720) returning id into v_circuit;
  insert into circuit_fixtures (circuit_id, fixture_type, fixture_label, quantity, watt_per_unit)
  values (v_circuit, 'LED LOWBAY', '120 WATT', 6, 120);

  -- L4-19 3PH balance : 15x Lowbay 120W = 1800 W -> 600/600/600
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, outgoing_cable, phase_r, phase_s, phase_t)
  values (v_panel, 19, 'LIGHTING (L4-19)', 'MCB 3P', '16A', 'NYY 4C x 2.5mm2', 600, 600, 600) returning id into v_circuit;
  insert into circuit_fixtures (circuit_id, fixture_type, fixture_label, quantity, watt_per_unit)
  values (v_circuit, 'LED LOWBAY', '120 WATT', 15, 120);

  -- SPARE
  insert into circuits (panel_id, circuit_no, function_name, breaker_type, breaker_rating, is_spare)
  values
    (v_panel, 20, 'SPARE', 'MCB 1P', '10A', true),
    (v_panel, 21, 'SPARE', 'MCB 1P', '10A', true);
end $$;
