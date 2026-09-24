export const dynamic='force-dynamic';
export const revalidate=0;

import {redirect} from 'next/navigation';
import {SiteFooter,SiteHeader} from '@/components/site-header';
import {ManagementNav} from '@/components/manage/manage-nav';
import {ConfirmSubmitButton} from '@/components/manage/confirm-submit-button';
import {requireAccount} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {createRankingDefinition,deleteRankingDefinition,updateRankingDefinition} from './actions';

function isGlobalCatalogueAdmin(account:Awaited<ReturnType<typeof requireAccount>>){
  return account.grants.some(grant=>
    (grant.role==='OWNER'&&grant.scope_type==='GLOBAL')
    || (grant.role==='ADMIN'&&grant.scope_type==='GLOBAL')
  );
}

function columnLabels(columns:any){
  return Array.isArray(columns)?columns.map(column=>String(column?.label??'').trim()).filter(Boolean).join(', '):'';
}

export default async function ManageRankingsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const account=await requireAccount();
  if(!isGlobalCatalogueAdmin(account))redirect('/manage');

  const sp=await searchParams;
  const error=typeof sp.error==='string'?sp.error:null;
  const ok=typeof sp.ok==='string'?sp.ok:null;
  const supabase=await createClient();
  const {data:definitions,error:loadError}=await supabase
    .from('ranking_definitions')
    .select('*')
    .order('section',{ascending:true})
    .order('sort_order',{ascending:true});

  return <main className="shell sports-shell">
    <SiteHeader/>
    <ManagementNav account={account} active="rankings"/>

    <section className="manage-titlebar">
      <div>
        <span className="eyebrow">RANKING CATALOGUE</span>
        <h1>Configure leaderboards</h1>
        <p>Control which rankings appear publicly without rebuilding IPS. Titles, visible columns, order, section and data-source keys live in the database.</p>
      </div>
    </section>

    {(error||ok||loadError)&&<div className={'ops-message '+((error||loadError)?'error':'success')}>{loadError?.message||error||ok}</div>}

    <section className="ranking-admin-intro">
      <article>
        <span>DISPLAY</span>
        <strong>Fully configurable</strong>
        <small>Rename, reorder, add, remove or hide leaderboards and change their visible columns.</small>
      </article>
      <article>
        <span>DATA</span>
        <strong>Scorer-driven</strong>
        <small>The source key connects the display definition to a certified statistic supplied by Project 6.</small>
      </article>
      <article>
        <span>SAFETY</span>
        <strong>No arbitrary SQL</strong>
        <small>Admins configure presentation and supported statistic sources without executing database formulas from the UI.</small>
      </article>
    </section>

    <section className="ranking-admin-layout">
      <div className="ranking-admin-list">
        <div className="sports-section-head">
          <div><span className="eyebrow">CURRENT LEADERBOARDS</span><h2>{definitions?.length??0} definitions</h2></div>
          <a href="/rankings" className="button-secondary" target="_blank" rel="noreferrer">Open public rankings ↗</a>
        </div>

        {(definitions??[]).map((definition:any)=><details className="ranking-definition-card" key={definition.id}>
          <summary>
            <div>
              <span>{definition.section} · ORDER {definition.sort_order}</span>
              <strong>{definition.title}</strong>
              <small>{definition.ranking_key} · source: {definition.source_key}</small>
            </div>
            <b className={definition.enabled?'enabled':'disabled'}>{definition.enabled?'VISIBLE':'HIDDEN'}</b>
          </summary>

          <form action={updateRankingDefinition} className="ranking-definition-form">
            <input type="hidden" name="id" value={definition.id}/>
            <div className="form-split">
              <label><span>Title</span><input name="title" defaultValue={definition.title} required/></label>
              <label><span>Data source key</span><input name="source_key" defaultValue={definition.source_key} required/><small>Project 6/stat engine identifier.</small></label>
            </div>
            <div className="form-split ranking-admin-three">
              <label><span>Section</span><select name="section" defaultValue={definition.section}><option value="PRIMARY">Primary</option><option value="MILESTONE">Milestone</option></select></label>
              <label><span>Sort</span><select name="sort_direction" defaultValue={definition.sort_direction}><option value="DESC">Highest first</option><option value="ASC">Lowest / fastest first</option></select></label>
              <label><span>Display order</span><input type="number" min="0" max="10000" name="sort_order" defaultValue={definition.sort_order}/></label>
            </div>
            <label><span>Visible columns</span><input name="columns" defaultValue={columnLabels(definition.columns)} required/><small>Comma separated. Example: Score (Balls), 4, 6</small></label>
            <label><span>Description / rule note</span><textarea name="description" defaultValue={definition.description??''} rows={3}/></label>
            <label className="ranking-enabled-toggle">
              <input type="checkbox" name="enabled" defaultChecked={definition.enabled}/>
              <span><b>Show publicly</b><small>Turn this off instead of deleting a leaderboard you may use again.</small></span>
            </label>
            <div className="ranking-definition-actions">
              <button className="button-primary">Save changes</button>
            </div>
          </form>

          <form action={deleteRankingDefinition} className="ranking-definition-delete">
            <input type="hidden" name="id" value={definition.id}/>
            <ConfirmSubmitButton className="registry-delete-button" message={'Remove the '+definition.title+' leaderboard definition? This removes only its display configuration; certified match data is not deleted.'}>Delete definition</ConfirmSubmitButton>
          </form>
        </details>)}

        {!definitions?.length&&<div className="sports-empty"><strong>No ranking definitions.</strong><p>Add the first leaderboard from the panel on the right.</p></div>}
      </div>

      <aside className="grant-create-card ranking-create-card">
        <span className="eyebrow light">NEW LEADERBOARD</span>
        <h2>Add ranking</h2>
        <p className="grant-intro">Create another leaderboard without changing the public Rankings page code.</p>

        <form action={createRankingDefinition} className="ranking-create-form">
          <label><span>Title</span><input name="title" placeholder="Fastest century" required/></label>
          <label><span>Ranking key</span><input name="ranking_key" placeholder="auto-from-title"/><small>Optional stable URL/config key.</small></label>
          <label><span>Data source key</span><input name="source_key" placeholder="fastest_century" required/><small>The scorer/stat engine will publish values under this source.</small></label>
          <div className="form-split">
            <label><span>Section</span><select name="section"><option value="PRIMARY">Primary</option><option value="MILESTONE">Milestone</option></select></label>
            <label><span>Sort</span><select name="sort_direction"><option value="DESC">Highest first</option><option value="ASC">Lowest / fastest first</option></select></label>
          </div>
          <label><span>Visible columns</span><input name="columns" placeholder="Score (Balls), 4, 6" required/><small>Comma separated. IPS creates stable column keys automatically.</small></label>
          <label><span>Display order</span><input type="number" min="0" max="10000" name="sort_order" defaultValue="200"/></label>
          <label><span>Description / rule note</span><textarea name="description" rows={4} placeholder="How this leaderboard should be understood…"/></label>
          <label className="ranking-enabled-toggle">
            <input type="checkbox" name="enabled" defaultChecked/>
            <span><b>Show publicly</b><small>You can create it hidden and enable it later.</small></span>
          </label>
          <button className="button-primary">Add leaderboard</button>
        </form>
      </aside>
    </section>

    <SiteFooter/>
  </main>;
}
