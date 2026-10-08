import type {
  GitCombineFinishRequest, GitCombinePreview, GitCombineResolveRequest, GitCombineSession, GitCombineStartRequest,
  GitError, GitRepoState, GitVariant, GitVariantCreateRequest, GitVariantDeleteRequest, GitVariantDeleteResult,
  GitVariantOpenRequest, GitVariantRenameRequest, GitVariantsBackend, GitVersion,
} from './types';

export type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

/** Commands reject with a JSON GitError string; anything else becomes `unknown`. */
export function parseGitError(e: unknown): GitError {
  const raw = typeof e === 'string' ? e : e instanceof Error ? e.message : '';
  try {
    const v = JSON.parse(raw);
    if (v && typeof v.code === 'string' && typeof v.message === 'string') return v as GitError;
  } catch { /* not JSON */ }
  return { code: 'unknown', message: 'The version tool failed' };
}

/** Tauri implementation. Rust commands take their payload as `{ request }` (see desktop.rs). */
export function tauriVariantsBackend(invoke: Invoke): GitVariantsBackend {
  const call = async <T,>(command: string, args?: Record<string, unknown>): Promise<T> => {
    try { return (await invoke(command, args)) as T; } catch (e) { throw parseGitError(e); }
  };
  return {
    listVariants: () => call<GitVariant[]>('git_variant_list'),
    createVariant: (request: GitVariantCreateRequest) => call<GitVariant>('git_variant_create', { request }),
    openVariant: (request: GitVariantOpenRequest) => call<GitRepoState>('git_variant_open', { request }),
    renameVariant: (request: GitVariantRenameRequest) => call<GitVariant>('git_variant_rename', { request }),
    deleteVariant: (request: GitVariantDeleteRequest) => call<GitVariantDeleteResult>('git_variant_delete', { request }),
    combinePreview: (name: string) => call<GitCombinePreview>('git_combine_preview', { request: { name } }),
    combineStart: (request: GitCombineStartRequest) => call<GitCombineSession>('git_combine_start', { request }),
    combineStatus: () => call<GitCombineSession | null>('git_combine_status'),
    combineResolve: (request: GitCombineResolveRequest) => call<GitCombineSession>('git_combine_resolve', { request }),
    combineFinish: (request: GitCombineFinishRequest) => call<GitVersion>('git_combine_finish', { request }),
    combineAbort: () => call<GitRepoState>('git_combine_abort'),
  };
}
