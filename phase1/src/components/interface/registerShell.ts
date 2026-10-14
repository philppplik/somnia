import {interfaceStudio} from '../../lib/studios/interface';
import {registerStudioPanels} from '../studios/registerStudioPanels';
import {InterfaceLayers,InterfaceProperties} from './InterfacePanels';
const dispose=registerStudioPanels(interfaceStudio,{panels:{'interface.layers':InterfaceLayers,'interface.properties':InterfaceProperties}});
if(import.meta.hot)import.meta.hot.dispose(dispose);
