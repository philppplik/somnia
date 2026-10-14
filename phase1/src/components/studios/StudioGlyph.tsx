import {Bot,Aperture,AudioWaveform,Code2,Film,LayoutTemplate,Pencil,FileText,Sparkles,Presentation,Table2,type LucideIcon} from '../../lib/icons';
/** Pill glyph per studio; unknown names fall back to the code glyph. Add one entry per registered studio. */
const glyphs:Record<string,LucideIcon>={Bot,Code2,FileText,AudioWaveform,Table2,Presentation,Film,Pencil,LayoutTemplate,Aperture,Sparkles};
export function StudioGlyph({icon}:{icon:string}){const Glyph=glyphs[icon]??Code2;return <Glyph aria-hidden="true"/>;}
