/** Virtual copies (P107): a copy shares the source bytes and starts with the source's develop settings, but gets its own session, rating, flags, labels, tags and stacks - all keyed by name. Originals are never touched. */
/** Next free copy name: '<base> (Kopie N)<ext>'. The closing paren keeps copies out of burst detection (detectSeries only reads trailing digits). The word is localized by the caller. */
export function nextCopyName(source:string,word:string,isTaken:(name:string)=>boolean):string{
 const m=source.match(/^(.*?)(\.[^.\\/]+)?$/);
 const base=m?.[1]??source,ext=m?.[2]??'';
 for(let n=1;;n++){
  const name=`${base} (${word} ${n})${ext}`;
  if(!isTaken(name))return name;
 }
}
