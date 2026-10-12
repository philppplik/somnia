import {getVersionsSession} from './versionsSession';
import type {ProjectResourceReply} from './previewResources';
/** Read a clicked HTML target through the existing project capability, never an absolute disk path. */
export async function readPreviewHtml(path:string):Promise<string|null>{
 const session=getVersionsSession();if(!session||!/\.html?$/i.test(path))return null;
 const reply=await session.port.invoke<ProjectResourceReply>('read_project_resource',{projectId:session.projectId,path});
 if(getVersionsSession()!==session||reply.size>8_000_000||!/^text\/html(?:;|$)/i.test(reply.mime))return null;
 const raw=atob(reply.data);const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes);
}
