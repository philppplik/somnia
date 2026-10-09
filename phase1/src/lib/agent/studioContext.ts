/** Host-owned sidebar copy. These suggestions fill the prompt only; they never run tools. */
export interface StudioAgentContext {label:string;scope:string;actions:readonly string[]}
const contexts:Record<string,StudioAgentContext>={
 code:{label:'Code',scope:'Source and selected element',actions:['Help me design a landing page','Make this section responsive','Fix the A11y problems']},
 documents:{label:'Docs',scope:'Open document text, read-only AI context',actions:['Summarize this document','Suggest clearer wording','Review the structure']},
 sheets:{label:'Sheets',scope:'Selected cell and formula, read-only AI context',actions:['Explain this formula','Suggest a formula for this cell','Check this cell for errors']},
 slides:{label:'Slides',scope:'Canonical slide text, reviewed text edits',actions:['Improve the slide headings','Make slide text concise','Review the presentation story']},
 sound:{label:'Sounds',scope:'Audio metadata and edit settings, no audio bytes',actions:['Suggest a clean fade in and fade out','Explain the current sound settings','Suggest normalization for this clip']},
 video:{label:'Video',scope:'Timeline and track metadata, read-only AI context',actions:['Review the timeline structure','Explain the export settings','Suggest pacing improvements']},
 photos:{label:'Photos',scope:'Develop settings and dimensions, no pixels',actions:['Suggest balanced exposure','Explain the current photo settings','Suggest a subtle contrast adjustment']},
 photo:{label:'Photos',scope:'Non-destructive operations and dimensions, no pixels',actions:['Suggest a subtle photo adjustment','Explain the operation stack','Suggest a crop']},
 designer:{label:'Vector',scope:'SVG source, read-only AI context',actions:['Review this SVG structure','Suggest accessible SVG labels','Explain the vector shapes']},
 vector:{label:'Vector',scope:'SVG source, read-only AI context',actions:['Review this SVG structure','Suggest accessible SVG labels','Explain the vector shapes']},
 design:{label:'Design',scope:'Source and selected element',actions:['Review the visual hierarchy','Suggest accessible layout improvements','Explain this design']},
};
export function studioAgentContext(studio:string,path:string,editorKind?:string|null):StudioAgentContext {
 if(editorKind==='raster')return contexts.photo;
 if(/\.(mp4|m4v|mov|webm|mkv)$/i.test(path))return contexts.video;
 if(/\.(mp3|wav|flac|ogg|oga|aif|aiff)$/i.test(path))return contexts.sound;
 if(/\.pptx$/i.test(path))return contexts.slides;
 if(/\.docx$/i.test(path))return contexts.documents;
 if(/\.xlsx$/i.test(path))return contexts.sheets;
 if(/\.svg$/i.test(path))return contexts.designer;
 if(/\.(png|jpe?g|webp)$/i.test(path))return contexts.photos;
 return contexts[studio]??{label:studio,scope:'Active document only',actions:['Explain this document','Suggest improvements']};
}
