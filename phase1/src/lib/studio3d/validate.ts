import type {ModelStats} from './model';
/** Scene checks shown in the stats panel and used before export. Pure and node-testable. */
export type WarnCode='highTriangles'|'highTextureMemory'|'highGeometryMemory'|'largeTexture'|'manyDraws'|'manyBones'|'zeroScale'|'textureNoUv'|'noGeometry'|'exportTooLarge';
export type HintCode='instancingHint'|'lodHint';
export interface Warning{code:WarnCode|HintCode;level:'warn'|'info';/** Numbers for the message text. */values:Record<string,number>}
export const LIMITS={triangles:1_000_000,textureBytes:256*1024*1024,geometryBytes:512*1024*1024,bones:256,textureSize:4096,draws:500,/** An export above this much decoded texture data is refused. */exportTextureBytes:1024*1024*1024,exportMaxTextureSize:4096};
/** Decoded size of one RGBA texture (with a third extra for mip maps). */
export const textureBytes=(w:number,h:number):number=>Number.isFinite(w)&&Number.isFinite(h)&&w>0&&h>0?Math.ceil(w*h*4*4/3):0;
export const toMB=(bytes:number):number=>Math.round(bytes/1024/1024*10)/10;
export function validateScene(s:ModelStats):Warning[]{
 const out:Warning[]=[];
 if(s.meshes===0&&s.nodes>0)out.push({code:'noGeometry',level:'info',values:{}});
 if(s.triangles>LIMITS.triangles)out.push({code:'highTriangles',level:'warn',values:{count:s.triangles,limit:LIMITS.triangles}});
 if(s.textureBytes>LIMITS.textureBytes)out.push({code:'highTextureMemory',level:'warn',values:{mb:toMB(s.textureBytes),limit:toMB(LIMITS.textureBytes)}});
 if(s.geometryBytes>LIMITS.geometryBytes)out.push({code:'highGeometryMemory',level:'warn',values:{mb:toMB(s.geometryBytes),limit:toMB(LIMITS.geometryBytes)}});
 if(s.maxTexture>LIMITS.textureSize)out.push({code:'largeTexture',level:'warn',values:{size:s.maxTexture,limit:LIMITS.textureSize}});
 if(s.draws>LIMITS.draws)out.push({code:'manyDraws',level:'warn',values:{count:s.draws,limit:LIMITS.draws}});
 if(s.bones>LIMITS.bones)out.push({code:'manyBones',level:'warn',values:{count:s.bones,limit:LIMITS.bones}});
 if(s.zeroScale>0)out.push({code:'zeroScale',level:'warn',values:{count:s.zeroScale}});
 if(s.textureNoUv>0)out.push({code:'textureNoUv',level:'warn',values:{count:s.textureNoUv}});
 return out;
}
/** Advisory performance hints (never blocking), shown under the scene checks. Pure and node-testable. */
export const HINT_LIMITS={instancing:20,lodTriangles:500_000};
export function sceneHints(s:ModelStats):Warning[]{
 const out:Warning[]=[];
 if(s.instancingCandidates>=HINT_LIMITS.instancing)out.push({code:'instancingHint',level:'info',values:{count:s.instancingCandidates}});
 if(s.triangles>HINT_LIMITS.lodTriangles&&s.bones===0&&s.animations===0)out.push({code:'lodHint',level:'info',values:{count:s.triangles}});
 return out;
}
/** Refuses an export whose texture data would not fit comfortably in memory. Returns the message or null. */
export function exportBlocker(s:ModelStats):string|null{
 return s.textureBytes>LIMITS.exportTextureBytes?`The textures use about ${toMB(s.textureBytes)} MB when decoded, more than the ${toMB(LIMITS.exportTextureBytes)} MB export limit. Remove or shrink some textures first.`:null;
}
