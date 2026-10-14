import type {SlideTransition} from './deckPackage';
export const TRANSITION_MS={slow:900,med:500,fast:250} as const;
/** Entry animation for the incoming slide. `dir` is the direction of motion; no effect for 'none'. */
export function transitionFrames(t:SlideTransition):Keyframe[]|null{
  if(t.kind==='none')return null;
  if(t.kind==='fade')return [{opacity:0},{opacity:1}];
  const from={l:'translateX(100%)',r:'translateX(-100%)',u:'translateY(100%)',d:'translateY(-100%)'}[t.dir];
  if(t.kind==='wipe'){const clip={l:['inset(0 0 0 100%)','inset(0)'],r:['inset(0 100% 0 0)','inset(0)'],u:['inset(100% 0 0 0)','inset(0)'],d:['inset(0 0 100% 0)','inset(0)']}[t.dir];return [{clipPath:clip[0]},{clipPath:clip[1]}];}
  return [{transform:from},{transform:'none'}];
}
