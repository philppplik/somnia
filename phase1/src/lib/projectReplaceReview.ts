import {scopeProjectFiles,type ProjectSearchScope} from './projectSearchScope';
import {replaceInProject,type SearchOptions} from './projectSearch';
export interface ProjectReplaceReview {query:string;replacement:string;options:SearchOptions;files:Record<string,string>;changed:Record<string,string>;count:number;scope:ProjectSearchScope}
/** Exact in-memory review. No disk writes or project execution. */
export function reviewProjectReplace(files:Record<string,string>,query:string,replacement:string,options:SearchOptions,scope:ProjectSearchScope={include:'',exclude:''}):ProjectReplaceReview {
 const pinned=structuredClone(files),scoped=scopeProjectFiles(pinned,scope);if(scoped.error)throw Error('invalid-scope');const result=replaceInProject(scoped.files,query,replacement,options);
 if(Object.keys(result.changed).length>100||Object.entries(result.changed).reduce((n,[path,text])=>n+new TextEncoder().encode(text+pinned[path]).length,0)>512*1024)throw Error('review-limit');
 return {query,replacement,options:{...options},scope:{...scope},files:pinned,...result};
}
export function reviewedReplaceOperations(review:ProjectReplaceReview,current:Record<string,string>,query:string,replacement:string,options:SearchOptions,scope:ProjectSearchScope={include:'',exclude:''}){
 if(scope.include!==review.scope.include||scope.exclude!==review.scope.exclude||query!==review.query||replacement!==review.replacement||JSON.stringify(options)!==JSON.stringify(review.options)||Object.keys(current).length!==Object.keys(review.files).length||Object.entries(review.files).some(([path,text])=>!Object.hasOwn(current,path)||current[path]!==text))throw Error('review-stale');
 return Object.entries(review.changed).map(([file,text])=>({type:'replaceSource' as const,file,text}));
}
