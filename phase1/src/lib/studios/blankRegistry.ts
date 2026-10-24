export type BlankProjectFactory=()=>void|Promise<void>;
export const factories=new Map<string,BlankProjectFactory>();
/** Runtime studios with their own document store register a factory at module load. */
export function registerBlankProjectFactory(studioId:string,factory:BlankProjectFactory):()=>void{
 if(factories.has(studioId))throw Error(`Blank project factory already registered: ${studioId}`);
 factories.set(studioId,factory);return()=>{if(factories.get(studioId)===factory)factories.delete(studioId);};
}
