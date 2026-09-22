# Project 1 — Acceptance Criteria

Project 1 is complete when all of the following are true:

- [ ] A city can exist independently and be referenced by clubs, venues and tournaments.
- [ ] A club belongs to exactly one city.
- [ ] A team belongs to a canonical club.
- [ ] A player has one permanent UUID + unique public `ITA-xxxxxxx` code.
- [ ] Changing a player's team does not change the player identity.
- [ ] Team membership history can preserve former and current memberships.
- [ ] A season and tournament can be created.
- [ ] A tournament references one explicit versioned ruleset.
- [ ] Teams can be registered/confirmed in a tournament.
- [ ] A fixture can only use teams registered to that tournament.
- [ ] The fixture read model resolves tournament/city/venue/team/ruleset context.
- [ ] Anonymous/public reads cannot modify core data.
- [ ] `npm run db:smoke` passes after Supabase is configured.
- [ ] `/dev/database` displays database health and fixture context.

## Explicitly not required yet

- authentication or role management
- tournament applications UI
- locked squad snapshots
- Playing XI selection
- scoring
- realtime
- PRISM integration
- certification
- statistics / points / NRR
- rankings
- records
- Media Studio

Those remain later independent projects rather than being silently folded into Project 1.
