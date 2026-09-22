# IPS Database — Project 1

Project 1 establishes the **central canonical identity + competition database**. It intentionally stops before squads, playing XI, scorer assignments, live match events, corrections, certification, statistics, rankings, records, and media generation.

## Run order in Supabase SQL Editor

1. `migrations/0001_project1_core_domain.sql`
2. `policies/0001_project1_public_read.sql`
3. Optional development data: `seeds/0001_project1_demo_data.sql`

The demo seed is clearly non-official and exists only to verify relationships and UI/database connectivity.

## Project 1 source-of-truth boundary

Canonical now:

- cities
- clubs
- teams
- players + permanent IPS player code
- team membership history
- seasons
- venues
- versioned competition rulesets
- tournaments
- tournament-team participation
- fixtures/matches

Not canonical yet because those modules are deliberately later projects:

- tournament squad snapshots
- playing XI
- scorer assignments / auth roles
- ball-by-ball events
- live score projections
- certification
- statistics / points / NRR
- rankings / records
- Media Studio

## Safety

Row Level Security is enabled. Project 1 contains public read policies but **no public write policies**. Scoped write permissions arrive in Project 3.

## Project 5
`PROJECT5_CONTROLLER_IMPORT.sql` adds Playing XI, team roles, controller-context RPCs and controlled custom city/season/ruleset creation. On the connected development Supabase project these migrations were already applied automatically.

## Project 5.1
`PROJECT5_1_TOURNAMENT_FORMAT.sql` adds tournament-level match defaults, frozen per-fixture format snapshots, audited Controller overrides, invite-only registration enforcement, maximum-team enforcement, and the Playing Side terminology layer. The connected development Supabase project in this conversation is already migrated through Project 5.1.
