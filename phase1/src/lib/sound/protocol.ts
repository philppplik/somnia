/** Messages between the Sound Studio and its WASM worker (SoundCraft decode + offline DSP). */
export interface SoundPluginSpec{id:string;params?:Record<string,number>;keep_tail?:boolean}
/** Mirrors the Rust `Recipe`. Every field is optional; the order of steps is fixed by the engine. */
export interface SoundRecipe{trim_silence_db?:number;reverse?:boolean;pitch_semitones?:number;plugin?:SoundPluginSpec;fade_in_ms?:number;fade_out_ms?:number;normalize_db?:number;columns?:number}
export interface SoundStats{frames:number;sample_rate:number;channels:number;duration_s:number;peak_db:number;rms_db:number}
export interface SoundReport{format:string;input:SoundStats;output:SoundStats;trimmed_range:[number,number]|null;steps:string[];wav_bytes:number}
export interface SoundPlugin{id:string;name:string;instrument:boolean}
export type SoundRequest=
 |{id:number;kind:'init';wasmUrl:string}
 |{id:number;kind:'process';bytes:ArrayBuffer;ext:string;recipe:SoundRecipe};
export type SoundResponse=
 |{id:number;ok:true;kind:'ready';plugins:SoundPlugin[];initMs:number}
 |{id:number;ok:true;kind:'result';wav:ArrayBuffer;peaks:ArrayBuffer;report:SoundReport;ms:number}
 |{id:number;ok:false;error:string};
