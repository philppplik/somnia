import {registerCommandScope,type Command} from '../../lib/commandRegistry';
import {getState as getAppState} from '../../store/appStore';
import {executeCommand} from '../../lib/commands';
import {getStudio3DState} from '../../lib/studio3d/session';
import {studio3DController} from '../../lib/studio3d/commands';

/**
 * Mod+S saves the 3D scene while this studio shows one. A scope, like the Photos studio uses, so the core
 * project.save keeps its own shortcut everywhere else and the two never count as a shortcut clash.
 */
export function registerStudio3DSaveShortcut(){
 const command:Command={id:'project.save',title:'Save the 3D scene',category:'Project',shortcut:'Mod+S',allowInInput:true,
  enabled:()=>!!studio3DController()&&getStudio3DState().status==='ready',run:async()=>{await executeCommand('studio3d.save',{});}};
 return registerCommandScope(id=>id==='project.save'&&getAppState().activeStudio==='3d'&&!!studio3DController()&&getStudio3DState().status==='ready'?command:undefined);
}
