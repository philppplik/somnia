/** Own catalog for the Memory panel and Skills tab (keys `vsm.*`, `vsk.*`), kept out of the shared locale JSONs. */
import en from '../../locales/vibespace-a6/en.json';
import de from '../../locales/vibespace-a6/de.json';
import es from '../../locales/vibespace-a6/es.json';
import fr from '../../locales/vibespace-a6/fr.json';
import ptBR from '../../locales/vibespace-a6/pt-BR.json';
export type MsKey=keyof typeof en;
export const MS_CATALOGUES:Record<string,Record<string,string>>={en,de,es,fr,'pt-BR':ptBR};
export function ms(locale:string,key:MsKey,params?:Record<string,string|number>):string{
 const raw=MS_CATALOGUES[locale]?.[key]??MS_CATALOGUES.en[key]??key;
 return params?raw.replace(/\{(\w+)\}/g,(m,k)=>k in params?String(params[k]):m):raw;
}
