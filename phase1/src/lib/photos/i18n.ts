import en from '../../locales/photos/en.json';
import de from '../../locales/photos/de.json';
import es from '../../locales/photos/es.json';
import fr from '../../locales/photos/fr.json';
import ptBR from '../../locales/photos/pt-BR.json';
import railEn from '../../locales/photos/rail.en.json';
import railDe from '../../locales/photos/rail.de.json';
import railEs from '../../locales/photos/rail.es.json';
import railFr from '../../locales/photos/rail.fr.json';
import railPtBR from '../../locales/photos/rail.pt-BR.json';
/** Photos Studio strings, merged into the app catalogues by lib/i18n.ts. `rail.*` holds the studio rail tooltips. */
export const PHOTOS_CATALOGUES:Record<string,Record<string,string>>={
 en:{...en,...railEn},de:{...de,...railDe},es:{...es,...railEs},fr:{...fr,...railFr},'pt-BR':{...ptBR,...railPtBR},
};
