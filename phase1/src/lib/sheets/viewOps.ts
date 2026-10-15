/** Zoom and gridlines of a sheet: validation of untrusted command input. The Rust bridge re-validates. */
export const MIN_ZOOM=10,MAX_ZOOM=400,ZOOM_PRESETS=[50,75,100,125,150,200] as const;
export type ViewCommand={zoom:number}|{gridlines:boolean}|{fit:'selection'};
/** A usable zoom factor (1 = 100 percent) from whatever the bridge sent. */
export function zoomFactor(zoom:unknown):number{return typeof zoom==='number'&&Number.isInteger(zoom)&&zoom>=MIN_ZOOM&&zoom<=MAX_ZOOM?zoom/100:1;}
export function parseViewCommand(input:unknown):ViewCommand{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('View change must be an object.');
 const o=input as Record<string,unknown>,keys=Object.keys(o);
 if(keys.length!==1)throw Error('Name exactly one view setting.');
 if('zoom' in o){const z=o.zoom;if(typeof z!=='number'||!Number.isInteger(z)||z<MIN_ZOOM||z>MAX_ZOOM)throw Error(`Zoom must be a whole number from ${MIN_ZOOM} to ${MAX_ZOOM}.`);return {zoom:z};}
 if('gridlines' in o){if(typeof o.gridlines!=='boolean')throw Error('`gridlines` must be true or false.');return {gridlines:o.gridlines};}
 if('fit' in o){if(o.fit!=='selection')throw Error('Unsupported fit.');return {fit:'selection'};}
 throw Error('Unknown view setting.');
}
/** The whole-percent zoom at which a block of `blockW` x `blockH` pixels (measured at the current zoom factor `currentZoom`, 1 = 100 percent) fills a view of `viewW` x `viewH`. */
export function fitZoom(blockW:number,blockH:number,viewW:number,viewH:number,currentZoom:number):number{
 if(![blockW,blockH,viewW,viewH,currentZoom].every(Number.isFinite)||blockW<=0||blockH<=0||viewW<=0||viewH<=0||currentZoom<=0)return 100;
 const base=Math.min(viewW/(blockW/currentZoom),viewH/(blockH/currentZoom));
 return Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,Math.floor(base*100)));
}
