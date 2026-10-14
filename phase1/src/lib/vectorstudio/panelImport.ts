import {commandDispatcher} from '../commandDispatcher';
import {importSvg,LIMITS} from '../vectorio';
import {t} from '../i18n';
import {getVectorSession} from './session';

/** Strict replacement is a single edit, never a new session or an append. */
export async function replaceVectorFromFile(file:Pick<File,'size'|'text'>){
 const before=getVectorSession().doc;
 if(!getVectorSession().open)throw new Error(t('vector.shell.empty'));
 if(file.size>LIMITS.maxBytes)throw new RangeError('SVG exceeds the 8 MiB import limit.');
 const result=importSvg(await file.text(),{strict:true});
 if(getVectorSession().doc!==before)throw new Error(t('vector.shell.importChanged'));
 await commandDispatcher.runCommand('vector.replaceDocument',{document:result.doc},{origin:'ui'});
 return result.warnings;
}
