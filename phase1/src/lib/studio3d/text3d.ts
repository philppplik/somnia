/** 3D text: extruded glyph outlines from the bundled Momo Signature subset (OFL-1.1, see src/assets/fonts/MomoSignature-OFL.txt). Pure and node-testable. */
import {FontLoader,Font} from 'three/examples/jsm/loaders/FontLoader.js';
import {TextGeometry} from 'three/examples/jsm/geometries/TextGeometry.js';
import typefaceData from './momoSignatureTypeface';
export interface Text3DParams{text:string;size:number;depth:number;bevel:boolean;}
export const TEXT3D_LIMITS={size:{min:0.05,max:100},depth:{min:0,max:100},chars:{min:1,max:200}} as const;
let cached:Font|null=null;
export const textFont=():Font=>cached??(cached=new FontLoader().parse(typefaceData as Parameters<FontLoader['parse']>[0]));
/** The characters of text the bundled font does not cover (space excluded), deduplicated. */
export const missingGlyphs=(font:Font,text:string):string[]=>[...new Set([...text].filter(c=>c!==' '&&!(font.data.glyphs as Record<string,unknown>)[c]))];
/** Builds the extruded text geometry: centred on x and z, sitting on y=0, extrusion along +z centred too. Caller disposes. */
export function textGeometry(p:Text3DParams):TextGeometry{
 const g=new TextGeometry(p.text,{font:textFont(),size:p.size,depth:p.depth,curveSegments:6,bevelEnabled:p.bevel,bevelThickness:p.size*0.03,bevelSize:p.size*0.02,bevelSegments:2});
 g.computeBoundingBox();
 const b=g.boundingBox!;
 g.translate(-(b.min.x+b.max.x)/2,-b.min.y,-(b.min.z+b.max.z)/2);
 return g;
}
