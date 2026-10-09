/** Photos-scoped engines, not global Studio routing. Raster/AI history stays owned by RasterEditor. */
export const photosEngines = Object.freeze({
 lightcraft: {id:'lightcraft',label:'LightCraft Develop (experimental)',upstream:'ab9e8d372cc69de976b8ee822d260f088d781426',
  input:['jpeg','png'] as const,previewEdge:1024,sourceEdge:2048,maxBytes:16*1024*1024,
  export:['png','jpeg'] as const,metadata:'stripped',aiTools:false,retainedLayers:false}
});
export interface DevelopSettings {exposure:number;contrast:number;saturation:number}
export const neutralDevelop:DevelopSettings={exposure:0,contrast:0,saturation:0};
export function validateDevelop(s:DevelopSettings){
 if(Object.keys(s).sort().join(',')!=='contrast,exposure,saturation')throw Error('Unexpected Develop settings.');
 for(const [key,max] of [['exposure',3],['contrast',100],['saturation',100]] as const)if(!Number.isFinite(s[key])||Math.abs(s[key])>max)throw Error(`Invalid ${key}.`);
 return {light:{exposure:s.exposure,contrast:s.contrast},color:{saturation:s.saturation}};
}
export function validatePhotoInput(bytes:ArrayBuffer){if(bytes.byteLength===0||bytes.byteLength>photosEngines.lightcraft.maxBytes)throw Error('Develop input must be between 1 byte and 16 MiB.');}
