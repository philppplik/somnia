/** Maps an engine step line (English, machine-made) to a locale key plus arguments, so the UI can show it in the user's language. */
export function stepLabel(step:string):{key:string;args:Record<string,string>}{
 const range=/(\d+)\.\.(\d+)/.exec(step);
 const a={start:range?.[1]??'',end:range?.[2]??''};
 if(step.startsWith('crop '))return{key:'sound.step.crop',args:a};
 if(step.startsWith('cut '))return{key:'sound.step.cut',args:a};
 if(step.startsWith('selection '))return{key:'sound.step.only',args:a};
 if(step.startsWith('trim_silence'))return{key:'sound.step.trim',args:{db:/silence (-?[\d.]+) dB/.exec(step)?.[1]??''}};
 if(step==='reverse')return{key:'sound.step.reverse',args:{}};
 if(step.startsWith('pitch_shift'))return{key:'sound.step.pitch',args:{st:/([+-][\d.]+) st/.exec(step)?.[1]??''}};
 if(step.startsWith('plugin '))return{key:'sound.step.plugin',args:{id:step.split(' ')[1]??''}};
 if(step.startsWith('fade'))return{key:'sound.step.fade',args:{}};
 if(step.startsWith('normalize'))return{key:'sound.step.normalize',args:{db:/normalize (-?[\d.]+) dB/.exec(step)?.[1]??''}};
 return{key:'sound.step.other',args:{step}};
}
const STAGES=['decode','region','trim','reverse','pitch','plugin','fade','normalize','encode'];
export const stageKey=(stage:string)=>STAGES.includes(stage)?`sound.stage.${stage}`:'sound.stage.other';
