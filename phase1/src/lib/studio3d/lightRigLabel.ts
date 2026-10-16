import type {LightRigPreset} from './stage';
/** i18n key for a light-rig preset button. Preset ids are kebab-case ('three-point'), locale keys camelCase ('threePoint'). */
export const lightRigLabelKey=(preset:LightRigPreset):string=>'studio3d.light.rig.'+(preset==='three-point'?'threePoint':preset);
