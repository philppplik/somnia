/** Establish the initial pause BEFORE starting the intake orchestrator. Never claims or acknowledges opens. */
export type IntakePauseReason = 'initial-review' | 'diagnostics-modal';
export function createIntakeGate() {
 let decided = false;
 const pauses = new Set<symbol>();
 const waiters = new Set<() => void>();
 const decisionWaiters = new Set<() => void>();
 const flush = () => { if (decided && !pauses.size) { for (const resolve of waiters) resolve(); waiters.clear(); } };
 return {
  pauseIntake(reason: IntakePauseReason): () => void {
   const handle = Symbol(reason); pauses.add(handle);
   return () => { pauses.delete(handle); flush(); };
  },
  whenIntakeAllowed(): Promise<void> { return decided && !pauses.size ? Promise.resolve() : new Promise(resolve => waiters.add(resolve)); },
  whenInitialReviewDecided(): Promise<void> { return decided ? Promise.resolve() : new Promise(resolve => decisionWaiters.add(resolve)); },
  completeInitialReviewDecision() { decided = true; for (const resolve of decisionWaiters) resolve(); decisionWaiters.clear(); flush(); },
 };
}
const gate = createIntakeGate();
export const { pauseIntake, whenIntakeAllowed, whenInitialReviewDecided, completeInitialReviewDecision } = gate;
