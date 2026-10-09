import type { ExportLocale } from './types';
import { exportMessages } from './locales';
export interface ExportEnvironment { canvas: boolean; protectedDocument?: boolean }
export function exportCapabilities(environment: ExportEnvironment, locale: ExportLocale = 'en') {
  const m = exportMessages[locale];
  return [
    { id:'print', enabled:!environment.protectedDocument, label:m.print, reason:environment.protectedDocument ? m.protected : m.printHelp },
    { id:'screen', enabled:environment.canvas && !environment.protectedDocument, label:m.screen, reason:environment.protectedDocument ? m.protected : !environment.canvas ? m.renderer : m.screenHelp },
    { id:'standard', enabled:true, label:m.standard, reason:m.standardHelp },
    { id:'subset', enabled:false, label:m.subset, reason:m.subsetHelp },
    { id:'linearize', enabled:false, label:m.linearize, reason:m.linearizeHelp },
    { id:'pdfx', enabled:false, label:m.pdfx, reason:m.pdfxHelp },
  ];
}
