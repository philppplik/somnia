import {registerMediaCloseCleanup,registerMediaCloseGuard} from '../media';
import {installBeforeUnload} from '../closeFlow';
import {t} from '../i18n';
import {discardDocument,hasUnsavedDocuments,isDocumentDirty} from './session';
/**
 * Unsaved Documents edits survive studio and tab switches, so closing is the one way to lose them.
 * Closing a file or the window asks first; a close only drops the session after every guard agreed.
 * Nothing here writes to the opened file: edits leave only through Save a copy.
 */
if(typeof window!=='undefined'){
 installBeforeUnload(hasUnsavedDocuments);
 registerMediaCloseGuard(name=>!isDocumentDirty(name)||window.confirm(t('documents.session.discard',{name})));
 registerMediaCloseCleanup(name=>discardDocument(name));
}
