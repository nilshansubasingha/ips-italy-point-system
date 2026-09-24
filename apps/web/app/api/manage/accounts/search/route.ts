import {NextRequest,NextResponse} from 'next/server';
import {canManageRoles,getAccountContext} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';

export const dynamic='force-dynamic';

export async function GET(request:NextRequest){
  const account=await getAccountContext();
  if(!account)return NextResponse.json({error:'Not authenticated',accounts:[],cities:[]},{status:401});
  if(!canManageRoles(account))return NextResponse.json({error:'Access management permission required',accounts:[],cities:[]},{status:403});

  const params=request.nextUrl.searchParams;
  const q=(params.get('q')??'').trim().replace(/\s+/g,' ').slice(0,80);
  const cityId=(params.get('city_id')??'').trim()||null;
  const limit=Math.max(1,Math.min(Number(params.get('limit')??16)||16,24));
  const supabase=await createClient();

  const [{data:accountRows,error:accountError},{data:cityRows,error:cityError}]=await Promise.all([
    supabase.rpc('ips_role_management_search',{
      p_query:q||null,
      p_city_id:cityId,
      p_limit:limit
    }),
    supabase.rpc('ips_role_management_cities',{
      p_query:q||null,
      p_limit:8
    })
  ]);

  if(accountError||cityError){
    return NextResponse.json({
      error:accountError?.message??cityError?.message??'Could not search access-management records.',
      accounts:[],
      cities:[]
    },{status:500});
  }

  const accounts=(accountRows??[]).map((row:any)=>({
    id:row.id,
    display_name:row.display_name,
    email:row.email,
    status:row.status,
    linked_player:row.linked_player_id?{
      id:row.linked_player_id,
      display_name:row.player_display_name,
      ips_code:row.ips_code,
      primary_role:row.primary_role
    }:null,
    city:row.city_id?{
      id:row.city_id,
      name:row.city_name,
      province_abbr:row.province_abbr,
      region:row.region
    }:null,
    team:row.club_id?{id:row.club_id,name:row.club_name}:null,
    side:row.team_id?{id:row.team_id,name:row.team_name,side_label:row.side_label}:null
  }));

  const cities=(cityRows??[]).map((row:any)=>({
    id:row.id,
    name:row.name,
    province_abbr:row.province_abbr,
    region:row.region
  }));

  return NextResponse.json({accounts,cities});
}
