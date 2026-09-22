# Project 1 — Supabase Setup

## 1. Create a Supabase project

Use one Supabase project for the IPS development environment. Production should eventually be a separate Supabase project/environment.

## 2. Run SQL in this order

Open Supabase -> SQL Editor and run:

```text
database/migrations/0001_project1_core_domain.sql
database/policies/0001_project1_public_read.sql
```

For development/testing only, then run:

```text
database/seeds/0001_project1_demo_data.sql
```

## 3. Add local environment values

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Do not add a service-role key to any `NEXT_PUBLIC_*` variable.

## 4. Start IPS

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000/dev/database
```

The page should show `CONNECTED`, table counts and the demo fixture context if the seed was installed.

## 5. Command-line smoke test

```bash
npm run db:smoke
```

The script performs read-only anonymous queries against every Project 1 table and `v_fixture_context`.

## 6. SQL acceptance checks

Optional deeper checks can be run in SQL Editor after the demo seed:

```text
database/tests/project1_acceptance.sql
```

They verify permanent player-code protection and tournament/team fixture isolation.
