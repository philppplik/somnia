import {parseAddress} from './format';
import {parsePanelRange} from './panelModel';
import {inRect} from './clipboard';
/**
 * Review checks for the Smart Formula target cell (docs/concepts/hero-action-sheets.md).
 * The builder never guesses or auto-fills an overwrite target: the user picks an explicit
 * output cell, and every problem is shown inline instead of silently applying.
 */
export type FormulaTargetProblem='empty'|'invalid'|'circular';
/**
 * Validates the chosen output cell against the source range.
 * Returns null when the target may receive the formula. An invalid *source* is reported
 * by the formula field itself, so only target problems surface here.
 */
export function formulaTargetProblem(source:string,target:string,nameRange?:string|null):FormulaTargetProblem|null{
 const trimmed=target.trim();
 if(!trimmed)return 'empty';
 const address=parseAddress(trimmed);
 if(!address)return 'invalid';
 const range=parsePanelRange(source)??(nameRange?parsePanelRange(nameRange):null);
 if(range&&inRect(range,address.row,address.col))return 'circular';
 return null;
}
/** True when a read-back cell already holds content that applying the formula would replace. */
export function cellHasContent(cell:{value:{t:string;v?:unknown};formula?:string|null}|undefined):boolean{
 return !!cell&&(cell.value.t!=='Empty'||!!cell.formula);
}
