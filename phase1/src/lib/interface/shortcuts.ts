export interface InterfaceShortcutEntry {combo:string;labelKey:string;}
/** Single source of truth for the Interface canvas keyboard surface; rendered by the shortcuts cheatsheet dialog. */
export const INTERFACE_SHORTCUT_ENTRIES:readonly InterfaceShortcutEntry[]=[
 {combo:'←↑→↓',labelKey:'interface.sc.move'},
 {combo:'Shift+←↑→↓',labelKey:'interface.sc.moveLarge'},
 {combo:'Alt+←↑→↓',labelKey:'interface.sc.resize'},
 {combo:'Mod+Z',labelKey:'interface.sc.undo'},
 {combo:'Mod+Shift+Z',labelKey:'interface.sc.redo'},
 {combo:'Mod+A',labelKey:'interface.sc.selectAll'},
 {combo:'Mod+C',labelKey:'interface.sc.copy'},
 {combo:'Mod+V',labelKey:'interface.sc.paste'},
 {combo:'Mod+D',labelKey:'interface.sc.duplicate'},
 {combo:'Del',labelKey:'interface.sc.delete'},
 {combo:'Enter/Space',labelKey:'interface.sc.select'},
 {combo:'Esc',labelKey:'interface.sc.cancel'},
 {combo:'Shift+Click',labelKey:'interface.sc.multiSelect'},
 {combo:'?',labelKey:'interface.sc.openCheatsheet'},
];
export const formatInterfaceShortcut=(combo:string,mac:boolean)=>combo.replace(/^Mod\+/,mac?'⌘+':'Ctrl+');
