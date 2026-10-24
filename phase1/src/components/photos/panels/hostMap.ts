import type {ComponentType} from 'react';
import type {PanelHostProps} from '../../../lib/shell/types';
import {HistogramPanel} from './HistogramPanel';
import {CurvesPanel} from './CurvesPanel';
import {HslPanel} from './HslPanel';
import {MaskPanel} from './MaskPanel';
import {ColorPanel,DetailPanel,EffectsPanel,LightPanel} from './AdjustPanels';
import {TransformPanel} from './TransformPanel';
import {PresetsPanel} from './PresetsPanel';
import {HistoryPanel} from './HistoryPanel';
import {InfoPanel} from './InfoPanel';
import {ExportPanel} from './ExportPanel';
/** Host components by PanelDef.component. Must match lib/photos/panelManifest.ts exactly (registerStudioPanels throws on drift). */
export const PHOTOS_PANEL_HOSTS:Record<string,ComponentType<PanelHostProps>>={
 'photos.histogram':HistogramPanel,'photos.curves':CurvesPanel,'photos.hsl':HslPanel,'photos.mask':MaskPanel,'photos.light':LightPanel,'photos.color':ColorPanel,'photos.effects':EffectsPanel,'photos.detail':DetailPanel,
 'photos.transform':TransformPanel,'photos.presets':PresetsPanel,'photos.export':ExportPanel,'photos.history':HistoryPanel,'photos.info':InfoPanel,
};
