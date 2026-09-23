import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';

export const dynamic='force-dynamic';

export async function GET(request:NextRequest){
  const q=(request.nextUrl.searchParams.get('q')??'').trim();
  const activeOnly=request.nextUrl.searchParams.get('active')==='1';
  const limit=Math.max(1,Math.min(Number(request.nextUrl.searchParams.get('limit')??12)||12,30));
  if(!activeOnly && q.length<2){
    return NextResponse.json({cities:[]});
  }
  const supabase=await createClient();
  const {data,error}=activeOnly && !q
    ? await supabase.rpc('ips_active_cities',{p_limit:limit})
    : await supabase.rpc('ips_search_cities',{p_query:q||null,p_limit:limit,p_active_only:activeOnly});
  if(error)return NextResponse.json({error:error.message,cities:[]},{status:500});
  return NextResponse.json({cities:data??[]});
}
