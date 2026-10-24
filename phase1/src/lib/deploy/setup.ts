
export interface DeployDnsRecord { name: string; type: 'A' | 'AAAA'; values: string[]; source: 'system' | 'doh'; ready: boolean }
export interface DeployDnsCheck { ready: boolean; expected: string[]; records: DeployDnsRecord[]; staleIpv6: boolean; wwwMissing: boolean; resolverFailed: boolean }
export interface DeployBootstrapReport { outcome: 'done' | 'sudo-denied' | 'unsupported-server' | 'port-in-use' | 'failed'; steps: string[]; hostFingerprint?: string | null; port?: number | null }
/** Ephemeral input. Never put this in state, local storage, commands, activity logs or errors. */
export interface DeployBootstrapInput { targetId: string; loginUser: string; loginPassword: string; sudoPassword: string; privilege: 'root' | 'sudo-passwordless' | 'sudo-password' }
export interface DeploySetupBackend {
 bootstrapScript(targetId: string): Promise<string>;
 bootstrapRun(input: DeployBootstrapInput): Promise<DeployBootstrapReport>;
 dnsCheck(targetId: string): Promise<DeployDnsCheck>;
}
export const SETUP_OPEN_EVENT = 'somnia:deploy-setup-open';
export function openDeploySetup(targetId: string): void { window.dispatchEvent(new CustomEvent(SETUP_OPEN_EVENT, { detail: { targetId } })); }
export function dnsRows(ips: string[]) {
 return ips.flatMap(ip => [{ type: ip.includes(':') ? 'AAAA' : 'A', name: '@', value: ip }, { type: ip.includes(':') ? 'AAAA' : 'A', name: 'www', value: ip }]);
}
/** Switch is the point of no return. Once observed, late upload events cannot re-enable cancel. */
export function mayCancel(steps: { step: string }[]): boolean { return !steps.some(s => ['switch', 'health', 'prune', 'done'].includes(s.step)); }
