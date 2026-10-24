export type VoiceFailureCode='permission'|'device'|'capture'|'too-large'|'timeout'|'decode'|'transcribe';
/** Safe display categories only. Never expose raw platform/sidecar errors or audio data. */
export class VoiceFailure extends Error{constructor(readonly code:VoiceFailureCode){super('Local voice '+code);this.name='VoiceFailure';}}
export function voiceFailureCode(error:unknown,fallback:VoiceFailureCode):VoiceFailureCode{if(error instanceof VoiceFailure)return error.code;if(error&&typeof error==='object'&&'name' in error){if(['NotAllowedError','SecurityError'].includes(String(error.name)))return 'permission';if(['NotFoundError','NotReadableError','OverconstrainedError'].includes(String(error.name)))return 'device';}return fallback;}
