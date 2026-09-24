import {NextRequest,NextResponse} from 'next/server';
import {getAccountContext,isOwner} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';

export const dynamic='force-dynamic';

type ProfileRow={
  id:string;
  display_name:string|null;
  full_name:string|null;
  email:string|null;
  phone:string|null;
  city_id:string|null;
  linked_player_id:string|null;
  status:string;
  created_at:string;
};

function unique(values:Array<string|null|undefined>):string[]{
  return Array.from(new Set(values.filter((value):value is string=>typeof value==='string'&&value.length>0)));
}

async function membershipPlayerIds(supabase:any,teamIds:string[]){
  const ids=unique(teamIds);
  if(!ids.length)return [] as string[];
  const {data,error}=await supabase
    .from('team_memberships')
    .select('player_id')
    .in('team_id',ids)
    .eq('status','ACTIVE')
    .is('end_on',null)
    .limit(250);
  if(error)throw error;
  return unique((data??[]).map((row:any)=>row.player_id));
}

async function profilesForPlayers(supabase:any,playerIds:string[]){
  const ids=unique(playerIds);
  if(!ids.length)return [] as ProfileRow[];
  const {data,error}=await supabase
    .from('profiles')
    .select('id,display_name,full_name,email,phone,city_id,linked_player_id,status,created_at')
    .in('linked_player_id',ids.slice(0,250))
    .limit(120);
  if(error)throw error;
  return (data??[]) as ProfileRow[];
}

export async function GET(request:NextRequest){
  const account=await getAccountContext();
  if(!account)return NextResponse.json({error:'Not authenticated',accounts:[]},{status:401});
  if(!isOwner(account))return NextResponse.json({error:'Owner access required',accounts:[]},{status:403});

  const params=request.nextUrl.searchParams;
  const rawQuery=(params.get('q')??'').trim();
  const q=rawQuery.replace(/[%_,()]/g,' ').replace(/\s+/g,' ').trim().slice(0,80);
  const cityId=(params.get('city_id')??'').trim();
  const clubId=(params.get('club_id')??'').trim();
  const teamId=(params.get('team_id')??'').trim();
  const linkedOnly=params.get('linked_only')==='1';
  const limit=Math.max(1,Math.min(Number(params.get('limit')??16)||16,24));

  if(q.length<2&&!cityId&&!clubId&&!teamId&&!linkedOnly){
    return NextResponse.json({accounts:[]});
  }

  const supabase=await createClient();

  try{
    const candidates=new Map<string,ProfileRow>();

    if(q.length>=2){
      const {data:profileMatches,error:profileError}=await supabase
        .from('profiles')
        .select('id,display_name,full_name,email,phone,city_id,linked_player_id,status,created_at')
        .or(`display_name.ilike.%${q}%,full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
        .order('created_at',{ascending:false})
        .limit(60);
      if(profileError)throw profileError;
      (profileMatches??[]).forEach((row:any)=>candidates.set(row.id,row as ProfileRow));

      const [{data:playerMatches,error:playerError},{data:clubMatches,error:clubError},{data:sideMatches,error:sideError}]=await Promise.all([
        supabase.from('players').select('id').or(`display_name.ilike.%${q}%,ips_code.ilike.%${q}%,given_name.ilike.%${q}%,family_name.ilike.%${q}%`).limit(60),
        supabase.from('clubs').select('id').ilike('name',`%${q}%`).limit(30),
        supabase.from('teams').select('id,club_id').ilike('name',`%${q}%`).limit(30)
      ]);
      if(playerError)throw playerError;
      if(clubError)throw clubError;
      if(sideError)throw sideError;

      const matchedClubIds=unique((clubMatches??[]).map((row:any)=>row.id));
      let clubSideIds:string[]=[];
      if(matchedClubIds.length){
        const {data,error}=await supabase.from('teams').select('id').in('club_id',matchedClubIds).limit(120);
        if(error)throw error;
        clubSideIds=unique((data??[]).map((row:any)=>row.id));
      }
      const nameMatchedSideIds=unique([...(sideMatches??[]).map((row:any)=>row.id),...clubSideIds]);
      const teamNamePlayerIds=await membershipPlayerIds(supabase,nameMatchedSideIds);
      const matchedPlayerIds=unique([...(playerMatches??[]).map((row:any)=>row.id),...teamNamePlayerIds]);
      const linkedProfiles=await profilesForPlayers(supabase,matchedPlayerIds);
      linkedProfiles.forEach(row=>candidates.set(row.id,row));
    }else{
      let filteredPlayerIds:string[]=[];

      if(teamId){
        filteredPlayerIds=await membershipPlayerIds(supabase,[teamId]);
      }else if(clubId){
        const {data,error}=await supabase.from('teams').select('id').eq('club_id',clubId).limit(120);
        if(error)throw error;
        filteredPlayerIds=await membershipPlayerIds(supabase,(data??[]).map((row:any)=>row.id));
      }else if(cityId){
        const {data:cityClubs,error:clubError}=await supabase.from('clubs').select('id').eq('city_id',cityId).limit(120);
        if(clubError)throw clubError;
        const cityClubIds=unique((cityClubs??[]).map((row:any)=>row.id));
        if(cityClubIds.length){
          const {data:citySides,error:sideError}=await supabase.from('teams').select('id').in('club_id',cityClubIds).limit(250);
          if(sideError)throw sideError;
          filteredPlayerIds=await membershipPlayerIds(supabase,(citySides??[]).map((row:any)=>row.id));
        }

        const {data:cityProfiles,error:cityProfileError}=await supabase
          .from('profiles')
          .select('id,display_name,full_name,email,phone,city_id,linked_player_id,status,created_at')
          .eq('city_id',cityId)
          .order('created_at',{ascending:false})
          .limit(80);
        if(cityProfileError)throw cityProfileError;
        (cityProfiles??[]).forEach((row:any)=>candidates.set(row.id,row as ProfileRow));
      }

      const linkedProfiles=await profilesForPlayers(supabase,filteredPlayerIds);
      linkedProfiles.forEach(row=>candidates.set(row.id,row));

      if(linkedOnly&&!cityId&&!clubId&&!teamId){
        const {data,error}=await supabase
          .from('profiles')
          .select('id,display_name,full_name,email,phone,city_id,linked_player_id,status,created_at')
          .not('linked_player_id','is',null)
          .order('created_at',{ascending:false})
          .limit(60);
        if(error)throw error;
        (data??[]).forEach((row:any)=>candidates.set(row.id,row as ProfileRow));
      }
    }

    const profileRows=Array.from(candidates.values()).slice(0,120);
    const linkedPlayerIds=unique(profileRows.map(row=>row.linked_player_id).filter(Boolean) as string[]);

    const playerRows=linkedPlayerIds.length
      ? (await supabase.from('players').select('id,display_name,ips_code,primary_role,status').in('id',linkedPlayerIds)).data??[]
      : [];
    const playerMap=new Map((playerRows as any[]).map(row=>[row.id,row]));

    const membershipRows=linkedPlayerIds.length
      ? (await supabase.from('team_memberships').select('player_id,team_id,is_primary,start_on').in('player_id',linkedPlayerIds).eq('status','ACTIVE').is('end_on',null)).data??[]
      : [];

    const membershipByPlayer=new Map<string,any>();
    (membershipRows as any[])
      .sort((a,b)=>Number(b.is_primary)-Number(a.is_primary)||String(b.start_on).localeCompare(String(a.start_on)))
      .forEach(row=>{if(!membershipByPlayer.has(row.player_id))membershipByPlayer.set(row.player_id,row);});

    const membershipTeamIds=unique(Array.from(membershipByPlayer.values()).map((row:any)=>row.team_id));
    const teamRows=membershipTeamIds.length
      ? (await supabase.from('teams').select('id,club_id,name,side_label').in('id',membershipTeamIds)).data??[]
      : [];
    const teamMap=new Map((teamRows as any[]).map(row=>[row.id,row]));

    const clubIds=unique((teamRows as any[]).map(row=>row.club_id));
    const clubRows=clubIds.length
      ? (await supabase.from('clubs').select('id,city_id,name').in('id',clubIds)).data??[]
      : [];
    const clubMap=new Map((clubRows as any[]).map(row=>[row.id,row]));

    const cityIds=unique([
      ...profileRows.map(row=>row.city_id).filter(Boolean),
      ...(clubRows as any[]).map(row=>row.city_id).filter(Boolean)
    ] as string[]);
    const cityRows=cityIds.length
      ? (await supabase.from('cities').select('id,name,province_abbr,region').in('id',cityIds)).data??[]
      : [];
    const cityMap=new Map((cityRows as any[]).map(row=>[row.id,row]));

    const accounts=profileRows.map(profile=>{
      const player=profile.linked_player_id?playerMap.get(profile.linked_player_id):null;
      const membership=profile.linked_player_id?membershipByPlayer.get(profile.linked_player_id):null;
      const side=membership?teamMap.get(membership.team_id):null;
      const club=side?clubMap.get(side.club_id):null;
      const city=club?cityMap.get(club.city_id):profile.city_id?cityMap.get(profile.city_id):null;
      return {
        id:profile.id,
        display_name:profile.display_name??profile.full_name??profile.email??'IPS account',
        full_name:profile.full_name,
        email:profile.email,
        phone:profile.phone,
        status:profile.status,
        linked_player:player?{
          id:player.id,
          display_name:player.display_name,
          ips_code:player.ips_code,
          primary_role:player.primary_role
        }:null,
        city:city?{id:city.id,name:city.name,province_abbr:city.province_abbr,region:city.region}:null,
        team:club?{id:club.id,name:String(club.name).replace(/\s+Cricket Club$/i,'')}:null,
        side:side?{id:side.id,name:side.name,side_label:side.side_label}:null,
        created_at:profile.created_at
      };
    }).filter(item=>{
      if(linkedOnly&&!item.linked_player)return false;
      if(teamId&&item.side?.id!==teamId)return false;
      if(clubId&&item.team?.id!==clubId)return false;
      if(cityId&&item.city?.id!==cityId)return false;
      return true;
    }).sort((a,b)=>{
      const aLinked=a.linked_player?1:0;
      const bLinked=b.linked_player?1:0;
      if(aLinked!==bLinked)return bLinked-aLinked;
      return a.display_name.localeCompare(b.display_name,'en',{sensitivity:'base'});
    }).slice(0,limit);

    return NextResponse.json({accounts});
  }catch(error:any){
    return NextResponse.json({error:String(error?.message??'Could not search accounts.'),accounts:[]},{status:500});
  }
}
