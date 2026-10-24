import en from '../../locales/vibespace/en.json';
import de from '../../locales/vibespace/de.json';
import es from '../../locales/vibespace/es.json';
import fr from '../../locales/vibespace/fr.json';
import ptBR from '../../locales/vibespace/pt-BR.json';
/** Vibe Space strings in their own catalogue files (no shared-locale merge hotspot); merged by lib/i18n.ts. */
export const VIBESPACE_CATALOGUES:Record<string,Record<string,string>>={en,de,es,fr,'pt-BR':ptBR};
