import {CommandTerminalDialog} from './CommandTerminalDialog';
import {LocalRenameDialog} from './LocalRenameDialog';
import {CodeSnippetsDialog} from './CodeSnippetsDialog';
import {NewProjectDialog} from './NewProjectDialog';
import {DropOverlay} from './DropOverlay';
import {SaveDialog} from './SaveDialog';
import {ExportDialog} from './ExportDialog';
import {ExportCenterDialog} from './ExportCenterDialog';
import {ConvertDialog} from './ConvertDialog';
import {CloseProjectDialog} from './CloseProjectDialog';
import {CloseAllDialog} from './CloseAllDialog';
import {ShareDialog} from './ShareDialog';
import {CloseDialog} from './CloseDialog';
import {WelcomeDialog} from './WelcomeDialog';
/** Dialog hosting is independent of status-bar visibility and context. */
export function AppDialogs(){return <><CommandTerminalDialog/><LocalRenameDialog/><CodeSnippetsDialog/><NewProjectDialog/><DropOverlay/><SaveDialog/><ExportDialog/><ExportCenterDialog/><ConvertDialog/><CloseProjectDialog/><CloseAllDialog/><ShareDialog/><CloseDialog/><WelcomeDialog/></>;}
