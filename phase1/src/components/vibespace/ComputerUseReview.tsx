import {t} from '../../lib/i18n';
/** Preparation notice, not a consent control. No native adapter exists in this package.
 * Keep this in review rather than imply that a folder or MCP grant enables desktop control. */
export function ComputerUseReview(){
 return <section className="vs-card" aria-label={t('vibespace.computerUse.title')} data-computer-use="unavailable">
  <h3>{t('vibespace.computerUse.title')}</h3>
  <p role="status" className="vs-notice">{t('vibespace.computerUse.unavailable')}</p>
  <p>{t('vibespace.computerUse.session')}</p>
  <p className="vs-muted">{t('vibespace.computerUse.capture')}</p>
 </section>;
}
