import fs from 'node:fs';
const required=[
  'apps/web/app/manage/page.tsx',
  'apps/web/app/manage/tournaments/new/page.tsx',
  'apps/web/app/manage/clubs/page.tsx',
  'apps/web/app/manage/clubs/new/page.tsx',
  'apps/web/app/manage/clubs/[id]/page.tsx',
  'apps/web/app/manage/teams/page.tsx',
  'apps/web/app/manage/teams/new/page.tsx',
  'apps/web/app/manage/teams/[id]/page.tsx',
  'apps/web/app/manage/teams/[id]/players/add/page.tsx',
  'apps/web/app/manage/players/page.tsx',
  'apps/web/app/manage/players/[id]/page.tsx',
  'apps/web/app/claim-player/page.tsx',
  'apps/web/app/manage/registry/actions.ts',
  'database/PROJECT5_2_REGISTRY_MANAGEMENT.sql',
  'database/migrations/0008_project5_2_player_photo_rpc.sql',
  'database/migrations/0009_project5_2_helper_execute_hardening.sql'
];
let failed=false;
for(const f of required){const ok=fs.existsSync(new URL(`../${f}`,import.meta.url));console.log(ok?'✓':'✗',f);if(!ok)failed=true;}
const actions=fs.readFileSync(new URL('../apps/web/app/manage/registry/actions.ts',import.meta.url),'utf8');
for(const token of ['ips_create_player_for_team','ips_set_player_profile_image']){const ok=actions.includes(token);console.log(ok?'✓':'✗',`action ${token}`);if(!ok)failed=true;}
const addPlayer=fs.readFileSync(new URL('../apps/web/app/manage/teams/[id]/players/add/page.tsx',import.meta.url),'utf8');
const searchReady=addPlayer.includes('ips_registry_player_search')&&addPlayer.includes('Search before creating');
console.log(searchReady?'✓':'✗','search-before-create player flow'); if(!searchReady)failed=true;
const auth=fs.readFileSync(new URL('../apps/web/components/auth/auth-form.tsx',import.meta.url),'utf8');
const phoneReady=auth.includes('NEXT_PUBLIC_PHONE_AUTH_ENABLED')&&auth.includes('signInWithOtp')&&auth.includes("type: 'sms'");
console.log(phoneReady?'✓':'✗','phone OTP flow feature-gated'); if(!phoneReady)failed=true;
if(failed)process.exit(1);
console.log('Project 5.2 filesystem smoke check passed.');
