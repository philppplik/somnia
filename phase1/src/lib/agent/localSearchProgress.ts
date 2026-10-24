export interface LocalBuildProgress{stage:'preparing'|'embedding'|'validating';completed:number;total:number;sources:number}
export interface EmbeddingBatchProgress{completed:number;total:number}
export function validBatchProgress(value:EmbeddingBatchProgress,total:number,previous:number){if(!Number.isSafeInteger(value.completed)||value.total!==total||value.completed<previous||value.completed>total||value.completed<0)throw Error('Invalid embedding progress');return value.completed;}
