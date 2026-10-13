import type {FrameworkLanguage} from './templateManifest';
export interface NewFrameworkOptions{name:string;language:FrameworkLanguage}
export type NewProjectState={open:boolean;busy:boolean;errorKey?:string};
let state:NewProjectState={open:false,busy:false};const listeners=new Set<()=>void>();
let createHandler:((options:NewFrameworkOptions)=>Promise<boolean>)|null=null;
function set(next:NewProjectState){state=next;listeners.forEach(fn=>fn());}
export const newProjectFlow={getSnapshot:()=>state,subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},
 open(){set({open:true,busy:false});},cancel(){if(!state.busy)set({open:false,busy:false});},
 async create(options:NewFrameworkOptions){if(state.busy)return;set({open:true,busy:true});try{if(!createHandler)throw Error('frameworks.folderUnavailable');const created=await createHandler(options);set({open:!created,busy:false});}catch(error){const key=error instanceof Error&&/^frameworks\.[a-zA-Z]+$/.test(error.message)?error.message:'frameworks.createFailed';set({open:true,busy:false,errorKey:key});}},
 install(handler:(options:NewFrameworkOptions)=>Promise<boolean>){createHandler=handler;return()=>{if(createHandler===handler)createHandler=null;};}
};
