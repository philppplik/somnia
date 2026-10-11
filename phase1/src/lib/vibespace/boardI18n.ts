import en from '../../locales/vibespace/board/en.json';
import de from '../../locales/vibespace/board/de.json';
import es from '../../locales/vibespace/board/es.json';
import fr from '../../locales/vibespace/board/fr.json';
import ptBR from '../../locales/vibespace/board/pt-BR.json';
/** A8 board strings in their own catalogue files (no shared-locale merge hotspot); merged by lib/i18n.ts. */
export const BOARD_CATALOGUES:Record<string,Record<string,string>>={en,de,es,fr,'pt-BR':ptBR};
