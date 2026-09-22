import { createClient } from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if(!url||!key){console.error('Missing NEXT_PUBLIC_SUPABASE_URL / publishable key.');process.exit(1)}
const sb=createClient(url,key,{auth:{persistSession:false}});
const {data:t,error:te}=await sb.from('tournaments').select('id,name,players_per_side,overs_per_innings,balls_per_over,wicket_limit,registration_mode').limit(3);
if(te){console.error('Tournament defaults check failed:',te.message);process.exit(1)}
const {data:m,error:me}=await sb.from('matches').select('id,match_code,format_players_per_side,format_overs_per_innings,format_balls_per_over,format_source').limit(3);
if(me){console.error('Match snapshot check failed:',me.message);process.exit(1)}
console.log('Project 5.1 tournament defaults:',t);
console.log('Project 5.1 match snapshots:',m);
