/** Native Tauri bindings for the A6 Memory panel and Skills tab.
 * Thin invoke wrappers over the sync_command! DTOs; no fallback, no caching, no mutation beyond the commands. */
import {invoke} from '@tauri-apps/api/core';
import type {MemoryTransport,MemoryItem,MemorySearch,ModelState,VectorStatus} from './memory';
import type {SkillsTransport,SkillSummary,SkillVersion,SkillFile} from './skills';

export const nativeMemoryTransport: MemoryTransport = {
  list: (spaceId, includePending) => invoke<MemoryItem[]>('vibespace_memory_list', {request: {spaceId, includePending}}),
  add: (spaceId, kind, title, content) => invoke<MemoryItem>('vibespace_memory_add', {request: {spaceId, kind, title, content}}),
  remove: (spaceId, id) => invoke<boolean>('vibespace_memory_delete', {request: {spaceId, memoryId: id}}),
  review: (spaceId, id, approve) => invoke<boolean>('vibespace_memory_review', {request: {spaceId, memoryId: id, approve}}),
  clearAll: (spaceId) => invoke<number>('vibespace_memory_clear', {request: {spaceId}}),
  search: (spaceId, query) => invoke<MemorySearch>('vibespace_memory_search', {request: {spaceId, query}}),
  vectorStatus: (spaceId) => invoke<VectorStatus>('vibespace_memory_vector_status', {request: {spaceId}}),
  modelState: () => invoke<ModelState>('vibespace_memory_model_state', {request: {}}),
  downloadModel: (acknowledgedBytes) => invoke<ModelState>('vibespace_memory_model_download', {request: {acknowledgedBytes}}),
  cancelModelDownload: () => invoke<ModelState>('vibespace_memory_model_cancel', {request: {}}),
  enableVector: (spaceId, acknowledged) => invoke<VectorStatus>('vibespace_memory_vector_enable', {request: {spaceId, acknowledged}}),
  disableVector: (spaceId) => invoke<VectorStatus>('vibespace_memory_vector_disable', {request: {spaceId}}),
};

export const nativeSkillsTransport: SkillsTransport = {
  list: (spaceId) => invoke<SkillSummary[]>('vibespace_skills_list', {request: {spaceId}}),
  install: (req) => invoke<SkillSummary>('vibespace_skills_install', {request: {scope: req.scope, spaceId: req.spaceId, source: req.source, sourceRef: req.sourceRef, skillMd: req.skillMd, files: req.files satisfies SkillFile[]}}),
  getVersion: (id, version) => invoke<SkillVersion | null>('vibespace_skills_get_version', {request: {id, version}}),
  acceptUpdate: (id) => invoke<SkillSummary>('vibespace_skills_accept_update', {request: {id}}),
  rejectUpdate: (id) => invoke<SkillSummary>('vibespace_skills_reject_update', {request: {id}}),
  uninstall: (id) => invoke<boolean>('vibespace_skills_uninstall', {request: {id}}),
  // fetchIndex intentionally absent: no verified endpoint in this build.
};
