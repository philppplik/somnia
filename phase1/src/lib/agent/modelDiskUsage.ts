import type {InstalledModel} from './localModels';
/** Inventory-reported logical sizes, not physical/unique disk blocks: models can share layers. */
export function reportedModelDiskUsage(models:readonly InstalledModel[]):{bytes:number;known:number;unknown:number}{let bytes=0,known=0,unknown=0;for(const model of models){if(typeof model.sizeBytes==='number'&&Number.isSafeInteger(model.sizeBytes)&&model.sizeBytes>=0&&Number.isSafeInteger(bytes+model.sizeBytes)){bytes+=model.sizeBytes;known++;}else unknown++;}return {bytes,known,unknown};}
