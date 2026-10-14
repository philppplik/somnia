export const guideSources:Record<'en'|'de',URL>;
export function readLocalGuides():Record<'en'|'de',string>;
export function generateLocalGuide(output?:URL):string;
