import http from 'node:http';
import {spawn} from 'node:child_process';

const publicPort=Number(process.env.PORT||8080);
const directorPort=3103;
const editorPort=3104;
const controllerPort=3105;
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
start('director','@ips/director',directorPort);
start('editor','@ips/editor',editorPort);
start('controller','@ips/controller',controllerPort);

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
    res.end('IPS PRISM preview app is starting. Refresh in a moment.\n'+err.message);
  });
  req.pipe(upstream);
}

const server=http.createServer((req,res)=>{
  const url=req.url||'/';
  if(url==='/'||url===''){
    res.statusCode=302;
    res.setHeader('location','/director');
    res.end();
    return;
  }
  if(url==='/health'){
    res.statusCode=200;
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({ok:true,apps:['director','editor','controller']}));
    return;
  }
  if(url==='/director'||url.startsWith('/director/')){
    proxy(req,res,directorPort);
    return;
  }
  if(url==='/editor'||url.startsWith('/editor/')){
    proxy(req,res,editorPort);
    return;
  }
  if(url==='/controller'||url.startsWith('/controller/')){
    proxy(req,res,controllerPort);
    return;
  }
  res.statusCode=404;
  res.setHeader('content-type','text/plain; charset=utf-8');
  res.end('IPS PRISM preview gateway: use /director, /editor or /controller');
});

server.listen(publicPort,'0.0.0.0',()=>{
  console.log('IPS PRISM preview gateway ready on '+publicPort);
});

function shutdown(){
  server.close(()=>process.exit(0));
  for(const child of children)child.kill('SIGTERM');
  setTimeout(()=>process.exit(0),5000).unref();
}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
