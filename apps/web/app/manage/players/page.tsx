export const dynamic='force-dynamic'; export const revalidate=0;
import Link from 'next/link';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {requireAccount,hasManagementRole} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {PlayerAvatar} from '@/components/identity';
import {ConfirmSubmitButton} from '@/components/manage/confirm-submit-button';
import {deletePlayer} from '../registry/actions';

export default async function ManagePlayersPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const account=await requireAccount(); if(!hasManagementRole(account))return null; const sp=await searchParams; const q=typeof sp.q==='string'?sp.q.trim():''; const error=typeof sp.error==='string'?sp.error:null; const ok=typeof sp.ok==='string'?sp.ok:null; const supabase=await createClient(); const {data,error:registryError}=await supabase.rpc('ips_registry_players',{p_query:q||null}); const players=(data??[]) as any[];
 const linked=players.filter(p=>p.has_account).length; const withTeam=players.filter(p=>p.team_id).length;
 const canGlobalDelete=account.grants.some(g=>(g.role==='OWNER'&&g.scope_type==='GLOBAL')||(g.role==='ADMIN'&&g.scope_type==='GLOBAL'));

 return <main className="shell sports-shell"><SiteHeader/><ManagementNav account={account} active="players"/><section className="manage-titlebar"><div><span className="eyebrow">PLAYER REGISTRY</span><h1>Permanent identities</h1><p>Players are created once, then linked to teams, tournaments, accounts and future statistics without changing their IPS identity.</p></div></section>
 {(registryError||error||ok)&&<div className={'ops-message '+((registryError||error)?'error':'success')}>{registryError?.message||error||ok}</div>}
 <section className="ops-kpi-strip"><article><span>Visible registry</span><strong>{players.length}</strong><small>players in your scope</small></article><article><span>On a team</span><strong>{withTeam}</strong><small>active membership</small></article><article><span>Claimed account</span><strong>{linked}</strong><small>linked users</small></article><article><span>Identity model</span><strong>ITA</strong><small>permanent codes</small></article></section>
 <section className="management-surface"><div className="surface-head registry-head"><div><span className="eyebrow">REGISTRY</span><h2>Players</h2></div><form className="registry-search compact" method="get"><input name="q" defaultValue={q} placeholder="Search name or ITA ID"/><button>Search</button></form></div>
  <div className="player-registry-table">{players.map(p=><article className="player-registry-row player-registry-admin-row" key={p.id}>
    <Link href={'/manage/players/'+(p.slug??p.id)} className="player-registry-person-link">
      <PlayerAvatar name={p.display_name} imageUrl={p.profile_image_url}/>
      <div className="player-registry-name"><h3>{p.display_name}</h3><span>{p.ips_code} · {p.primary_role||'Player'}</span></div>
    </Link>
    <div><span>TEAM</span><b>{p.team_name||'Unattached'}</b><small>{p.club_name||'No Team'}</small></div>
    <div><span>ACCOUNT</span><b className={p.has_account?'good-text':''}>{p.has_account?'Claimed':'Not claimed'}</b><small>{p.city_name||'—'}</small></div>
    <div className="player-registry-actions">
      <Link href={'/manage/players/'+(p.slug??p.id)} aria-label={'Open '+p.display_name}>Open →</Link>
      {canGlobalDelete&&<form action={deletePlayer}>
        <input type="hidden" name="player_id" value={p.id}/>
        <ConfirmSubmitButton className="registry-delete-button" message={'Delete '+p.display_name+' ('+p.ips_code+')? This permanently removes the player identity, memberships and private contacts. Tournament or match history is protected and will block deletion.'}>Delete</ConfirmSubmitButton>
      </form>}
    </div>
  </article>)}</div>
  {!players.length&&<div className="sports-empty"><strong>No players in this scope.</strong><p>Add players through a team's roster so duplicate checking runs first.</p></div>}
 </section><SiteFooter/></main>;
}
