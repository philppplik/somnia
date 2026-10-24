/** Renderer-safe artifact contract. Never include credentials or local absolute paths. */
export type DeployArtifactKind = 'static' | 'node'
export interface DeployArtifactFile {
  /** Slash-separated path relative to the artifact root; no symlinks or traversal. */
  path: string
  /** Lower-case, 64-character SHA-256 hex digest. */
  sha256: string
  size: number
  /** Unix file mode (0644 or 0755); no special permission bits. */
  mode: number
}
export interface DeployArtifactManifest {
  kind: DeployArtifactKind
  files: DeployArtifactFile[]
  /** Required for Node artifacts; points to one of files. */
  entry?: string
  engines?: Record<string, string>
  port?: number
  /** Stable content/build identifier, not a filesystem path. */
  buildId: string
}
export interface DeployArtifactDiff {
  added: DeployArtifactFile[]
  changed: DeployArtifactFile[]
  removed: DeployArtifactFile[]
  unchanged: DeployArtifactFile[]
  uploadBytes: number
}
