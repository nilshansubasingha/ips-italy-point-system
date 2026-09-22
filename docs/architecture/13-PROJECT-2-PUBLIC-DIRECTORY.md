# Project 2 — Database-driven public sports directory

## Objective
Replace Project 1's hard-coded public demo content with canonical data read from the IPS central database.

## Built in Project 2
- Database-driven home page.
- National Match Centre with Live / Yet to Play / Finished and city filtering.
- Canonical club directory and `/clubs/[slug]` pages.
- Permanent player directory and `/players/[slug]` pages.
- Tournament directory and `/tournaments/[slug]` pages.
- City hubs at `/cities/[code]`.
- Team membership history shown from `team_memberships`.
- Tournament ruleset summary shown from `competition_rulesets`.
- Project 1 database health page retained.
- Public read path uses only the Supabase publishable/anon key; no service-role key is used in the web app.

## Source-of-truth rule
No club, team, player, tournament or fixture displayed by these pages is hard-coded in the React pages. The public site reads Project 1's central records.

## Deliberately not built yet
- Authentication and write/admin interfaces (Project 3).
- Tournament applications, squad locking and Playing XI (Project 4).
- Fixture-to-controller import (Project 5).
- Ball-by-ball scoring or live score projection (Projects 6–7).
- Official career statistics, points tables, rankings, records or generated media.

Those sections appear only as clearly labelled future/empty areas. No fake sports statistics are introduced.
