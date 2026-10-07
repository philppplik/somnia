import {defineMigrationSuite} from './migrationConformance';
import {migrateLegacyKeys} from './testSupport/referenceMigration';
import {SERVICE} from './testSupport/referenceSubject';
defineMigrationSuite('reference-migration',migrateLegacyKeys,(s,p)=>{
 const idx=JSON.parse(s.get(SERVICE,'connections/index')??'[]') as {id:string;provider:string;generation:number}[];
 const c=idx.find(x=>x.provider===p);return c?s.get(SERVICE,`connections/${c.id}/g${c.generation}`):s.get(SERVICE,p);
});
