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
 {combo:'Mod+G',labelKey:'interface.sc.group'},
 {combo:'Mod+Shift+G',labelKey:'interface.sc.ungroup'},
 {combo:'Del',labelKey:'interface.sc.delete'},
 {combo:'Enter/Space',labelKey:'interface.sc.select'},
 {combo:'Esc',labelKey:'interface.sc.cancel'},
 {combo:'Shift+Click',labelKey:'interface.sc.multiSelect'},
 {combo:'Shift+1',labelKey:'interface.sc.zoomFit'},
 {combo:'Shift+2',labelKey:'interface.sc.zoomSelection'},
 {combo:'Shift+0',labelKey:'interface.sc.zoom100'},
 {combo:'?',labelKey:'interface.sc.openCheatsheet'},
];
export const formatInterfaceShortcut=(combo:string,mac:boolean)=>combo.replace(/^Mod\+/,mac?'⌘+':'Ctrl+');
