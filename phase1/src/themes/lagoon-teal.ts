import type {Theme} from '../lib/theme';

/** Registry metadata only. CSS is imported once by the application stylesheet. */
export const LAGOON_TEAL_THEMES = [
  {id: 'lagoon-teal-light', label: 'Lagoon Teal (light)', mode: 'light', palette: 'lagoon-teal'},
  {id: 'lagoon-teal-dark', label: 'Lagoon Teal (dark)', mode: 'dark', palette: 'lagoon-teal'},
] as const satisfies readonly {id: string; label: string; mode: Theme; palette: string}[];
