import {SheetsCellPanel} from './SheetsPanels';
import {useStudioContext} from '../../lib/shell/studioContext';
export function SheetsInspector(){return <SheetsCellPanel panelId="cell" context={useStudioContext('sheets')}/>;}
