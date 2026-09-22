import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing Supabase URL/key environment variables.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const tables = ['tournament_squads','tournament_squad_players','squad_change_requests','match_official_assignments'];
let failed = false;
for (const table of tables) {
  const { error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error && !['PGRST301','42501'].includes(error.code)) {
    failed = true;
    console.error(`${table}: ${error.code ?? ''} ${error.message}`);
  } else {
    console.log(`${table}: reachable`);
  }
}
if (failed) process.exit(1);
console.log('Project 4 schema smoke check passed.');
