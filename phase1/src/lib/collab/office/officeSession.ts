import type * as Y from 'yjs';
import {sha256Hex} from '../net/blobProtocol';
import {seedSheetsModel,openSheetsModel,sheetsModelMeta,syncSharedSheets,type SheetsModel} from './sheetsModel';
/**
 * Session orchestration for office files (concept 7.3): the file itself travels once as a
 * blob; the shared model keys edits to the exact bytes the host seeded from, so a guest can
 * verify it holds the same workbook before it applies a single shared op.
 */
export type OfficeAdopt={ok:true;model:SheetsModel}|{ok:false;reason:'not-shared'|'hash-mismatch'|'bad-meta'};
/** Host: stamp the model for a workbook going into the session, seed the tab list from its engine. */
export async function shareSheetsFile(doc:Y.Doc,path:string,bytes:Uint8Array,sheetNames:string[]):Promise<SheetsModel>{
 const baseHash=await sha256Hex(bytes);
 const m=seedSheetsModel(doc,path,baseHash);
 syncSharedSheets(m,sheetNames,'seed');
 return m;
}
/** Guest: adopt the model only when the received blob is byte-identical to what the host seeded from. */
export async function adoptSheetsFile(doc:Y.Doc,path:string,bytes:Uint8Array):Promise<OfficeAdopt>{
 const m=openSheetsModel(doc,path);
 const meta=sheetsModelMeta(m);
 if(!m.meta)return{ok:false,reason:'not-shared'};
 if(!meta)return{ok:false,reason:'bad-meta'};
 return (await sha256Hex(bytes))===meta.baseHash?{ok:true,model:m}:{ok:false,reason:'hash-mismatch'};
}
