import http from 'node:http';
import {spawn} from 'node:child_process';

const publicPort=Number(process.env.PORT||8080);
const controllerPort=3102;
const directorPort=3103;
const editorPort=3104;
const overlayPort=3105;
const replayPort=3106;
const children=[];

function start(name,workspace,port){
  const child=spawn('npm',['exec','--workspace='+workspace,'--','next','start','-p',String(port)],{
    stdio:'inherit',
    env:{...process.env,PRISM_PREVIEW_GATEWAY:'1'}
  });
  child.on('exit',(code,signal)=>{
    if(code!==0&&signal!=='SIGTERM'){
      console.error(name+' exited unexpectedly',code,signal);
      process.exit(code||1);
    }
  });
  children.push(child);
}

start('controller','@ips/controller',controllerPort);
start('director','@ips/director',directorPort);
start('editor','@ips/editor',editorPort);
start('overlay','@ips/overlay',overlayPort);
start('replay','@ips/replay',replayPort);

function proxy(req,res,targetPort){
  const headers={...req.headers,host:'127.0.0.1:'+targetPort};
  const upstream=http.request({
    hostname:'127.0.0.1',
    port:targetPort,
    path:req.url,
    method:req.method,
    headers
  },up=>{
    res.writeHead(up.statusCode||502,up.statusMessage,up.headers);
    up.pipe(res);
  });
  upstream.on('error',err=>{
    res.statusCode=503;
    res.setHeader('content-type','text/plain; charset=utf-8');
    res.end('IPS PRISM preview app is starting.\n'+err.message);
  });
  req.pipe(upstream);
}

const server=http.createServer((req,res)=>{
  const url=req.url||'/';
  const pathname=new URL(url,'http://ips.local').pathname;
  if(pathname==='/'||pathname===''){
    res.statusCode=200;
    res.setHeader('content-type','text/html; charset=utf-8');
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>IPS Broadcast Control Room</title><style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:#061118;color:#eef7f4;font-family:Inter,system-ui,sans-serif;display:grid;place-items:center}.hub{width:min(900px,92vw);padding:28px}.brand{font-size:12px;letter-spacing:.18em;color:#5fc9a3;font-weight:900}.hub h1{font-size:34px;margin:8px 0 6px}.hub p{color:#8fa6af;margin:0 0 24px}.links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.links a{display:block;padding:18px;border:1px solid #1d3b46;border-radius:12px;background:#0a1b23;color:#eef7f4;text-decoration:none;font-weight:900}.links a span{display:block;margin-top:5px;color:#78909b;font-size:12px;font-weight:600}.links a:hover{border-color:#2c8d68;background:#0c241d}@media(max-width:650px){.links{grid-template-columns:1fr}.hub h1{font-size:28px}}</style></head><body><main class="hub"><div class="brand">IPS · BROADCAST CONTROL ROOM</div><h1>One workspace.</h1><p>Use this domain for scoring, graphics, overlay and replay.</p><div class="links">
    <a href="/controller">MATCH CONTROLLER<span>Scoring and match operations</span></a>
    <a href="/director">DIRECTOR<span>Broadcast graphics and program control</span></a>
    <a href="/replay">REPLAY<span>Camera ingest and replay engine</span></a>
    <a href="/replay/camera">PHONE CAMERA<span>Join a camera channel with PIN</span></a>
    <a href="/overlay">OVERLAY<span>PRISM browser-source output</span></a>
    <a href="/editor">GRAPHICS EDITOR<span>Overlay design and variants</span></a>
    </div></main></body></html>`);
    return;
  }
  if(pathname==='/health'){
    res.statusCode=200;
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({ok:true,apps:['controller','director','editor','overlay','replay'],media:'livekit-cloud'}));
    return;
  }
  if(pathname==='/controller'||pathname.startsWith('/controller/')){
    proxy(req,res,controllerPort);
    return;
  }
  if(pathname==='/director'||pathname.startsWith('/director/')){
    proxy(req,res,directorPort);
    return;
  }
  if(pathname==='/editor'||pathname.startsWith('/editor/')){
    proxy(req,res,editorPort);
    return;
  }
  if(pathname==='/overlay'||pathname.startsWith('/overlay/')){
    proxy(req,res,overlayPort);
    return;
  }
  if(pathname==='/replay'||pathname.startsWith('/replay/')){
    proxy(req,res,replayPort);
    return;
  }
  res.statusCode=404;
  res.setHeader('content-type','text/plain; charset=utf-8');
  res.end('IPS PRISM preview gateway: use /controller, /director, /editor, /overlay or /replay');
});

server.listen(publicPort,'0.0.0.0',()=>{
  console.log('IPS PRISM preview gateway ready on '+publicPort+' with LiveKit Cloud media');
});

function shutdown(){
  server.close(()=>process.exit(0));
  for(const child of children)child.kill('SIGTERM');
  setTimeout(()=>process.exit(0),5000).unref();
}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
