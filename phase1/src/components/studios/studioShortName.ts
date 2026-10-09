/** Compact product names stay consistent across the studio switcher and its tooltips. */
const shortNames:Readonly<Record<string,string>>={
 code:'Code',documents:'Docs',sheets:'Sheets',slides:'Slides',sound:'Sounds',
 photos:'Photos',photo:'Photos',video:'Video',design:'Design',designer:'Design',vector:'Vector'
};
/** New studios remain usable even before their compact product name is added here. */
export function studioShortName(id:string,translatedLabel:string):string{
 return shortNames[id]??translatedLabel.replace(/^Somnia\s+/,'');
}
