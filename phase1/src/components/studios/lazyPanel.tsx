import {lazy,Suspense,type ComponentType} from 'react';
/** Only called with source-owned factories. Manifest strings never become import paths. */
export function lazyPanel<P extends object>(load:()=>Promise<ComponentType<P>>){
 const Host=lazy(async()=>({default:await load()}));
 return function LazyPanel(props:P){return <Suspense fallback={null}><Host {...props}/></Suspense>;};
}
