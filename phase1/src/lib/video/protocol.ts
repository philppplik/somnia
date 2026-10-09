import type {VideoRecipe} from './recipe';
/** Messages between the Video Studio and its worker (mediabunny demux/mux + WebCodecs encode). */
export interface VideoTrackInfo{codec:string|null;width:number;height:number;fps:number|null}
export interface AudioTrackInfo{codec:string|null;channels:number;rate:number}
export interface VideoProbe{duration:number;video:VideoTrackInfo|null;audio:AudioTrackInfo|null}
/** What the platform can really encode, probed with WebCodecs before the UI offers a choice. */
export interface VideoCapabilities{webmVideo:string|null;mp4Video:string|null;opus:boolean;aac:boolean}
export interface VideoReport{format:string;duration_s:number;bytes:number;videoCodec:string|null;audioCodec:string|null;steps:string[]}
export interface VideoProgress{stage:string;ratio:number;processed_s:number}
export type VideoRequest=
 |{id:number;kind:'probe';bytes:ArrayBuffer}
 |{id:number;kind:'capabilities'}
 |{id:number;kind:'export';bytes:ArrayBuffer;recipe:VideoRecipe}
 |{id:number;kind:'cancel'};
export type VideoResponse=
 |{id:number;ok:true;kind:'probe';probe:VideoProbe}
 |{id:number;ok:true;kind:'capabilities';capabilities:VideoCapabilities}
 |{id:number;ok:true;kind:'progress';stage:string;ratio:number;processed_s:number}
 |{id:number;ok:true;kind:'export';bytes:ArrayBuffer;mime:string;report:VideoReport}
 |{id:number;ok:false;error:string;cancelled?:boolean};
