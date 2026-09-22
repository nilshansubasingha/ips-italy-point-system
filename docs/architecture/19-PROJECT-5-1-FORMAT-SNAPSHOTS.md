# Project 5.1 — Tournament Match Defaults and Fixture Snapshots

Project 5.1 separates three levels that must not be confused:

1. **Ruleset template** — reusable cricket/softball rule defaults.
2. **Tournament effective match defaults** — players per side, overs, balls per over, wickets and bowler limits for this competition.
3. **Fixture snapshot** — the exact match format copied when a fixture is created.

A later edit to a tournament does not retroactively rewrite existing fixtures.

The Match Controller may create an audited match-specific override. Pre-match overrides are available to authorised match controllers. Once a match is LIVE, changing format requires tournament-admin authority plus a reason. Changes are blocked after completion.

The physical database table remains `match_playing_xi` for migration compatibility, but product terminology is **Playing Side** because IPS supports 6/7/8/10/11-a-side formats.
