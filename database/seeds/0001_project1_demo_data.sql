-- IPS Project 1 demo data
-- DEVELOPMENT / TEST DATA ONLY. Nothing here is an official competition rule or result.

begin;

insert into public.cities (id, code, name, region) values
  ('00000000-0000-4000-8000-000000000001', 'NAP', 'Napoli', 'Campania'),
  ('00000000-0000-4000-8000-000000000002', 'MIL', 'Milano', 'Lombardia'),
  ('00000000-0000-4000-8000-000000000003', 'TOR', 'Torino', 'Piemonte'),
  ('00000000-0000-4000-8000-000000000004', 'ROM', 'Roma', 'Lazio'),
  ('00000000-0000-4000-8000-000000000005', 'BOL', 'Bologna', 'Emilia-Romagna'),
  ('00000000-0000-4000-8000-000000000006', 'PAR', 'Parma', 'Emilia-Romagna')
on conflict (id) do nothing;

insert into public.clubs (id, city_id, name, short_name, slug, verified) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Napoli Lions Cricket Club', 'Napoli Lions', 'napoli-lions', true),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Vesuvio Kings Cricket Club', 'Vesuvio Kings', 'vesuvio-kings', true),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Milano Stars Cricket Club', 'Milano Stars', 'milano-stars', true),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003', 'Torino Warriors Cricket Club', 'Torino Warriors', 'torino-warriors', true),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000004', 'Roma Royals Cricket Club', 'Roma Royals', 'roma-royals', true),
  ('10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000006', 'Parma Titans Cricket Club', 'Parma Titans', 'parma-titans', true)
on conflict (id) do nothing;

insert into public.teams (id, club_id, name, short_name, slug) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Napoli Lions', 'NAP Lions', 'napoli-lions-first'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Vesuvio Kings', 'VES Kings', 'vesuvio-kings-first'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'Milano Stars', 'MIL Stars', 'milano-stars-first'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'Torino Warriors', 'TOR Warriors', 'torino-warriors-first'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'Roma Royals', 'ROM Royals', 'roma-royals-first'),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', 'Parma Titans', 'PAR Titans', 'parma-titans-first')
on conflict (id) do nothing;

-- Explicit test player codes make identity checks deterministic.
insert into public.players (id, ips_code, slug, display_name, given_name, family_name, batting_style, bowling_style, primary_role) values
  ('30000000-0000-4000-8000-000000000001', 'ITA-0001847', 'd-fernando-1847', 'D. Fernando', 'D.', 'Fernando', 'Right hand', 'Right arm medium', 'All-rounder'),
  ('30000000-0000-4000-8000-000000000002', 'ITA-0001848', 'k-silva-1848', 'K. Silva', 'K.', 'Silva', 'Right hand', null, 'Batter'),
  ('30000000-0000-4000-8000-000000000003', 'ITA-0001849', 'm-perera-1849', 'M. Perera', 'M.', 'Perera', 'Right hand', 'Right arm fast', 'Bowler'),
  ('30000000-0000-4000-8000-000000000004', 'ITA-0001850', 'r-jayasuriya-1850', 'R. Jayasuriya', 'R.', 'Jayasuriya', 'Left hand', 'Right arm spin', 'All-rounder'),
  ('30000000-0000-4000-8000-000000000005', 'ITA-0001851', 's-de-silva-1851', 'S. de Silva', 'S.', 'de Silva', 'Right hand', null, 'Wicketkeeper'),
  ('30000000-0000-4000-8000-000000000006', 'ITA-0001852', 'a-kumara-1852', 'A. Kumara', 'A.', 'Kumara', 'Right hand', 'Right arm medium', 'All-rounder'),
  ('30000000-0000-4000-8000-000000000007', 'ITA-0001853', 'n-mendis-1853', 'N. Mendis', 'N.', 'Mendis', 'Left hand', 'Left arm medium', 'All-rounder'),
  ('30000000-0000-4000-8000-000000000008', 'ITA-0001854', 'p-ranasinghe-1854', 'P. Ranasinghe', 'P.', 'Ranasinghe', 'Right hand', 'Right arm spin', 'Bowler')
on conflict (id) do nothing;

insert into public.team_memberships (id, player_id, team_id, start_on, shirt_number, is_primary) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '2026-01-01', 18, true),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '2026-01-01', 7, true),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '2026-01-01', 10, true),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '2026-01-01', 23, true),
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', '2026-01-01', 12, true),
  ('40000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000002', '2026-01-01', 8, true),
  ('40000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000002', '2026-01-01', 14, true),
  ('40000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000002', '2026-01-01', 22, true)
on conflict (id) do nothing;

insert into public.seasons (id, code, name, starts_on, ends_on) values
  ('50000000-0000-4000-8000-000000000001', '2027', '2027 Season', '2027-01-01', '2027-12-31')
on conflict (id) do nothing;

insert into public.venues (id, city_id, name, slug, address_text) values
  ('60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Napoli Demo Cricket Ground', 'napoli-demo-cricket-ground', 'Development fixture venue — replace with verified venue data')
on conflict (id) do nothing;

insert into public.competition_rulesets (
  id, name, version, description, balls_per_over, max_overs, playing_xi_size,
  innings_wicket_limit, free_hit_on_no_ball, consecutive_overs_by_same_bowler_allowed,
  max_overs_per_bowler, retirement_mode, additional_rules
) values (
  '70000000-0000-4000-8000-000000000001',
  'IPS DEMO T10 — NOT OFFICIAL',
  1,
  'Development ruleset only. Do not treat these values as approved IPS tournament rules.',
  6,
  10,
  7,
  6,
  true,
  false,
  2,
  'NONE',
  '{"project":"Project 1","official":false}'::jsonb
)
on conflict (id) do nothing;

insert into public.tournaments (
  id, season_id, city_id, ruleset_id, code, name, slug, format_label, status,
  squad_deadline, starts_at, ends_at, squad_size
) values (
  '80000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  'NAP-DEMO-2027',
  'Napoli Sandbox Cup 2027',
  'napoli-sandbox-cup-2027',
  'T10 development tournament',
  'READY',
  '2027-05-01 18:00:00+02',
  '2027-05-10 09:00:00+02',
  '2027-05-10 20:00:00+02',
  10
)
on conflict (id) do nothing;

insert into public.tournament_teams (id, tournament_id, team_id, status, confirmed_at) values
  ('90000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'CONFIRMED', timezone('utc', now())),
  ('90000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'CONFIRMED', timezone('utc', now()))
on conflict (id) do nothing;

insert into public.matches (
  id, tournament_id, match_code, match_number, home_team_id, away_team_id,
  venue_id, scheduled_at, stage, round_label, status
) values (
  'a0000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001',
  'NAP-DEMO-001',
  1,
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '60000000-0000-4000-8000-000000000001',
  '2027-05-10 10:00:00+02',
  'LEAGUE',
  'Demo Match 1',
  'READY'
)
on conflict (id) do nothing;

-- Keep future auto-generated codes above the deterministic demo range.
select setval('public.ips_player_code_seq', greatest((select last_value from public.ips_player_code_seq), 1854), true);

commit;
