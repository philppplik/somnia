/** Match the visible workspace. The legacy Code canvas displays active media ahead of source. Specialized canvases require their matching media. */
export function activeStudioDocument(app:{activeStudio:string;activeFile:string;editorKind:string|null},media:{active:string|null;items:readonly {name:string;kind:string}[]}):{path:string;media:boolean}{
 const item=media.items.find(m=>m.name===media.active);
 const domains:Record<string,string>={documents:'docx',sheets:'xlsx',slides:'pptx',sound:'audio',video:'video',photos:'image'};
 if(item&&(app.activeStudio==='code'||domains[app.activeStudio]===item.kind||(app.editorKind==='raster'&&item.kind==='image')))return {path:item.name,media:true};
 if(app.activeStudio==='code'||app.activeStudio==='design'||app.activeStudio==='designer'||app.editorKind==='vector')return {path:app.activeFile,media:false};
 return {path:'',media:false};
}
