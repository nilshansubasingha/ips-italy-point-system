import fs from 'node:fs';
import path from 'node:path';
const src=path.resolve('apps/web/.env.local');
const dst=path.resolve('apps/controller/.env.local');
if(fs.existsSync(src)){
  const text=fs.readFileSync(src,'utf8');
  const wanted=text.split(/\r?\n/).filter(line=>/^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY)=/.test(line));
  wanted.push('NEXT_PUBLIC_IPS_WEB_URL=http://localhost:3000');
  fs.writeFileSync(dst,wanted.join('\n')+'\n');
  console.log('[IPS] Synced public Supabase environment to Match Controller.');
}
