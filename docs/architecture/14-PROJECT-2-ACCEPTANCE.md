# Project 2 acceptance checklist

- [ ] `npm run dev` starts web/controller/overlay without port conflicts.
- [ ] `/dev/database` shows CONNECTED.
- [ ] `/` counts and cards reflect Supabase rows rather than hard-coded arrays.
- [ ] `/clubs` lists canonical clubs from `clubs`.
- [ ] Clicking a club opens `/clubs/[slug]` and its active players derive from memberships.
- [ ] `/players` lists permanent player identities and IPS codes.
- [ ] Clicking a player preserves the same player ID/profile and shows membership history.
- [ ] `/tournaments` lists central tournaments.
- [ ] Tournament page shows registered teams, versioned ruleset and its fixtures.
- [ ] `/match-centre` can filter the same fixture data by city and state.
- [ ] City hub links clubs/players/tournaments/fixtures through one city record.
- [ ] No fake rankings, score totals, career stats or records are shown.
- [ ] `npm run public:smoke` passes with the configured Supabase project.
