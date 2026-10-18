import {registerMediaCloseCleanup,registerMediaCloseGuard} from '../media';
import {installBeforeUnload} from '../closeFlow';
import {registerCloseGuard} from '../closeGuards';
import {windowCloseBlocked} from '../sessionSafety/closeRisk';
import {t} from '../i18n';
import {discardDocument,hasUnsavedDocuments,isDocumentDirty} from './session';
/**
 * Unsaved Documents edits survive studio and tab switches, so closing is the one way to lose them.
 * Closing a file or the window asks first; a close only drops the session after every guard agreed.
 * Nothing here writes to the opened file: edits leave only through Save a copy.
 * Closing the file is the user's explicit discard, so it also deletes the recovery copy; closing the window keeps it.
 */
if(typeof window!=='undefined'){
 installBeforeUnload(hasUnsavedDocuments);
 registerMediaCloseGuard(name=>!isDocumentDirty(name)||window.confirm(t('documents.session.discard',{name})));
 registerMediaCloseCleanup(name=>discardDocument(name));
 registerCloseGuard(()=>windowCloseBlocked('documents',{recoverable:names=>t('documents.session.closeWindowSafe',{names}),unprotected:names=>t('documents.session.closeWindowUnsafe',{names})},m=>window.confirm(m)));
}
