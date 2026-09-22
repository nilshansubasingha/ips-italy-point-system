# Project 1 — Central IPS Domain

## Objective

Create the first real central source of truth for IPS identity, organisations, competitions and fixtures without prematurely building live scoring, authentication or statistics.

## Domain implemented

```text
City
 └─ Club
     └─ Team
         └─ Team Membership ── Player (permanent IPS identity)

Season
 └─ Tournament ── Competition Ruleset (versioned)
     ├─ Tournament Team ── Team
     └─ Match / Fixture
          ├─ Home Team (must be registered in tournament)
          ├─ Away Team (must be registered in tournament)
          └─ Venue ── City
```

## Identity decision

The database primary key for a player is a UUID. The human-facing permanent code is a separate unique value such as `ITA-0001847`.

This prevents a public numbering format from becoming a fragile database relationship while still giving players a stable IPS identity. A database trigger prevents an existing player's `ips_code` from being changed.

## Team history

A player's club/team history is stored as membership rows with start/end dates. Moving to another team does **not** update the player identity or erase the old membership.

## Fixture integrity

A fixture cannot reference arbitrary teams. Both home and away teams are constrained against `(tournament_id, team_id)` in `tournament_teams`.

That prevents a common data-integrity failure where a match accidentally contains a team that never entered that tournament.

## Rulesets

Tournament rules are versioned data, not controller hard-coding. Project 1 stores structural rules such as:

- balls per over
- maximum overs
- Playing XI size
- innings wicket limit
- free-hit setting
- consecutive-over restriction
- maximum overs per bowler
- retirement threshold/mode
- tournament points values
- extension JSON for future competition-specific rules

The demo ruleset is explicitly labelled `NOT OFFICIAL`. We have **not** frozen actual Italian softball competition rules in this project.

## Fixture context view

`v_fixture_context` creates the first stable read boundary for future controller import. It already resolves tournament, city, teams, venue and ruleset from one match ID.

It deliberately does not contain squad snapshots, Playing XI, scorer assignment or sponsor configuration yet because those are later projects.
