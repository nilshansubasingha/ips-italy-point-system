import {z} from 'zod';

export const BROADCAST_WIDTH=1920;
export const BROADCAST_HEIGHT=1080;
export const BROADCAST_SCHEMA_VERSION=1;

export const transformSchema=z.object({
  x:z.number(),y:z.number(),width:z.number().nonnegative(),height:z.number().nonnegative(),
  rotation:z.number().default(0),scaleX:z.number().default(1),scaleY:z.number().default(1),
  opacity:z.number().min(0).max(1).default(1),anchorX:z.number().min(0).max(1).default(.5),anchorY:z.number().min(0).max(1).default(.5),
  flipX:z.boolean().default(false),flipY:z.boolean().default(false)
});

export const colorStopSchema=z.object({offset:z.number().min(0).max(1),color:z.string()});
export const paintSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('SOLID'),color:z.string()}),
  z.object({type:z.literal('LINEAR_GRADIENT'),angle:z.number().default(0),stops:z.array(colorStopSchema).min(2)}),
  z.object({type:z.literal('RADIAL_GRADIENT'),stops:z.array(colorStopSchema).min(2)})
]);
export const shadowSchema=z.object({x:z.number(),y:z.number(),blur:z.number().nonnegative(),spread:z.number().default(0),color:z.string()});
export const cornersSchema=z.object({tl:z.number().nonnegative(),tr:z.number().nonnegative(),br:z.number().nonnegative(),bl:z.number().nonnegative(),linked:z.boolean().default(true)});

export const styleSchema=z.object({
  fill:paintSchema.optional(),stroke:paintSchema.optional(),strokeWidth:z.number().nonnegative().default(0),
  strokeDash:z.array(z.number().nonnegative()).default([]),corners:cornersSchema.optional(),
  shadows:z.array(shadowSchema).default([]),innerShadow:shadowSchema.optional(),
  blur:z.number().nonnegative().default(0),backgroundBlur:z.number().nonnegative().default(0),
  blendMode:z.string().default('normal'),overflow:z.enum(['VISIBLE','HIDDEN']).default('VISIBLE'),
  noise:z.number().min(0).max(1).default(0),glow:z.number().nonnegative().default(0)
});

export const typographySchema=z.object({
  fontFamily:z.string().default('Inter'),fontWeight:z.number().int().min(100).max(1000).default(700),
  fontSize:z.number().positive(),lineHeight:z.number().positive().default(1),letterSpacing:z.number().default(0),
  align:z.enum(['LEFT','CENTER','RIGHT','JUSTIFY']).default('LEFT'),
  verticalAlign:z.enum(['TOP','MIDDLE','BOTTOM']).default('MIDDLE'),
  case:z.enum(['NONE','UPPER','LOWER','TITLE']).default('NONE'),
  wrap:z.enum(['WRAP','TRUNCATE','SHRINK','AUTO_SIZE']).default('SHRINK'),
  maxLines:z.number().int().positive().default(1),padding:z.number().nonnegative().default(0)
});

export const bindingSchema=z.object({
  property:z.string(),path:z.string(),fallback:z.unknown().optional(),
  format:z.enum(['RAW','NUMBER','INTEGER','DECIMAL_1','DECIMAL_2','PERCENT','OVERS','UPPER','LOWER','IMAGE_URL','COLOR']).default('RAW'),
  prefix:z.string().default(''),suffix:z.string().default('')
});

export const conditionSchema=z.object({
  path:z.string(),operator:z.enum(['EQ','NEQ','GT','GTE','LT','LTE','IN','TRUTHY','FALSY','EXISTS']),value:z.unknown().optional()
});
export const conditionGroupSchema=z.object({mode:z.enum(['ALL','ANY']).default('ALL'),conditions:z.array(conditionSchema)});

export const keyframeSchema=z.object({
  at:z.number().min(0),value:z.unknown(),easing:z.string().default('linear')
});
export const animationTrackSchema=z.object({property:z.string(),keyframes:z.array(keyframeSchema).min(2)});
export const animationSchema=z.object({
  enterPreset:z.string().nullable().default(null),exitPreset:z.string().nullable().default(null),
  durationMs:z.number().int().nonnegative().default(500),exitDurationMs:z.number().int().nonnegative().default(350),
  delayMs:z.number().int().nonnegative().default(0),holdMs:z.number().int().nonnegative().nullable().default(null),
  loop:z.boolean().default(false),tracks:z.array(animationTrackSchema).default([])
});

export const elementTypeSchema=z.enum([
  'GROUP','TEXT','RECT','ROUNDED_RECT','ELLIPSE','LINE','POLYGON','PATH','SVG','IMAGE','VIDEO',
  'ICON','FRAME','CONTAINER','MASK','DATA','EFFECT','PARTICLES'
]);
export const elementSchema:z.ZodType<any>=z.lazy(()=>z.object({
  id:z.string().min(1),name:z.string().min(1),type:elementTypeSchema,parentId:z.string().nullable().default(null),
  zIndex:z.number().int().default(0),visible:z.boolean().default(true),locked:z.boolean().default(false),
  transform:transformSchema,style:styleSchema.default({}),
  text:z.object({value:z.string().default(''),typography:typographySchema}).optional(),
  asset:z.object({url:z.string().default(''),fit:z.enum(['CONTAIN','COVER','FILL']).default('CONTAIN'),objectPosition:z.string().default('50% 50%')}).optional(),
  pathData:z.string().optional(),points:z.array(z.object({x:z.number(),y:z.number()})).optional(),
  effect:z.object({kind:z.string(),params:z.record(z.unknown()).default({})}).optional(),
  bindings:z.array(bindingSchema).default([]),conditions:conditionGroupSchema.optional(),
  animation:animationSchema.default({})
}));

export const guideSchema=z.object({axis:z.enum(['X','Y']),position:z.number(),locked:z.boolean().default(false)});
export const sceneDocumentSchema=z.object({
  schemaVersion:z.literal(BROADCAST_SCHEMA_VERSION),
  canvas:z.object({width:z.literal(BROADCAST_WIDTH),height:z.literal(BROADCAST_HEIGHT),transparent:z.boolean().default(true)}),
  name:z.string(),designTokens:z.record(z.unknown()).default({}),elements:z.array(elementSchema),
  guides:z.array(guideSchema).default([]),safeArea:z.object({top:z.number(),right:z.number(),bottom:z.number(),left:z.number()}).default({top:54,right:96,bottom:54,left:96}),
  metadata:z.record(z.unknown()).default({})
});

export const sequenceStepSchema=z.object({
  id:z.string(),variantKey:z.string(),durationMs:z.number().int().positive().nullable().default(null),
  transition:z.string().nullable().default(null),waitForTake:z.boolean().default(false),conditions:conditionGroupSchema.optional()
});
export const sequenceDocumentSchema=z.object({schemaVersion:z.literal(1),name:z.string(),steps:z.array(sequenceStepSchema)});

export const programLayerSchema=z.object({
  instanceId:z.string().uuid(),variantKey:z.string(),priority:z.number().int(),replacementGroup:z.string().nullable().default(null),
  startedAt:z.string(),durationMs:z.number().int().positive().nullable().default(null),expiresAt:z.string().nullable().default(null),
  persistent:z.boolean().default(false),payload:z.record(z.unknown()).default({}),
  source:z.enum(['DIRECTOR','AUTOMATION','SEQUENCE','RESTORE']).default('DIRECTOR')
});

export type BroadcastTransform=z.infer<typeof transformSchema>;
export type BroadcastElement=z.infer<typeof elementSchema>;
export type SceneDocument=z.infer<typeof sceneDocumentSchema>;
export type SequenceDocument=z.infer<typeof sequenceDocumentSchema>;
export type ProgramLayer=z.infer<typeof programLayerSchema>;

export function getPath(source:unknown,path:string):unknown{
  if(!path)return source;
  return path.split('.').reduce<unknown>((current,key)=>{
    if(current===null||current===undefined||typeof current!=='object')return undefined;
    if(Array.isArray(current)&&/^\d+$/.test(key))return current[Number(key)];
    return (current as Record<string,unknown>)[key];
  },source);
}

export function testCondition(condition:z.infer<typeof conditionSchema>,data:unknown):boolean{
  const actual=getPath(data,condition.path);
  switch(condition.operator){
    case 'EQ': return actual===condition.value;
    case 'NEQ': return actual!==condition.value;
    case 'GT': return Number(actual)>Number(condition.value);
    case 'GTE': return Number(actual)>=Number(condition.value);
    case 'LT': return Number(actual)<Number(condition.value);
    case 'LTE': return Number(actual)<=Number(condition.value);
    case 'IN': return Array.isArray(condition.value)&&condition.value.includes(actual);
    case 'TRUTHY': return !!actual;
    case 'FALSY': return !actual;
    case 'EXISTS': return actual!==null&&actual!==undefined&&actual!=='';
  }
}

export function conditionsPass(group:z.infer<typeof conditionGroupSchema>|undefined,data:unknown):boolean{
  if(!group)return true;
  return group.mode==='ALL'?group.conditions.every(c=>testCondition(c,data)):group.conditions.some(c=>testCondition(c,data));
}

export function formatBoundValue(value:unknown,binding:z.infer<typeof bindingSchema>):string{
  const v=value===undefined||value===null||value===''?binding.fallback:value;
  if(v===undefined||v===null)return '';
  let out:string;
  switch(binding.format){
    case 'INTEGER': out=String(Math.round(Number(v)||0)); break;
    case 'DECIMAL_1': out=(Number(v)||0).toFixed(1); break;
    case 'DECIMAL_2': out=(Number(v)||0).toFixed(2); break;
    case 'PERCENT': out=((Number(v)||0)*100).toFixed(1)+'%'; break;
    case 'UPPER': out=String(v).toUpperCase(); break;
    case 'LOWER': out=String(v).toLowerCase(); break;
    default: out=String(v);
  }
  return binding.prefix+out+binding.suffix;
}

export function boundProperty(element:BroadcastElement,property:string,data:unknown):unknown{
  const binding=element.bindings?.find((b:any)=>b.property===property);
  if(!binding)return undefined;
  const raw=getPath(data,binding.path);
  if(property==='text.value')return formatBoundValue(raw,binding);
  return raw===undefined||raw===null?binding.fallback:raw;
}
