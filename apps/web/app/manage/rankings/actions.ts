'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';

function s(form:FormData,key:string){
  return String(form.get(key)??'').trim();
}

function isGlobalCatalogueAdmin(account:Awaited<ReturnType<typeof requireAccount>>){
  return account.grants.some(grant=>
    (grant.role==='OWNER'&&grant.scope_type==='GLOBAL')
    || (grant.role==='ADMIN'&&grant.scope_type==='GLOBAL')
  );
}

function normalizeKey(value:string){
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'_')
    .replace(/^_+|_+$/g,'')
    .replace(/_+/g,'_');
}

function rankingKey(value:string){
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .replace(/-+/g,'-');
}

function columnKey(label:string){
  const normalized=label.trim().toLowerCase();
  const aliases:Record<string,string>={
    'sr':'sr',
    'strike rate':'sr',
    'awards':'awards',
    'points':'points',
    'best':'best_figures',
    'best figures':'best_figures',
    'score (balls)':'score_balls',
    'score/balls':'score_balls',
    '4':'fours',
    '4s':'fours',
    'fours':'fours',
    '6':'sixes',
    '6s':'sixes',
    'sixes':'sixes',
    '50s':'fifties',
    'fifties':'fifties',
    'hat-tricks':'hat_tricks',
    'hat tricks':'hat_tricks'
  };
  return aliases[normalized]??normalizeKey(label);
}

function parseColumns(value:string){
  const labels=value
    .split(',')
    .map(label=>label.trim())
    .filter(Boolean)
    .slice(0,8);

  if(!labels.length)throw new Error('Add at least one visible statistic column.');

  const used=new Set<string>();
  return labels.map(label=>{
    let key=columnKey(label)||'stat';
    let candidate=key;
    let suffix=2;
    while(used.has(candidate)){
      candidate=key+'_'+suffix;
      suffix+=1;
    }
    used.add(candidate);
    return {key:candidate,label:label.slice(0,32)};
  });
}

function errorMessage(error:any,fallback:string){
  if(String(error?.digest??'').startsWith('NEXT_REDIRECT')||String(error?.message??'')==='NEXT_REDIRECT')throw error;
  return String(error?.message??fallback);
}

export async function createRankingDefinition(form:FormData){
  const account=await requireAccount();
  if(!isGlobalCatalogueAdmin(account))throw new Error('Global Owner/Admin access required.');
  const supabase=await createClient();

  try{
    const title=s(form,'title');
    const sourceKey=normalizeKey(s(form,'source_key'));
    const section=s(form,'section')==='MILESTONE'?'MILESTONE':'PRIMARY';
    const columns=parseColumns(s(form,'columns'));
    const sortDirection=s(form,'sort_direction')==='ASC'?'ASC':'DESC';
    const sortOrder=Math.max(0,Math.min(Number(s(form,'sort_order')||100)||100,10000));
    const enabled=form.get('enabled')==='on';
    const description=s(form,'description')||null;
    const key=rankingKey(s(form,'ranking_key')||title);

    if(title.length<2)throw new Error('Leaderboard title is required.');
    if(!sourceKey)throw new Error('Data source key is required.');
    if(!key)throw new Error('Leaderboard key could not be generated.');

    const {error}=await supabase.from('ranking_definitions').insert({
      ranking_key:key,
      title,
      source_key:sourceKey,
      section,
      columns,
      sort_direction:sortDirection,
      sort_order:sortOrder,
      description,
      enabled
    });
    if(error)throw error;

    revalidatePath('/rankings');
    revalidatePath('/manage/rankings');
    redirect('/manage/rankings?ok='+encodeURIComponent(title+' added.'));
  }catch(error:any){
    redirect('/manage/rankings?error='+encodeURIComponent(errorMessage(error,'Could not add ranking definition.')));
  }
}

export async function updateRankingDefinition(form:FormData){
  const account=await requireAccount();
  if(!isGlobalCatalogueAdmin(account))throw new Error('Global Owner/Admin access required.');
  const supabase=await createClient();

  try{
    const id=s(form,'id');
    const title=s(form,'title');
    const sourceKey=normalizeKey(s(form,'source_key'));
    const section=s(form,'section')==='MILESTONE'?'MILESTONE':'PRIMARY';
    const columns=parseColumns(s(form,'columns'));
    const sortDirection=s(form,'sort_direction')==='ASC'?'ASC':'DESC';
    const sortOrder=Math.max(0,Math.min(Number(s(form,'sort_order')||100)||100,10000));
    const enabled=form.get('enabled')==='on';
    const description=s(form,'description')||null;

    if(!id)throw new Error('Ranking definition not found.');
    if(title.length<2)throw new Error('Leaderboard title is required.');
    if(!sourceKey)throw new Error('Data source key is required.');

    const {error}=await supabase
      .from('ranking_definitions')
      .update({
        title,
        source_key:sourceKey,
        section,
        columns,
        sort_direction:sortDirection,
        sort_order:sortOrder,
        description,
        enabled,
        updated_at:new Date().toISOString()
      })
      .eq('id',id);
    if(error)throw error;

    revalidatePath('/rankings');
    revalidatePath('/manage/rankings');
    redirect('/manage/rankings?ok='+encodeURIComponent(title+' updated.'));
  }catch(error:any){
    redirect('/manage/rankings?error='+encodeURIComponent(errorMessage(error,'Could not update ranking definition.')));
  }
}

export async function deleteRankingDefinition(form:FormData){
  const account=await requireAccount();
  if(!isGlobalCatalogueAdmin(account))throw new Error('Global Owner/Admin access required.');
  const supabase=await createClient();

  try{
    const id=s(form,'id');
    if(!id)throw new Error('Ranking definition not found.');

    const {data:definition,error:readError}=await supabase
      .from('ranking_definitions')
      .select('title')
      .eq('id',id)
      .maybeSingle();
    if(readError)throw readError;
    if(!definition)throw new Error('Ranking definition not found.');

    const {error}=await supabase.from('ranking_definitions').delete().eq('id',id);
    if(error)throw error;

    revalidatePath('/rankings');
    revalidatePath('/manage/rankings');
    redirect('/manage/rankings?ok='+encodeURIComponent(definition.title+' removed.'));
  }catch(error:any){
    redirect('/manage/rankings?error='+encodeURIComponent(errorMessage(error,'Could not remove ranking definition.')));
  }
}
