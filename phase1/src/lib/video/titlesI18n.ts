import en from '../../locales/video-titles/en.json';
import de from '../../locales/video-titles/de.json';
import es from '../../locales/video-titles/es.json';
import fr from '../../locales/video-titles/fr.json';
import ptBR from '../../locales/video-titles/pt-BR.json';
/** Title-card strings (`video.card.*`) for the five UI languages. Merged into VIDEO_CATALOGUES (see INTEGRATION.md). */
export const TITLE_CATALOGUES:Record<string,Record<string,string>>={en,de,es,fr,'pt-BR':ptBR};
