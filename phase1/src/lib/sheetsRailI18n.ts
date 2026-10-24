import railEn from '../locales/sheets/rail.en.json';
import railDe from '../locales/sheets/rail.de.json';
import railEs from '../locales/sheets/rail.es.json';
import railFr from '../locales/sheets/rail.fr.json';
import railPtBR from '../locales/sheets/rail.pt-BR.json';
/**
 * Sheets studio rail tooltips (studio shell v2), merged into the app catalogues by lib/i18n.ts.
 * Lives at the root lib level because lib/i18n.ts (root lib) must not import studio libs (layers rule).
 */
export const SHEETS_RAIL_CATALOGUES:Record<string,Record<string,string>>={
 en:railEn,de:railDe,es:railEs,fr:railFr,'pt-BR':railPtBR,
};
