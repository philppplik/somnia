import type {FakeClock} from './testSupport/clock';
import type {FakeCredentialStore} from './testSupport/fakeCredentialStore';
/**
 * Contract the OpenAI ChatGPT-plan OAuth client must satisfy. The suite in conformance.ts runs against any
 * implementation of `OAuthSubjectFactory`. Wire the real module in subject.real.test.ts once the dev branch exists.
 * Spec source: docs/agent/AUTH-DECISION.md section 5 and 6.
 */
export type ConnectionState='connected'|'reauthorization-required'|'signed-out'|'credential-locked';
export type ConnectionSummary={state:ConnectionState;scopes:string[];/** never a secret */accountLabel?:string;clientId:string};
export type SubjectDeps={
 /** Hardcoded allowlist in production (auth.openai.com/api/accounts/*). Tests inject the mock's endpoints. Discovery documents are NEVER a runtime source for these. */
 endpoints:{issuer:string;authorize:string;token:string;revoke:string;jwks:string};
 issuer:string;
 clock:FakeClock;
 store:FakeCredentialStore;
 fetch:typeof fetch;
 /** The system browser. The suite supplies one that follows the authorize URL and delivers the callback to the subject's loopback listener. */
 openBrowser:(url:string)=>Promise<void>;
};
export interface OAuthSubject{
 /** Starts the loopback listener, then opens the browser. Resolves when the code exchange and storage are complete. */
 signIn(opts?:{signal?:AbortSignal;timeoutMs?:number}):Promise<ConnectionSummary>;
 /** Current access token, refreshed when expired or past earliest_refresh_at. Concurrent callers share one refresh. */
 accessToken():Promise<string>;
 /** Authenticated request to a resource URL. On 401 refresh once and retry once; never loop. */
 request(url:string,init?:RequestInit):Promise<Response>;
 /** Local sign-out always succeeds; reports whether remote revocation was confirmed. */
 signOut():Promise<{remoteRevoked:boolean}>;
 status():Promise<ConnectionSummary|null>;
}
export type OAuthSubjectFactory=(deps:SubjectDeps)=>OAuthSubject|Promise<OAuthSubject>;
