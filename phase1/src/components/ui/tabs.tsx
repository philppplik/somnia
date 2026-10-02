// Compound parts adapted from shadcn base-nova Tabs (MIT), Somnia styles only.
import { Tabs as Primitive } from '@base-ui/react/tabs';
export function Tabs({className='',...props}:Primitive.Root.Props){return <Primitive.Root data-slot="tabs" className={`tabs-root ${className}`} {...props}/>;}
export function TabsList({className='',...props}:Primitive.List.Props){return <Primitive.List data-slot="tabs-list" className={`tabs-list ${className}`} {...props}/>;}
export function TabsTrigger({className='',...props}:Primitive.Tab.Props){return <Primitive.Tab data-slot="tabs-trigger" className={`tabs-trigger ${className}`} {...props}/>;}
export function TabsContent({className='',...props}:Primitive.Panel.Props){return <Primitive.Panel data-slot="tabs-content" className={`tabs-content ${className}`} {...props}/>;}
