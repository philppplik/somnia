import {createHash,randomBytes} from 'node:crypto';
/** Independent PKCE oracle (RFC 7636) for tests. The production code must NOT import this. */
export const b64url=(b:Buffer|Uint8Array)=>Buffer.from(b).toString('base64url');
export const s256=(verifier:string)=>b64url(createHash('sha256').update(verifier,'ascii').digest());
export const isValidVerifier=(v:string)=>/^[A-Za-z0-9\-._~]{43,128}$/.test(v);
export const newVerifier=()=>b64url(randomBytes(32));
