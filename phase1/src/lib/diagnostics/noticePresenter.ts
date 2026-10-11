import { noticeStore } from './noticeStore';
export const presentError = noticeStore.presentError.bind(noticeStore);
export const presentIntakeOutcome = noticeStore.presentIntakeOutcome.bind(noticeStore);
export const registerIntakeContext = noticeStore.registerIntakeContext.bind(noticeStore);
export const forgetIntakeContext = noticeStore.forgetIntakeContext.bind(noticeStore);
export const acknowledgeNotice = noticeStore.acknowledgeNotice.bind(noticeStore);
/** The integrator attaches subscribeReportedFailures here. No presentation path writes a log. */
export function connectFailureNotices(subscribe: (fn: typeof presentError) => () => void): () => void { return subscribe(presentError); }
