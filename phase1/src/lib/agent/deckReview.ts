import {parseDeck} from './deckStudio';
export function diffDeck(beforeText:string,afterText:string){const a=parseDeck(beforeText),b=parseDeck(afterText);if(a.widthPt!==b.widthPt||a.heightPt!==b.heightPt||JSON.stringify(a.layouts)!==JSON.stringify(b.layouts)||a.slides.length!==b.slides.length)throw Error('Slide structure changed.');const changes:{slide:number;run:number;before:string;after:string}[]=[];
 for(const s of a.slides){const other=b.slides[s.index];if(s.layout!==other.layout||s.texts.length!==other.texts.length||JSON.stringify(s.notes)!==JSON.stringify(other.notes))throw Error('Only text runs can change.');for(const t of s.texts){const after=other.texts[t.run].text;if(t.text!==after)changes.push({slide:s.index,run:t.run,before:t.text,after});}}
 return changes;
}
