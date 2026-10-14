import type {Composition,Layer,PropValue,TransformKey} from '../../lib/animation/model';
import {frameCount,ticksToSeconds} from '../../lib/animation/time';
export const PROP_LABEL:Record<TransformKey,string>={anchor:'animation.prop.anchor',position:'animation.prop.position',scale:'animation.prop.scale',rotation:'animation.prop.rotation',opacity:'animation.prop.opacity'};
export const fmt=(n:number)=>String(Math.round(n*100)/100);
export const fmtValue=(v:PropValue)=>typeof v==='number'?fmt(v):`${fmt(v[0])}, ${fmt(v[1])}`;
export const renderSummary=(c:Composition)=>({width:c.width,height:c.height,fps:fmt(c.fps.num/c.fps.den),frames:frameCount(c.duration,c.fps),seconds:fmt(ticksToSeconds(c.duration))});
export const layerLabel=(l:Layer)=>l.name;
