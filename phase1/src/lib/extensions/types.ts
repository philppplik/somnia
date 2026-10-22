/** Extension SDK contract, apiVersion 1. See notes/ADR-003-extension-sdk.md. */
import type {OpenKind} from '../studios/openHandlers';
export const API_VERSION=1;
export const PERMISSIONS=['commands','project.read','project.write','selection','ui.notify','storage'] as const;
export type Permission=typeof PERMISSIONS[number];
export type CommandCategory='Project'|'Edit'|'View'|'Insert'|'Tools'|'Help';
export interface CommandContribution{id:string;title:string;category:CommandCategory}
export interface SnippetContribution{language:'html'|'css'|'js';label:string;body:string}
export interface CodeThemeContribution{id:string;label:string;light:Record<string,string>;dark:Record<string,string>}
export interface AccentPaletteContribution{id:string;label:string;light:string;dark:string}
export interface PanelContribution{id:string;title:string;side:'left'|'right';html:string}
/** File-open offer (docs/studios/file-open-router.md): the extension offers `command` as an additional, never-default handler for validated kinds. `priority` is clamped to MAX_EXTENSION_OPEN_PRIORITY at registration. */
export interface OpenOfferContribution{id:string;kinds:readonly OpenKind[];command:string;capability:'edit'|'preview';priority:number;title:string}
export interface ExtensionManifest{id:string;name:string;version:string;apiVersion:number;main?:string;code?:string;permissions:Permission[];contributes:{commands:CommandContribution[];snippets:SnippetContribution[];codeThemes:CodeThemeContribution[];accentPalettes:AccentPaletteContribution[];panels:PanelContribution[];openOffers?:OpenOfferContribution[]}}
export type ManifestResult={ok:true;manifest:ExtensionManifest}|{ok:false;errors:string[]};
