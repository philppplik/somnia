/** Extension SDK contract, apiVersion 1. See notes/ADR-003-extension-sdk.md. */
export const API_VERSION=1;
export const PERMISSIONS=['commands','project.read','project.write','selection','ui.notify','storage'] as const;
export type Permission=typeof PERMISSIONS[number];
export type CommandCategory='Project'|'Edit'|'View'|'Insert'|'Tools'|'Help';
export interface CommandContribution{id:string;title:string;category:CommandCategory}
export interface SnippetContribution{language:'html'|'css'|'js';label:string;body:string}
export interface CodeThemeContribution{id:string;label:string;light:Record<string,string>;dark:Record<string,string>}
export interface PanelContribution{id:string;title:string;side:'left'|'right';html:string}
export interface ExtensionManifest{id:string;name:string;version:string;apiVersion:number;main?:string;code?:string;permissions:Permission[];contributes:{commands:CommandContribution[];snippets:SnippetContribution[];codeThemes:CodeThemeContribution[];panels:PanelContribution[]}}
export type ManifestResult={ok:true;manifest:ExtensionManifest}|{ok:false;errors:string[]};
