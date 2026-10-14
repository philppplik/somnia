import type {AgentToolDefinition} from './types';
export interface LocalToolLint {tier:'simple'|'ok'|'complex';reasons:string[]}
/** Compatibility advice only. Never rewrites schema or grants execution. */
export function lintToolForLocal(tool:AgentToolDefinition):LocalToolLint{
 const reasons=new Set<string>();let nested=false;let budget=0;
 if(tool.description.length>400)reasons.add('description-over-400');
 const walk=(value:unknown,depth:number)=>{
  if(++budget>500){reasons.add('schema-too-large');return;}
  if(!value||typeof value!=='object'||Array.isArray(value))return;
  const schema=value as Record<string,unknown>;
  if(depth>2)reasons.add('nested-depth-over-2');
  for(const key of ['$ref','oneOf','anyOf','allOf'])if(key in schema)reasons.add(key);
  if(schema.type==='object'){
   const properties=schema.properties;
   if(depth>0)nested=true;if(properties&&typeof properties==='object'&&!Array.isArray(properties)){
    if(Object.keys(properties).length>8)reasons.add('properties-over-8');
    for(const child of Object.values(properties)){if(depth>0)nested=true;walk(child,depth+1);}
   }
  }
  if(schema.type==='array'){
   nested=true;const item=schema.items as {type?:unknown}|undefined;if(!item||item.type==='object'||item.type==='array')reasons.add('array-of-complex');walk(item,depth+1);
  }
 };
 walk(tool.parameters,0);return {tier:reasons.size?'complex':nested?'ok':'simple',reasons:[...reasons].sort()};
}
export function selectLocalTools(tools:readonly AgentToolDefinition[],maximum=8){
 const eligible=tools.filter(tool=>lintToolForLocal(tool).tier!=='complex');return eligible.slice(0,maximum);
}
