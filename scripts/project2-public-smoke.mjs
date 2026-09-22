import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile(path.resolve('apps/web/.env.local'));
loadEnvFile(path.resolve('.env.local'));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Configure apps/web/.env.local first.');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const checks = [
  ['cities', 'name'], ['clubs', 'name'], ['teams', 'name'], ['players', 'display_name'],
  ['tournaments', 'name'], ['v_fixture_context', 'scheduled_at'],
];
console.log('IPS Project 2 public-directory smoke test');
for (const [relation, order] of checks) {
  const { data, error } = await db.from(relation).select('*').order(order, { ascending: true }).limit(50);
  if (error) {
    console.error(`✗ ${relation}: ${error.message}`);
    process.exit(1);
  }
  console.log(`✓ ${relation}: ${data?.length ?? 0} readable records`);
}
console.log('Project 2 public directory data is readable.');
