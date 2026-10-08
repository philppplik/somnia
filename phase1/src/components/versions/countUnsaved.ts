/** Number of project files whose editor text differs from what is on disk. */
export const countUnsaved=(files:Readonly<Record<string,string>>,saved:(f:string)=>string)=>Object.entries(files).filter(([f,t])=>saved(f)!==t).length;
