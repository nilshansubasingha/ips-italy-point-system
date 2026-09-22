import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve('apps/web/.env.local'));
loadEnvFile(path.resolve('.env.local'));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL and a publishable/anon key.');
  console.error('Copy apps/web/.env.example to apps/web/.env.local and add the Supabase values.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const tables = ['cities','clubs','teams','players','team_memberships','seasons','venues','competition_rulesets','tournaments','tournament_teams','matches'];

console.log('IPS Project 1 database smoke test');
for (const table of tables) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    console.error(`✗ ${table}: ${error.message}`);
    process.exit(1);
  }
  console.log(`✓ ${table}: ${count ?? 0}`);
}

const { data, error } = await supabase.from('v_fixture_context').select('*').limit(1).maybeSingle();
if (error) {
  console.error(`✗ fixture context: ${error.message}`);
  process.exit(1);
}
console.log('✓ fixture context:', data ? `${data.match_code}: ${data.home_team_name} vs ${data.away_team_name}` : 'no fixture yet');
console.log('Project 1 smoke test passed.');
