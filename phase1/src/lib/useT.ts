import {useSyncExternalStore} from 'react';
import {getLocale,subscribeLocale,translate,type Params} from './i18n';
/** React hook: re-renders when the language changes. */
export function useT(){
 const locale=useSyncExternalStore(subscribeLocale,getLocale,getLocale);
 return {locale,t:(key:string,params?:Params)=>translate(locale,key,params)};
}
