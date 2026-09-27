import express from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const configPath=process.env.IPS_REPLAY_CONFIG||path.join(__dirname,'replay.config.json');
const config=JSON.parse(await fsp.readFile(configPath,'utf8'));
const port=Number(process.env.PORT||config.port||8787);
const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg';
const token=process.env.IPS_REPLAY_BRIDGE_TOKEN||config.token||'';
const bufferSeconds=Math.max(20,Number(config.bufferSeconds||60));
const videoBitrate=String(config.videoBitrate||'6M');
const cameras=Array.isArray(config.cameras)?config.cameras:[];
if(!cameras.length)throw new Error('No replay cameras configured in '+configPath);

const root=path.join(os.tmpdir(),'ips-replay');
const mediaDir=path.join(root,'media');
const clipsDir=path.join(root,'clips');
const savedDir=path.join(root,'saved');
for(const dir of [root,mediaDir,clipsDir,savedDir])await fsp.mkdir(dir,{recursive:true});

const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'1mb'}));
app.use((req,res,next)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, Access-Control-Request-Private-Network');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Private-Network','true');
  if(req.method==='OPTIONS')return res.status(204).end();
  next();
});

function auth(req,res,next){
  if(!token)return next();
  const supplied=String(req.headers.authorization||'');
  if(supplied==='Bearer '+token)return next();
  res.status(401).json({error:'Replay bridge token rejected.'});
}

const cameraMap=new Map(cameras.map(c=>[String(c.id),c]));
const processes=new Map();
const eventsByMatch=new Map();
const programClients=new Set();
let shuttingDown=false;
let program={
  mode:'LIVE',
  camera:String(config.programCamera||cameras[0].id),
  replayUrl:null,
  speed:1,
  matchId:null,
  clipId:null,
  title:null,
};

function absUrl(req,pathname){
  return req.protocol+'://'+req.get('host')+pathname;
}
function safeName(value){
  return String(value||'clip').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,80);
}
function broadcastProgram(){
  const payload='data: '+JSON.stringify(program)+'\n\n';
  for(const res of programClients){try{res.write(payload);}catch{}}
}
function livePath(cameraId){return '/media/'+encodeURIComponent(cameraId)+'/live.m3u8';}

function cameraArgs(camera){
  const outDir=path.join(mediaDir,String(camera.id));
  fs.mkdirSync(outDir,{recursive:true});
  const args=['-hide_banner','-loglevel','warning'];
  if(Array.isArray(camera.inputArgs))args.push(...camera.inputArgs.map(String));
  if(camera.inputFormat)args.push('-f',String(camera.inputFormat));
  args.push('-i',String(camera.input));
  args.push(
    '-map','0:v:0',
    '-an',
    '-c:v','libx264',
    '-preset','veryfast',
    '-tune','zerolatency',
    '-b:v',videoBitrate,
    '-maxrate',videoBitrate,
    '-bufsize','12M',
    '-pix_fmt','yuv420p',
    '-g','50',
    '-keyint_min','50',
    '-sc_threshold','0',
    '-f','hls',
    '-hls_time','1',
    '-hls_list_size',String(bufferSeconds),
    '-hls_flags','delete_segments+append_list+program_date_time+independent_segments',
    '-hls_segment_filename',path.join(outDir,'seg_%09d.ts'),
    path.join(outDir,'live.m3u8')
  );
  return args;
}

function startCamera(camera){
  const id=String(camera.id);
  const args=cameraArgs(camera);
  const child=spawn(ffmpeg,args,{stdio:['ignore','ignore','pipe']});
  const state={child,healthy:true,lastError:null,startedAt:Date.now()};
  processes.set(id,state);
  child.stderr.on('data',chunk=>{
    const line=String(chunk).trim();
    if(line)state.lastError=line.slice(-500);
  });
  child.on('exit',code=>{
    state.healthy=false;
    if(shuttingDown)return;
    console.error('[IPS Replay] camera '+id+' exited with code '+code+'. Restarting…');
    setTimeout(()=>startCamera(camera),1200).unref();
  });
  console.log('[IPS Replay] buffering '+id+' ('+(camera.name||id)+')');
}

function runFfmpeg(args){
  return new Promise((resolve,reject)=>{
    const child=spawn(ffmpeg,args,{stdio:['ignore','ignore','pipe']});
    let err='';
    child.stderr.on('data',c=>{err+=String(c);if(err.length>12000)err=err.slice(-12000);});
    child.on('error',reject);
    child.on('exit',code=>code===0?resolve():reject(new Error(err||('FFmpeg exited '+code))));
  });
}

async function parsePlaylist(cameraId){
  const file=path.join(mediaDir,cameraId,'live.m3u8');
  const text=await fsp.readFile(file,'utf8');
  const lines=text.split(/\r?\n/);
  const segments=[];
  let stamp=null;
  let duration=1;
  for(const raw of lines){
    const line=raw.trim();
    if(line.startsWith('#EXT-X-PROGRAM-DATE-TIME:'))stamp=Date.parse(line.slice(25));
    else if(line.startsWith('#EXTINF:'))duration=Number(line.slice(8).split(',')[0])||1;
    else if(line&& !line.startsWith('#')){
      const start=Number.isFinite(stamp)?stamp:null;
      const full=path.join(mediaDir,cameraId,line);
      segments.push({path:full,start,duration});
      if(start!=null)stamp=start+duration*1000;
    }
  }
  return segments;
}

async function waitForWindow(cameraId,from,to,timeoutMs=6500){
  const deadline=Date.now()+timeoutMs;
  let last=[];
  while(Date.now()<deadline){
    try{
      last=await parsePlaylist(cameraId);
      const timed=last.filter(x=>x.start!=null);
      if(timed.length){
        const newest=Math.max(...timed.map(x=>x.start+x.duration*1000));
        if(newest>=to)return timed;
      }
    }catch{}
    await new Promise(r=>setTimeout(r,350));
  }
  return last.filter(x=>x.start!=null);
}

async function buildClip({matchId,eventId,camera,beforeSeconds=7,afterSeconds=4,save=false}){
  if(!cameraMap.has(camera))throw new Error('Unknown camera '+camera);
  const list=eventsByMatch.get(matchId)||[];
  const event=list.find(e=>e.id===eventId);
  if(!event)throw new Error('Replay event not found.');
  const from=event.at-Math.max(1,Number(beforeSeconds))*1000;
  const to=event.at+Math.max(1,Number(afterSeconds))*1000;
  const segments=await waitForWindow(camera,from,to);
  const selected=segments.filter(s=>{
    const end=(s.start??0)+s.duration*1000;
    return s.start!=null&&end>=from&&s.start<=to;
  });
  if(!selected.length)throw new Error('Replay buffer does not contain the requested event window yet.');
  const base=safeName(matchId)+'_'+safeName(eventId)+'_'+safeName(camera)+'_'+Date.now();
  const outDir=save?path.join(savedDir,safeName(matchId)):clipsDir;
  await fsp.mkdir(outDir,{recursive:true});
  const listFile=path.join(root,base+'.txt');
  const output=path.join(outDir,base+'.mp4');
  const concat=selected.map(s=>"file '"+s.path.replaceAll("'","'\\''")+"'").join('\n');
  await fsp.writeFile(listFile,concat+'\n');
  try{
    await runFfmpeg(['-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',listFile,'-c','copy','-movflags','+faststart','-y',output]);
  }finally{
    await fsp.unlink(listFile).catch(()=>{});
  }
  const rel=save?'/saved/'+encodeURIComponent(safeName(matchId))+'/'+encodeURIComponent(path.basename(output)):'/clips/'+encodeURIComponent(path.basename(output));
  return {output,rel,event,segments:selected.length};
}

function rememberEvent(matchId,event){
  const list=eventsByMatch.get(matchId)||[];
  if(list.some(x=>x.id===event.id))return;
  list.unshift(event);
  eventsByMatch.set(matchId,list.slice(0,200));
}

for(const camera of cameras)startCamera(camera);

app.get('/status',auth,(req,res)=>{
  res.json({
    connected:true,
    program:program.mode,
    programCamera:program.camera,
    cameras:cameras.map(c=>String(c.id)),
    cameraDetails:cameras.map(c=>({id:String(c.id),name:c.name||String(c.id),healthy:processes.get(String(c.id))?.healthy!==false,lastError:processes.get(String(c.id))?.lastError||null})),
    recording:[...processes.values()].some(p=>p.healthy),
    bufferSeconds,
    programUrl:absUrl(req,'/program')
  });
});

app.get('/matches/:matchId/events',auth,(req,res)=>{
  res.json({events:eventsByMatch.get(req.params.matchId)||[]});
});
app.post('/matches/:matchId/events',auth,(req,res)=>{
  const body=req.body||{};
  const event={
    id:safeName(body.id||crypto.randomUUID()),
    kind:String(body.kind||'EVENT').toUpperCase(),
    ball:String(body.ball||body.label||''),
    at:Number(body.at)||Date.now()
  };
  rememberEvent(req.params.matchId,event);
  res.status(201).json({ok:true,event});
});

app.post('/replay/preview',auth,async(req,res)=>{
  try{
    const clip=await buildClip({...req.body,save:false});
    res.json({ok:true,previewUrl:absUrl(req,clip.rel),segments:clip.segments});
  }catch(e){res.status(409).json({error:e.message||'Could not build replay preview.'});}
});
app.post('/replay/save',auth,async(req,res)=>{
  try{
    const clip=await buildClip({...req.body,save:true});
    res.json({ok:true,previewUrl:absUrl(req,clip.rel),savedUrl:absUrl(req,clip.rel),segments:clip.segments});
  }catch(e){res.status(409).json({error:e.message||'Could not save replay clip.'});}
});
app.post('/program/replay',auth,async(req,res)=>{
  try{
    const clip=await buildClip({...req.body,save:false});
    program={
      mode:'REPLAY',
      camera:String(req.body.camera||program.camera),
      replayUrl:absUrl(req,clip.rel),
      speed:Number(req.body.speed)||1,
      matchId:String(req.body.matchId||''),
      clipId:String(req.body.eventId||''),
      title:clip.event.kind+(clip.event.ball?' · '+clip.event.ball:'')
    };
    broadcastProgram();
    res.json({ok:true,program:'REPLAY',previewUrl:program.replayUrl});
  }catch(e){res.status(409).json({error:e.message||'Could not take replay.'});}
});
app.post('/program/live',auth,(req,res)=>{
  if(req.body?.camera&&cameraMap.has(String(req.body.camera)))program.camera=String(req.body.camera);
  program={...program,mode:'LIVE',replayUrl:null,speed:1,clipId:null,title:null,matchId:req.body?.matchId||program.matchId};
  broadcastProgram();
  res.json({ok:true,program:'LIVE'});
});
app.post('/program/abort',auth,(req,res)=>{
  program={...program,mode:'LIVE',replayUrl:null,speed:1,clipId:null,title:null,matchId:req.body?.matchId||program.matchId};
  broadcastProgram();
  res.json({ok:true,program:'LIVE'});
});

app.get('/program/events',(req,res)=>{
  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Cache-Control','no-cache');
  res.setHeader('Connection','keep-alive');
  res.flushHeaders?.();
  programClients.add(res);
  res.write('data: '+JSON.stringify(program)+'\n\n');
  req.on('close',()=>programClients.delete(res));
});

app.use('/media',express.static(mediaDir,{fallthrough:false,maxAge:0}));
app.use('/clips',express.static(clipsDir,{fallthrough:false,maxAge:0}));
app.use('/saved',express.static(savedDir,{fallthrough:false,maxAge:0}));
app.use('/vendor/hls',express.static(path.join(__dirname,'node_modules','hls.js','dist'),{fallthrough:false,maxAge:'1d'}));

app.get('/program',(req,res)=>{
  const tokenLiteral=JSON.stringify(token);
  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IPS PROGRAM</title><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}video{width:100%;height:100%;object-fit:cover;background:#000}.bug{position:fixed;left:26px;top:24px;padding:7px 11px;background:rgba(3,8,11,.78);border-left:3px solid #ff4f5d;color:#fff;font:700 12px system-ui;letter-spacing:.08em;display:none}.bug span{margin-left:10px;color:#b8c6cc;font-size:10px}
</style><script src="/vendor/hls/hls.min.js"></script></head>
<body><video id="v" autoplay muted playsinline></video><div id="bug" class="bug">IPS REPLAY <span id="meta"></span></div>
<script>
const TOKEN=${tokenLiteral};
const v=document.getElementById('v'),bug=document.getElementById('bug'),meta=document.getElementById('meta');
let hls=null,current=null;
const headers=TOKEN?{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'}:{'Content-Type':'application/json'};
function src(url){
  if(hls){hls.destroy();hls=null}
  if(url.endsWith('.m3u8')&&window.Hls&&Hls.isSupported()){hls=new Hls({liveSyncDurationCount:2,maxLiveSyncPlaybackRate:1.2});hls.loadSource(url);hls.attachMedia(v)}
  else v.src=url;
}
async function apply(state){
  current=state;
  if(state.mode==='REPLAY'&&state.replayUrl){
    bug.style.display='block';meta.textContent=(state.title||'')+' · '+(state.speed||1)+'×';
    src(state.replayUrl);v.playbackRate=Number(state.speed)||1;try{await v.play()}catch{}
  }else{
    bug.style.display='none';v.playbackRate=1;src('/media/'+encodeURIComponent(state.camera)+'/live.m3u8');try{await v.play()}catch{}
  }
}
v.addEventListener('ended',()=>{if(current?.mode==='REPLAY')fetch('/program/live',{method:'POST',headers,body:JSON.stringify({matchId:current.matchId,camera:current.camera})}).catch(()=>{})});
fetch('/status',{headers:TOKEN?{Authorization:'Bearer '+TOKEN}:{}}).then(r=>r.json()).then(s=>apply({mode:s.program,camera:s.programCamera,replayUrl:null,speed:1})).catch(()=>{});
const es=new EventSource('/program/events');es.onmessage=e=>{try{apply(JSON.parse(e.data))}catch{}};
</script></body></html>`);
});

app.get('/health',(req,res)=>res.json({ok:true,cameras:cameras.length,program:program.mode}));

app.use((err,req,res,next)=>{
  console.error(err);
  if(res.headersSent)return next(err);
  res.status(500).json({error:err?.message||'Replay bridge error'});
});

const server=app.listen(port,'127.0.0.1',()=>{
  console.log('[IPS Replay] bridge ready on http://127.0.0.1:'+port);
  console.log('[IPS Replay] PRISM PROGRAM: http://127.0.0.1:'+port+'/program');
});

function shutdown(){
  shuttingDown=true;
  for(const state of processes.values()){try{state.child.kill('SIGTERM');}catch{}}
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(0),2500).unref();
}
process.on('SIGINT',shutdown);
process.on('SIGTERM',shutdown);
