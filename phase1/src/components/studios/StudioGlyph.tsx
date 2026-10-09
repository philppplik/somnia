import {AudioWaveform,Code2,FileText,Presentation,Table2,type LucideIcon} from '../../lib/icons';
/** Pill glyph per studio; unknown names fall back to the code glyph. Add one entry per registered studio. */
const glyphs:Record<string,LucideIcon>={Code2,FileText,AudioWaveform,Table2,Presentation};
export function StudioGlyph({icon}:{icon:string}){const Glyph=glyphs[icon]??Code2;return <Glyph aria-hidden="true"/>;}
