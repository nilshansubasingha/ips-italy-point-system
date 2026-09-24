import {
  type BroadcastElement,type SceneDocument,
  boundProperty,conditionsPass,sceneDocumentSchema
} from '@ips/broadcast';

export type ResolvedElement=BroadcastElement&{
  resolvedText?:string;
  resolvedAssetUrl?:string;
  resolvedFill?:unknown;
  resolvedVisible:boolean;
};

export type RenderModel={
  document:SceneDocument;
  elements:ResolvedElement[];
  warnings:string[];
};

function safeAsset(url:unknown,fallback=''):string{
  if(typeof url!=='string')return fallback;
  const v=url.trim();
  if(!v||v==='undefined'||v==='null')return fallback;
  return v;
}

export function resolveElement(element:BroadcastElement,data:unknown):ResolvedElement{
  const visible=element.visible!==false&&conditionsPass(element.conditions,data);
  const boundVisible=boundProperty(element,'visible',data);
  const textBinding=boundProperty(element,'text.value',data);
  const assetBinding=boundProperty(element,'asset.url',data);
  const fillBinding=boundProperty(element,'style.fill.color',data);

  const resolved:{[key:string]:unknown}={...element};
  const result:ResolvedElement={
    ...(resolved as BroadcastElement),
    resolvedVisible:boundVisible===undefined?visible:visible&&!!boundVisible
  };

  if(element.text){
    const staticText=element.text.value??'';
    const text=textBinding===undefined?staticText:String(textBinding??'');
    result.resolvedText=text==='undefined'||text==='null'?'':text;
  }
  if(element.asset){
    result.resolvedAssetUrl=safeAsset(assetBinding===undefined?element.asset.url:assetBinding);
  }
  if(fillBinding!==undefined)result.resolvedFill=fillBinding;
  return result;
}

export function createRenderModel(documentInput:unknown,data:unknown):RenderModel{
  const parsed=sceneDocumentSchema.safeParse(documentInput);
  if(!parsed.success){
    return {
      document:{
        schemaVersion:1,canvas:{width:1920,height:1080,transparent:true},name:'Invalid scene',
        designTokens:{},elements:[],guides:[],safeArea:{top:54,right:96,bottom:54,left:96},metadata:{}
      },
      elements:[],
      warnings:['Scene document validation failed: '+parsed.error.issues.map(i=>i.path.join('.')+': '+i.message).join('; ')]
    };
  }
  const warnings:string[]=[];
  const ids=new Set<string>();
  for(const el of parsed.data.elements){
    if(ids.has(el.id))warnings.push('Duplicate element id: '+el.id);
    ids.add(el.id);
  }
  const elements=parsed.data.elements
    .map(el=>resolveElement(el,data))
    .filter(el=>el.resolvedVisible)
    .sort((a,b)=>a.zIndex-b.zIndex);
  return {document:parsed.data,elements,warnings};
}

export function estimateSceneCost(documentInput:unknown){
  const parsed=sceneDocumentSchema.safeParse(documentInput);
  if(!parsed.success)return {score:999,level:'ERROR' as const,reasons:['Invalid scene document']};
  let score=0;const reasons:string[]=[];
  for(const el of parsed.data.elements){
    score+=1;
    if(el.type==='VIDEO'){score+=12;reasons.push('Video layer');}
    if(el.type==='PARTICLES'){score+=10;reasons.push('Particle system');}
    if(el.type==='EFFECT'){score+=5;reasons.push('Procedural effect');}
    if((el.style?.blur??0)>0){score+=4;reasons.push('Blur');}
    if((el.style?.backgroundBlur??0)>0){score+=6;reasons.push('Background blur');}
    if((el.style?.shadows?.length??0)>2){score+=2;reasons.push('Multiple shadows');}
    if(el.animation?.loop)score+=3;
  }
  const level=score>70?'HIGH':score>35?'MEDIUM':'LOW';
  return {score,level,reasons:[...new Set(reasons)]};
}

export type ConflictDecision={
  hideInstanceIds:string[];
  replaceInstanceIds:string[];
};

export function resolveLayerConflicts(
  active:Array<{instanceId:string;priority:number;replacementGroup?:string|null}>,
  incoming:{priority:number;replacementGroup?:string|null;conflictBehavior?:string|null}
):ConflictDecision{
  const replace:string[]=[];
  const hide:string[]=[];
  if(incoming.replacementGroup){
    for(const layer of active){
      if(layer.replacementGroup===incoming.replacementGroup)replace.push(layer.instanceId);
    }
  }
  if(incoming.conflictBehavior==='HIDE_LOWER_PRIORITY'){
    for(const layer of active){
      if(layer.priority<incoming.priority)hide.push(layer.instanceId);
    }
  }
  return {hideInstanceIds:hide,replaceInstanceIds:replace};
}
