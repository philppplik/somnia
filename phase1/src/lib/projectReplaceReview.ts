import {scopeProjectFiles,type ProjectSearchScope} from './projectSearchScope';
import type {SearchOptions} from './projectSearch';
import {collectReplaceOccurrences,selectedReplacement,type ReplaceOccurrence} from './projectReplaceSelection';
export interface ProjectReplaceReview {query:string;replacement:string;options:SearchOptions;files:Record<string,string>;changed:Record<string,string>;count:number;scope:ProjectSearchScope;occurrences:readonly ReplaceOccurrence[]}
/** Exact in-memory review. No disk writes or project execution. */
export function reviewProjectReplace(files:Record<string,string>,query:string,replacement:string,options:SearchOptions,scope:ProjectSearchScope={include:'',exclude:''}):ProjectReplaceReview {
 const pinned=structuredClone(files),scoped=scopeProjectFiles(pinned,scope);if(scoped.error)throw Error('invalid-scope');
 const occurrences=collectReplaceOccurrences(scoped.files,query,replacement,options),result=selectedReplacement(pinned,occurrences,occurrences.map(row=>row.id));
 if(Object.keys(result.changed).length>100||Object.entries(result.changed).reduce((n,[path,text])=>n+new TextEncoder().encode(text+pinned[path]).length,0)>512*1024)throw Error('review-limit');
 return {query,replacement,options:{...options},scope:{...scope},files:pinned,occurrences,...result};
}
export function reviewedReplaceOperations(review:ProjectReplaceReview,current:Record<string,string>,query:string,replacement:string,options:SearchOptions,scope:ProjectSearchScope={include:'',exclude:''},selected:readonly number[]=review.occurrences.map(row=>row.id)){
 if(scope.include!==review.scope.include||scope.exclude!==review.scope.exclude||query!==review.query||replacement!==review.replacement||JSON.stringify(options)!==JSON.stringify(review.options)||Object.keys(current).length!==Object.keys(review.files).length||Object.entries(review.files).some(([path,text])=>!Object.hasOwn(current,path)||current[path]!==text))throw Error('review-stale');
 // Selection IDs only choose from the original exact review. Never accept caller-provided edits.
 const actual=reviewProjectReplace(current,query,replacement,options,scope);if(JSON.stringify(actual.occurrences)!==JSON.stringify(review.occurrences)||JSON.stringify(actual.changed)!==JSON.stringify(review.changed)||actual.count!==review.count)throw Error('review-stale');
 return Object.entries(selectedReplacement(review.files,review.occurrences,selected).changed).map(([file,text])=>({type:'replaceSource' as const,file,text}));
}
