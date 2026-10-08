import {DropOverlay} from './DropOverlay';
import {SaveDialog} from './SaveDialog';
import {ExportDialog} from './ExportDialog';
import {ConvertDialog} from './ConvertDialog';
import {CloseProjectDialog} from './CloseProjectDialog';
import {ShareDialog} from './ShareDialog';
import {CloseDialog} from './CloseDialog';
import {WelcomeDialog} from './WelcomeDialog';
/** Dialog hosting is independent of status-bar visibility and context. */
export function AppDialogs(){return <><DropOverlay/><SaveDialog/><ExportDialog/><ConvertDialog/><CloseProjectDialog/><ShareDialog/><CloseDialog/><WelcomeDialog/></>;}
