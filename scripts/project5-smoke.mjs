import fs from 'node:fs';
const required=[
  'apps/controller/app/matches/[id]/page.tsx',
  'apps/controller/components/controller-match.tsx',
  'apps/web/app/manage/tournaments/[id]/page.tsx',
  'database/PROJECT5_CONTROLLER_IMPORT.sql'
];
let failed=false;
for(const f of required){const ok=fs.existsSync(new URL(`../${f}`,import.meta.url));console.log(ok?'✓':'✗',f);if(!ok)failed=true;}
if(failed)process.exit(1);
console.log('Project 5 filesystem smoke check passed.');
