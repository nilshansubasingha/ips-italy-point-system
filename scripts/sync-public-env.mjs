import fs from 'node:fs';
import path from 'node:path';

const src=path.resolve('apps/web/.env.local');
const controllerDst=path.resolve('apps/controller/.env.local');
const overlayDst=path.resolve('apps/overlay/.env.local');

if(fs.existsSync(src)){
  const source=fs.readFileSync(src,'utf8');
  const publicSupabase=source
    .split(/\r?\n/)
    .filter(line=>/^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY)=/.test(line));

  const controller=[
    ...publicSupabase,
    'NEXT_PUBLIC_IPS_WEB_URL=http://localhost:3000',
    'NEXT_PUBLIC_IPS_OVERLAY_URL=http://localhost:3002'
  ];
  fs.writeFileSync(controllerDst,controller.join('\n')+'\n');

  fs.writeFileSync(overlayDst,publicSupabase.join('\n')+'\n');

  console.log('[IPS] Synced public Supabase environment to Match Controller and Broadcast Overlay.');
}
