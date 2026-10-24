import {makeVadivamIcon,type LucideIcon} from '../icons';
import {registerRailIcons} from '../shell/railIcons';
/**
 * Rail icons for the Documents studio (Vadivam set, same 24px grid and stroke 2 as lib/icons).
 * Registered in the shell rail icon registry (lib/shell/railIcons.ts) when the studio manifest loads.
 * Generic names on purpose: the same function keeps the same glyph in every studio (concept 3.6).
 * Glyphs: vadivam `list`, `book-open` and `file-search-corner` (iconify), inlined like lib/icons does.
 */

/** vadivam:list — the outline (paragraph and table list) of the open document. */
export const ListIcon=makeVadivamIcon('list','<path d="M9 6h12M9 12h12M9 18h12M3 6h2m-2 6h2m-2 6h2"/>');
/** vadivam:book-open — page thumbnails of the open document. */
export const BookOpenIcon=makeVadivamIcon('book-open','<path d="M12 11.678c.023 2.69 0 5.38 0 8.07l-.001.002c-1.455-2.095-2.436-2.2-5.077-2.2H3.776c-.621 0-.931 0-1.169-.116c-.647-.316-.607-.985-.607-1.59V6.456c0-1.24.405-1.707 1.778-1.707h2.889c1.867 0 2.8 0 3.513.349c1.603.784 1.8 4.343 1.82 6.579c.019-2.236.215-5.795 1.819-6.58c.713-.348 1.647-.348 3.514-.348h2.889c1.372 0 1.777.465 1.777 1.707v9.386c0 .605.04 1.275-.606 1.59c-.237.117-.548.117-1.169.117h-3.148c-2.64 0-3.621.104-5.076 2.198"/>');
/** vadivam:file-search-corner — find inside the open document (distinct from the global project Search). */
export const FileSearchCornerIcon=makeVadivamIcon('file-search-corner','<path d="M10.529 20.03L12.5 22m-.986-4.5a3.5 3.5 0 0 1-1.027 2.475a3.51 3.51 0 0 1-4.96 0a3.496 3.496 0 0 1 0-4.95a3.51 3.51 0 0 1 4.96 0a3.5 3.5 0 0 1 1.027 2.475M9.476 2H7.5a3 3 0 0 0-3 3v5.5M9.476 2C10.856 2 12 3.119 12 4.5V7a2.5 2.5 0 0 0 2.5 2.5H17a2.5 2.5 0 0 1 2.5 2.5M9.476 2C13.576 2 19.5 7.956 19.5 12m0 0v7a3 3 0 0 1-3 3"/>');

export const DOCUMENTS_RAIL_ICON_MAP:Record<string,LucideIcon>={List:ListIcon,BookOpen:BookOpenIcon,FileSearchCorner:FileSearchCornerIcon};
let registered=false;
/** Idempotent. The registry is first-wins, so registering twice or after another studio is harmless. */
export function registerDocumentsRailIcons(){if(registered)return;registered=true;registerRailIcons(DOCUMENTS_RAIL_ICON_MAP);}
