/** Store schema 1. Package format and execution API are versioned independently. */
export const STORE_LIMITS = {compressedBytes: 2 * 1024 * 1024, expandedBytes: 10 * 1024 * 1024, files: 256, fileBytes: 2 * 1024 * 1024, screenshots: 5, iconSourceBytes: 512 * 1024, screenshotSourceBytes: 1024 * 1024} as const;
export const REQUIRED_GATES = ['schema-archive', 'provenance', 'secrets', 'dependencies', 'static-policy', 'malware', 'build-correspondence', 'runtime', 'presentation'] as const;
export type GateName = typeof REQUIRED_GATES[number];
export type EvidenceStatus = 'pass' | 'fail' | 'needs-review' | 'not-run' | 'not-applicable' | 'stale';
export type ReleaseState = 'submitted' | 'quarantined' | 'review-required' | 'approved' | 'listed' | 'rejected' | 'withdrawn' | 'deprecated' | 'unpublished' | 'policy-suspended' | 'security-blocked';
export interface DigestRef {sha256: string; bytes: number}
export interface Publisher {
 id: string; displayName: string; githubOwnerId: number; authorizedSubmitterIds: number[];
 repositories: {githubRepositoryId: number; githubOwnerId: number; url: string; challengeCommit: string}[];
 securityContact: string; supportUrl: string; rulesAcceptedAt: string; declaredGithub2FA: true;
 state: 'registered' | 'frozen' | 'tombstoned'; official: boolean;
 domain?: {name: string; state: 'pending' | 'verified' | 'suspended'; continuousControlSince: string; checkedAt: string};
}
export interface Capability {key: string; scope: string; reason: string}
export interface NetworkDisclosure {origin: string; purpose: string; dataSent: string[]; dataReceived: string[]; accountRequired: boolean; paymentRequired: boolean; privacyUrl: string}
export interface AssetDerivative extends DigestRef {
 role: 'icon' | 'screenshot' | 'cover' | 'glyph'; variant?: 'light' | 'dark'; glyphKey?: string;
 width: number; height: number; mime: 'image/png'; sourceSha256: string; sourceBytes: number; pipelineVersion: string;
 /** Store-generated opaque key, never a publisher path or URL. */
 key: string; alt?: string; caption?: string; screenshotIndex?: number;
}
export interface AssetInventory {
 assetSchemaVersion: 1; extensionId: string; version: string; packageSha256: string; derivatives: AssetDerivative[];
}
export interface Provenance {artifactSha256: string; repositoryId: number; commit: string; workflowIdentity: string; attestation: DigestRef}
export interface Release {
 id: string; version: string; channel: 'stable' | 'prerelease'; state: ReleaseState;
 packageFormat: 2; manifest: 'somnia-extension.toml'; engine: 'sandboxed'; apiVersion: number; minSomnia: string;
 source: {repositoryId: number; url: string; commit: string; extensionPath: string};
 artifact: DigestRef & {githubAssetId: number; url: string; filename: string; expandedBytes: number; fileCount: number; largestFileBytes: number};
 provenance: Provenance; build: {lockfile: string; toolchain: string; command: string; lifecycleScripts: string[]; sbom: DigestRef};
 capabilities: Capability[]; capabilitySha256: string; network: NetworkDisclosure[];
 docs: {readme: string; license: string; changelog: string; thirdPartyNotices: string; security: string};
 dataHandling: {localStorage: string; remoteProcessors: string[]; retention: string; deletion: string};
 assets: DigestRef; evidence: DigestRef;
}
export interface GateEvidence {
 gate: GateName; status: EvidenceStatus; packageSha256: string; sourceCommit: string; prHead: string;
 scannedAt: string; tool: string; toolVersion: string; rulesVersion: string; databaseVersion: string;
 databaseUpdatedAt?: string; evidence: DigestRef; findings: {fingerprint: string; summary: string; withheld: boolean}[];
}
export interface Review {reviewerId: number; securityMaintainer: boolean; packageSha256: string; sourceCommit: string; prHead: string; policyRevision: string; approvedAt: string}
export interface Exception {gate: GateName; fingerprint: string; packageSha256: string; reviewerId: number; reason: string; issuedAt: string; expiresAt: string}
export interface ReleaseEvidence {
 extensionId: string; version: string; packageSha256: string; sourceCommit: string; prHead: string;
 policyRevision: string; gates: GateEvidence[]; reviews: Review[]; exceptions: Exception[];
}
export interface StoreListing {id: string; name: string; summary: string; category: string; publisherId: string; releases: Release[]}
export interface StoreCatalog {catalogSchemaVersion: 1; sequence: number; generatedAt: string; policyRevision: string; publishers: Publisher[]; extensions: StoreListing[]; tombstones: string[]}
export interface Revocation {
 incidentId: string; sequence: number; action: 'policy-suspended' | 'security-blocked'; publisherId?: string; extensionId?: string;
 versions: string[]; digests: string[]; reason: 'malware' | 'account-compromise' | 'exploitable-vulnerability' | 'impersonation' | 'policy-breach';
 issuedAt: string; reviewStatus: 'investigating' | 'confirmed' | 'cleared'; summary: string; appealUrl: string; supersedes?: string;
}
export interface SecurityFeed {securitySchemaVersion: 1; sequence: number; generatedAt: string; incidents: Revocation[]}
export interface Diagnostic {code: string; path: string; message: string}
export type ScorecardDimension = 'identity-continuity' | 'build-traceability' | 'dependency-health' | 'runtime-scope' | 'maintenance' | 'store-review';
/** Phase-two transparency dimensions, never an aggregate safety rating. */
export interface TransparencyScorecard {
 extensionId: string; version: string; packageSha256: string; generatedAt: string;
 dimensions: {dimension: ScorecardDimension; status: EvidenceStatus; checkedAt: string; freshUntil: string; evidence: DigestRef[]; summary: string; withheld: boolean}[];
}
