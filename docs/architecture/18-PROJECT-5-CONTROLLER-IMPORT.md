# Project 5 — Official Fixture → Match Controller

## Objective
Prove that the IPS Match Controller opens a selected central fixture and receives official match metadata without duplicate entry.

## Source of truth
The Controller is read-only with respect to match preparation. Tournament data, locked squads, Playing XI, team roles, scorer assignment and rules remain central IPS records.

## New match-preparation records
- `match_playing_xi`
- `match_team_roles`

Playing XI is deliberately separate from the tournament squad. A tournament squad may be larger than the number of players participating in one fixture.

## Controller access
`ips_controller_available_matches()` returns only matches the current account may score/manage. `ips_controller_match_context(match_id)` checks the same backend permissions and returns one coherent JSON snapshot.

## Readiness gate
The Project 5 Controller marks a fixture ready only when both sides have:
- locked/effectively locked tournament squad
- exact ruleset Playing XI size
- captain
- wicketkeeper

Project 5 does not save cricket events. Scoring controls remain disabled until Project 6.

## Custom tournament catalogues
Owner / Global Admin may quick-add:
- cities
- seasons
- versioned rulesets

Canonical entities such as teams and players are not converted into arbitrary free-text dropdown options; they keep permanent identities.
