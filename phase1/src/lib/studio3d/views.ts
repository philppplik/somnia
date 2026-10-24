/**
 * Named views (camera bookmarks): pure data and validation helpers, no three.js, so they run under tsx --test.
 * The viewport owns the actual camera; these helpers own naming, renaming, overwriting and the digit-slot shortcuts.
 */
import type {NamedView} from './model';
export const MAX_VIEW_NAME=60;
export class ViewError extends Error{constructor(message:string){super(message);this.name='ViewError';}}
/** Validates and normalizes a view name: whitespace runs collapse, the ends trim. Empty names are refused. */
export function viewName(text:string):string{
 const clean=text.replace(/\s+/g,' ').trim();
 if(clean==='')throw new ViewError('A view name cannot be empty.');
 if(clean.length>MAX_VIEW_NAME)throw new ViewError(`View names are limited to ${MAX_VIEW_NAME} characters.`);
 return clean;
}
/** The first free "View N" name, so default names never collide even after removals. */
export function nextViewName(views:readonly NamedView[],base='View'):string{
 for(let i=1;;i++)if(!views.some(v=>v.name===`${base} ${i}`))return `${base} ${i}`;
}
/** Overwrites the stored camera of an existing bookmark, keeping its name and position in the list. */
export function updateView(views:readonly NamedView[],name:string,camera:Omit<NamedView,'name'>):NamedView[]{
 if(!views.some(v=>v.name===name))throw new ViewError(`There is no saved view named ${name}.`);
 return views.map(v=>v.name===name?{name,...camera}:v);
}
/** Renames a bookmark; refuses unknown sources and empty or duplicate targets. */
export function renameView(views:readonly NamedView[],from:string,to:string):NamedView[]{
 if(!views.some(v=>v.name===from))throw new ViewError(`There is no saved view named ${from}.`);
 const name=viewName(to);
 if(name!==from&&views.some(v=>v.name===name))throw new ViewError(`A view named ${name} already exists.`);
 return views.map(v=>v.name===from?{...v,name}:v);
}
/** Maps a keyboard code (Digit1-Digit9 or Numpad1-Numpad9) to a zero-based view slot, or null. */
export function viewSlotIndex(code:string):number|null{
 const m=/^(?:Digit|Numpad)([1-9])$/.exec(code);
 return m?Number(m[1])-1:null;
}
