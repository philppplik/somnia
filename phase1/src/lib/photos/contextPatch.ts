import type {ContextPatch} from '../shell/contextStore';
export interface PhotosContextFacts{name:string;status:string;dirty:boolean;neutral:boolean;cropping:boolean;canUndo:boolean;canRedo:boolean;cropped:boolean;orientation:number;hasFrame:boolean}
/**
 * What the Photos canvas tells the shell. One photo is always the whole selection (kind 'one', type 'photo');
 * `activeTool` is 'crop' while the crop overlay is up. `services` feed `when` expressions.
 */
export function photosContextPatch(f:PhotosContextFacts):ContextPatch{
 return {
  document:{id:f.name,kind:'photo',dirty:f.dirty,readOnly:false},
  mode:f.cropping?'crop':'develop',
  selection:{kind:'one',type:'photo',count:1,ids:[f.name]},
  activeTool:f.cropping?'crop':undefined,
  busy:f.status==='loading'||f.status==='processing',
  services:{ready:f.status==='ready'||f.status==='processing',error:f.status==='error',edited:!f.neutral,cropped:f.cropped,canUndo:f.canUndo,canRedo:f.canRedo,frame:f.hasFrame},
  data:{orientation:f.orientation},
 };
}
