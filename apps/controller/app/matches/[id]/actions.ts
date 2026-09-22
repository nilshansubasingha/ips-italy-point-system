'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function s(form:FormData,key:string){return String(form.get(key)??'').trim();}
function n(form:FormData,key:string){const raw=s(form,key); if(!raw)return null; const value=Number(raw); return Number.isFinite(value)?value:null;}

export async function overrideMatchFormat(form:FormData){
  const matchId=s(form,'match_id');
  try{
    const supabase=await createClient();
    const {error}=await supabase.rpc('ips_override_match_format',{
      p_match_id:matchId,
      p_players_per_side:n(form,'players_per_side'),
      p_overs_per_innings:n(form,'overs_per_innings'),
      p_balls_per_over:n(form,'balls_per_over'),
      p_wicket_limit:n(form,'wicket_limit'),
      p_max_overs_per_bowler:n(form,'max_overs_per_bowler'),
      p_reason:s(form,'reason')||null,
    });
    if(error)throw error;
    revalidatePath(`/matches/${matchId}`);
    redirect(`/matches/${matchId}?ok=${encodeURIComponent('Match format override saved and audited.')}`);
  }catch(e:any){
    redirect(`/matches/${matchId}?error=${encodeURIComponent(e?.message||'Could not override match format.')}`);
  }
}
