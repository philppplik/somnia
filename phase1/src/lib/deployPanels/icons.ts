import {makeVadivamIcon,type LucideIcon} from '../icons';
import {registerRailIcons} from '../shell/railIcons';
/** Publish rail glyphs (Vadivam style: 24px grid, stroke 2, round caps). Cloud with an upward arrow, and a log list. */
export const UploadCloudIcon=makeVadivamIcon('upload-cloud','<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.9 8.6 4.8 4.8 0 0 1 17 18"/><path d="M12 21v-8m-3 3 3-3 3 3"/>');
export const ScrollTextIcon=makeVadivamIcon('scroll-text','<path d="M5 4h14v16H5z"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/>');
export const DEPLOY_RAIL_ICON_MAP:Record<string,LucideIcon>={UploadCloud:UploadCloudIcon,ScrollText:ScrollTextIcon};
let done=false;
export function registerDeployRailIcons(){if(done)return;done=true;registerRailIcons(DEPLOY_RAIL_ICON_MAP);}
registerDeployRailIcons();
