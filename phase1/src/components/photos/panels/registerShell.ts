import {photosStudio} from '../../../lib/studios/photos';
import {registerStudioPanels} from '../../studios/registerStudioPanels';
import {PHOTOS_PANEL_HOSTS} from './hostMap';
/** Components half of the Photos manifest. Imported once by App.tsx, like documents/registerShell. */
export const disposePhotosShell=registerStudioPanels(photosStudio,{panels:PHOTOS_PANEL_HOSTS});
if(import.meta.hot)import.meta.hot.dispose(()=>disposePhotosShell());
