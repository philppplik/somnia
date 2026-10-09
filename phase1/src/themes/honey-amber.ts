/** Add these choices to the central registry and its ThemeChoice union.
 * Both modes intentionally share a palette key, matching the existing DOM contract.
 * CSS is separate so integration can import it after the base tokens.
 */
export const HONEY_AMBER_CHOICES = [
  {id: 'honey-amber-light', label: 'Honey Amber (light)', mode: 'light', palette: 'honey-amber'},
  {id: 'honey-amber-dark', label: 'Honey Amber (dark)', mode: 'dark', palette: 'honey-amber'},
] as const;
