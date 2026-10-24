import type { InspectorSectionDef, PanelDef, RailItemDef } from '../shell/types';
/**
 * Publish in the studio shell (concept docs/concepts/live-deployment.md section 9, docs/studio-shell).
 * Pure manifest data. Hosts are registered by components/deploy/registerDeployShell.ts.
 *
 * - Two left panels: `publish` (servers, status, Publish, Dry run) and `publish-log` (live log, result, earlier versions).
 * - Three inspector sections: target (address and domain), framework (what Somnia builds, which target fits), dry run (file diff).
 * Every state-changing action still runs through the deploy CommandSpecs and their confirmation dialogs.
 */
export const DEPLOY_PANEL_COMMANDS = ['deploy.panel.show', 'deploy.target.select', 'deploy.dryrun', 'deploy.target.setDomain'] as const;
export const deployPanels: readonly PanelDef[] = [
  { id: 'publish', title: 'Publish', titleKey: 'deploy.shell.publish', component: 'deploy.targets', side: 'left', persistKey: 'deploy.targets', commands: ['deploy.panel.show', 'deploy.target.select', 'deploy.dryrun'], minHeight: 180 },
  { id: 'publish-log', title: 'Publish log', titleKey: 'deploy.shell.log', component: 'deploy.log', side: 'left', persistKey: 'deploy.log', minHeight: 140 },
];
export const deployInspectorSections: readonly InspectorSectionDef[] = [
  { id: 'publish-target', title: 'Publish target', titleKey: 'deploy.shell.target', component: 'deploy.inspector.target', order: 40, commands: ['deploy.target.setDomain'], defaultCollapsed: true },
  { id: 'publish-framework', title: 'Framework', titleKey: 'deploy.shell.framework', component: 'deploy.inspector.framework', order: 50, defaultCollapsed: true },
  { id: 'publish-dryrun', title: 'Dry run', titleKey: 'deploy.shell.dryrun', component: 'deploy.inspector.dryrun', order: 60, commands: ['deploy.dryrun'], defaultCollapsed: true },
];
/** Rail items continue the Code left rail after Outline (80). */
export const DEPLOY_RAIL_ITEMS: readonly RailItemDef[] = [
  { id: 'publish', icon: 'UploadCloud', label: 'Publish', labelKey: 'deploy.shell.publish', kind: 'panel', panel: 'publish', order: 90 },
  { id: 'publish-log', icon: 'ScrollText', label: 'Publish log', labelKey: 'deploy.shell.log', kind: 'panel', panel: 'publish-log', order: 100 },
];
