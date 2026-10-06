/** Project file paths shared through a collab session. A guest controls these keys, so the host checks every one before touching disk. */
export function isSafeProjectPath(p:unknown):p is string{
 if(typeof p!=='string'||p===''||p.length>260)return false;
 if(p.includes('\0')||p.includes('\\')||p.startsWith('/')||/^[a-zA-Z]:/.test(p))return false;
 return p.split('/').every(seg=>seg!==''&&seg!=='.'&&seg!=='..');
}
export function assertSafeProjectPath(p:unknown):string{if(!isSafeProjectPath(p))throw new Error(`Unsafe project path: ${String(p)}`);return p;}
/** Text files that are shared (same set the app opens as text). Media and other binaries are not shared. */
export const isCollabFile=(file:string)=>/\.(html?|css|js|json|svg|txt|md)$/i.test(file)&&isSafeProjectPath(file);
