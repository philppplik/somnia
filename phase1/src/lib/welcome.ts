/** "Welcome to Somnia vX" popup: shown once per version, right after an update. Never on a first install (nothing to welcome back from) and never twice for the same version. State is one localStorage key; nothing leaves the device. */
export const WELCOME_KEY='somnia.welcome.seen.v1';
/** Keys written by earlier Somnia versions on every start. Their presence means this is an update from a build that predates the popup, not a first install. */
const PRIOR_USE_KEYS=['somnia.updateCheck.last','somnia.updateCheck.v1'];
export type KeyValueStore=Pick<Storage,'getItem'>;
export function shouldShowWelcome(store:KeyValueStore,release:string):boolean{
 try{const seen=store.getItem(WELCOME_KEY);
  if(seen!==null)return seen!==release;
  return PRIOR_USE_KEYS.some(k=>store.getItem(k)!==null);
 }catch{return false;}}
export function markWelcomeSeen(store:Pick<Storage,'setItem'>,release:string):void{try{store.setItem(WELCOME_KEY,release);}catch{/* storage unavailable: the popup may show again, nothing breaks */}}
export const changelogUrl=(repoUrl:string,release:string)=>`${repoUrl}/releases/tag/v${release.replace(/^v/,'')}`;
