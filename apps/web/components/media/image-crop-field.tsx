'use client';

import {useEffect,useRef,useState} from 'react';

type Props={
  name?:string;
  label?:string;
  aspect?:'square'|'portrait'|'landscape';
  required?:boolean;
  initialUrl?:string|null;
};

const SIZE={
  square:{w:1000,h:1000},
  portrait:{w:1000,h:1250},
  landscape:{w:1600,h:900}
} as const;

export function ImageCropField({name='image',label='Choose image',aspect='square',required=false,initialUrl=null}:Props){
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const outputRef=useRef<HTMLInputElement|null>(null);
  const [source,setSource]=useState<HTMLImageElement|null>(null);
  const [fileName,setFileName]=useState('image');
  const [mode,setMode]=useState<'cover'|'contain'>(aspect==='square'?'contain':'cover');
  const [zoom,setZoom]=useState(1);
  const [x,setX]=useState(0);
  const [y,setY]=useState(0);
  const [ready,setReady]=useState(false);
  const size=SIZE[aspect];

  useEffect(()=>{
    if(!source)return;
    const canvas=canvasRef.current;
    if(!canvas)return;
    canvas.width=size.w; canvas.height=size.h;
    const ctx=canvas.getContext('2d');
    if(!ctx)return;
    ctx.clearRect(0,0,size.w,size.h);
    const base=mode==='cover'
      ?Math.max(size.w/source.naturalWidth,size.h/source.naturalHeight)
      :Math.min(size.w/source.naturalWidth,size.h/source.naturalHeight);
    const scale=base*zoom;
    const dw=source.naturalWidth*scale,dh=source.naturalHeight*scale;
    const ox=(x/100)*size.w*.35,oy=(y/100)*size.h*.35;
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';
    ctx.drawImage(source,(size.w-dw)/2+ox,(size.h-dh)/2+oy,dw,dh);
    canvas.toBlob(blob=>{
      if(!blob||!outputRef.current)return;
      const safe=fileName.replace(/\.[^.]+$/,'').replace(/[^a-z0-9-_]+/gi,'-')||'image';
      const file=new File([blob],safe+'-ips.webp',{type:'image/webp',lastModified:Date.now()});
      const dt=new DataTransfer();dt.items.add(file);outputRef.current.files=dt.files;setReady(true);
    },'image/webp',.92);
  },[source,mode,zoom,x,y,size.w,size.h,fileName]);

  function choose(file:File|null){
    if(!file){setSource(null);setReady(false);return;}
    setFileName(file.name);
    const img=new Image();
    img.onload=()=>{setSource(img);URL.revokeObjectURL(img.src);setZoom(1);setX(0);setY(0);};
    img.src=URL.createObjectURL(file);
  }

  function reset(){setZoom(1);setX(0);setY(0);setMode(aspect==='square'?'contain':'cover');}

  return <div className="image-crop-field">
    <input ref={outputRef} type="file" name={name} accept="image/webp" hidden/>
    <label className="image-crop-picker">
      <span>{label}</span>
      <input type="file" accept="image/jpeg,image/png,image/webp" required={required} onChange={e=>choose(e.target.files?.[0]??null)}/>
    </label>
    {(source||initialUrl)&&<div className="image-crop-workspace">
      <div className={'image-crop-preview '+aspect}>
        {source?<canvas ref={canvasRef}/>:initialUrl?<img src={initialUrl} alt="Current image"/>:null}
      </div>
      {source&&<div className="image-crop-controls">
        <div className="crop-mode">
          <button type="button" className={mode==='contain'?'active':''} onClick={()=>setMode('contain')}>Fit whole image</button>
          <button type="button" className={mode==='cover'?'active':''} onClick={()=>setMode('cover')}>Fill & crop</button>
        </div>
        <label><span>Zoom <b>{zoom.toFixed(2)}×</b></span><input type="range" min="1" max="3" step=".01" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label>
        <label><span>Move left / right</span><input type="range" min="-100" max="100" step="1" value={x} onChange={e=>setX(Number(e.target.value))}/></label>
        <label><span>Move up / down</span><input type="range" min="-100" max="100" step="1" value={y} onChange={e=>setY(Number(e.target.value))}/></label>
        <div className="crop-actions"><button type="button" onClick={reset}>Reset</button><span className={ready?'ready':''}>{ready?'Ready to upload':'Preparing…'}</span></div>
      </div>}
    </div>}
  </div>;
}
