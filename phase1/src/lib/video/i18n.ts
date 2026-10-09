import en from '../../locales/video/en.json';
import de from '../../locales/video/de.json';
import es from '../../locales/video/es.json';
import fr from '../../locales/video/fr.json';
import ptBR from '../../locales/video/pt-BR.json';
import {TITLE_CATALOGUES} from './titlesI18n';
import {FILMSTRIP_CATALOGUES} from './filmstrip-i18n';
/** Video Studio strings plus the title-card and filmstrip catalogues, merged into the app catalogues by lib/i18n.ts. */
const merge=(...cats:Record<string,Record<string,string>>[])=>Object.fromEntries(['en','de','es','fr','pt-BR'].map(tag=>[tag,Object.assign({},...cats.map(c=>c[tag]??{}))]));
export const VIDEO_CATALOGUES:Record<string,Record<string,string>>=merge({en,de,es,fr,'pt-BR':ptBR},TITLE_CATALOGUES,FILMSTRIP_CATALOGUES);
