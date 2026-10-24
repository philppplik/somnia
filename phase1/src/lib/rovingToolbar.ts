/**
 * Roving tabindex for a toolbar whose buttons are rendered by other components.
 * Exactly one enabled button is a Tab stop (the last focused one, else the first pressed one, else the first);
 * Arrow keys, Home and End (handled by the toolbar) move focus. Tab then leaves the toolbar in one press.
 */
export function applyRovingTabIndex(root:ParentNode,remembered?:Element|null):HTMLElement|null{
 const items=[...root.querySelectorAll<HTMLElement>('button')].filter(b=>!(b as HTMLButtonElement).disabled);
 if(!items.length)return null;
 const stop=(remembered&&items.includes(remembered as HTMLElement)?remembered as HTMLElement:null)??items.find(b=>b.getAttribute('aria-pressed')==='true')??items[0];
 for(const b of items)b.tabIndex=b===stop?0:-1;
 return stop;
}
