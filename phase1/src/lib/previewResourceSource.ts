/** Where the live preview reads linked project files from: the open project's file port and id. Set by the file adapter when a project is attached, cleared on close. */
export type PreviewResourceInvoke=<T>(command:string,args?:Record<string,unknown>)=>Promise<T>;
export interface PreviewResourceSource{invoke:PreviewResourceInvoke;projectId:string}
let source:PreviewResourceSource|null=null;
export const setPreviewResourceSource=(next:PreviewResourceSource|null)=>{source=next;};
export const getPreviewResourceSource=():PreviewResourceSource|null=>source;
