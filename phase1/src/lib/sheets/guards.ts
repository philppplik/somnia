import {registerCloseGuard} from '../closeGuards';
import {windowCloseBlocked} from '../sessionSafety/closeRisk';
import {t} from '../i18n';
/** Closing the app window with unsaved workbook edits asks first, and says whether a verified recovery copy exists. */
if(typeof window!=='undefined'){
 registerCloseGuard(()=>windowCloseBlocked('sheets',{recoverable:names=>t('sheets.closeWindowSafe',{names}),unprotected:names=>t('sheets.closeWindowUnsafe',{names})},m=>window.confirm(m)));
}
