import en from '../locales/slides-rail/en.json';
import de from '../locales/slides-rail/de.json';
import es from '../locales/slides-rail/es.json';
import fr from '../locales/slides-rail/fr.json';
import ptBR from '../locales/slides-rail/pt-BR.json';
/** Studio rail labels (`<studio>.rail.<itemId>`), merged into the app catalogues by lib/i18n.ts. Slides entries so far. */
export const RAIL_CATALOGUES:Record<string,Record<string,string>>={en,de,es,fr,'pt-BR':ptBR};
