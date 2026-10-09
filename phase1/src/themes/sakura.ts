import type {Theme} from '../lib/theme';

/** Add both ids to ThemeChoice and spread these entries into THEME_CHOICES.
 * Load ./sakura.css once alongside the other palette styles.
 * A shared palette id lets the existing data-theme mode select either variant.
 */
export const SAKURA_THEME_CHOICES: {
  id: 'sakura-light' | 'sakura-dark';
  label: string;
  mode: Theme;
  palette: string;
}[] = [
  {id: 'sakura-light', label: 'Sakura Pink (light)', mode: 'light', palette: 'sakura'},
  {id: 'sakura-dark', label: 'Sakura Pink (dark)', mode: 'dark', palette: 'sakura'},
];

/** Merge into each locale catalogue during central registration. Settings uses
 * translation keys rather than the registry label, so English alone is not enough.
 */
export const SAKURA_THEME_LABELS: Record<string, Record<string, string>> = {
  en: {'finish.settings.theme.sakura-light': 'Sakura Pink (light)', 'finish.settings.theme.sakura-dark': 'Sakura Pink (dark)'},
  de: {'finish.settings.theme.sakura-light': 'Sakura Pink (hell)', 'finish.settings.theme.sakura-dark': 'Sakura Pink (dunkel)'},
  es: {'finish.settings.theme.sakura-light': 'Rosa Sakura (claro)', 'finish.settings.theme.sakura-dark': 'Rosa Sakura (oscuro)'},
  fr: {'finish.settings.theme.sakura-light': 'Rose Sakura (clair)', 'finish.settings.theme.sakura-dark': 'Rose Sakura (sombre)'},
  'pt-BR': {'finish.settings.theme.sakura-light': 'Rosa Sakura (claro)', 'finish.settings.theme.sakura-dark': 'Rosa Sakura (escuro)'},
};
