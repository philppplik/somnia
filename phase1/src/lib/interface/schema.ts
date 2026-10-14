import type {SnapSettings} from './snapCore';
export type AxisSizing='fixed'|'hug'|'fill';
export type InterfaceJustify='start'|'center'|'end'|'space-between';
export interface InterfaceLayout {direction:'free'|'row'|'column'|'grid';wrap:boolean;gap:number;padding:[number,number,number,number];align:'start'|'center'|'end'|'stretch';columns?:number;rows?:number;justify?:InterfaceJustify;crossGap?:number;}
export interface InterfaceSizing {width:AxisSizing;height:AxisSizing;minWidth:number;minHeight:number;maxWidth:number;maxHeight:number;absolute:boolean;}
export type ConstraintMode='start'|'end'|'center'|'stretch'|'scale';
export interface InterfaceConstraints {horizontal:ConstraintMode;vertical:ConstraintMode;parentWidth:number;parentHeight:number;}
export interface InstanceOverride {slot:string;values:Record<string,string|number|boolean>;}
/** Instance-local values for typed (non-variant) component properties: text/boolean strings or flags, swap target component ids. */
export interface InterfaceInstance {componentId:string;variantId:string;overrides:InstanceOverride[];propertyValues?:Record<string,string|boolean>;}
export type VariableMode='light'|'dark';
export type VariantPropertyType='variant'|'text'|'boolean'|'swap';
/** Missing type means a variant axis. Typed properties reference a component slot instead of enumerating values. */
export interface VariantProperty {name:string;type?:VariantPropertyType;values?:string[];slot?:string;}
export interface InterfaceComponent {id:string;name:string;properties?:VariantProperty[];variants:{id:string;name:string;rootId:string;props?:Record<string,string>}[];}
export const DEFAULT_LAYOUT:InterfaceLayout={direction:'free',wrap:false,gap:12,padding:[16,16,16,16],align:'start'};
export const DEFAULT_SIZING:InterfaceSizing={width:'fixed',height:'fixed',minWidth:1,minHeight:1,maxWidth:32768,maxHeight:32768,absolute:false};
export interface InterfaceExportSetting {format:'png'|'svg'|'webp';scale:1|2;}
export interface InterfaceVariable {id:string;name:string;type:'color'|'number';value:string|number;alias?:string;collection?:string;modeValues?:Partial<Record<VariableMode,string|number>>;}
export interface InterfaceTextStyle {id:string;name:string;fontFamily:'sans-serif'|'serif'|'monospace';fontSize:number;lineHeight:number;fontWeight:400|500|600|700;modeValues?:Partial<Record<VariableMode,{fontSize:number;lineHeight:number;fontWeight:400|500|600|700}>>;}
export interface InterfaceAsset {id:string;hash:string;mime:'image/png';width:number;height:number;data:string;sourceName:string;sourceType:'png'|'jpeg';license:'user-provided-unverified';}
export interface PathPoint {x:number;y:number;}
export interface InterfacePath {points:PathPoint[];closed:boolean;}
export type NodeKind='frame'|'group'|'rectangle'|'text'|'ellipse'|'line'|'path'|'image';
export type PrototypeTransitionKind='instant'|'dissolve'|'slide'|'push'|'smart-animate';
export type PrototypeEasing='linear'|'ease'|'ease-in'|'ease-out'|'ease-in-out';
export type PrototypeDirection='left'|'right'|'up'|'down';
export interface PrototypeTransition {kind:PrototypeTransitionKind;durationMs:number;easing?:PrototypeEasing;direction?:PrototypeDirection;}
export interface PrototypeLink {action?:'navigate'|'overlay'|'back';trigger:'click'|'hover'|'afterDelay'|'press';targetFrameId:string;delayMs?:number;transition?:PrototypeTransition;position?:'center'|'left'|'right'|'top'|'bottom';condition?:{variableId:string;equals:string};elseTargetFrameId?:string;setVariables?:{variableId:string;value:string}[];}
export interface InterfaceBreakpoint {id:string;name:string;width:number;height:number;}
export interface InterfaceNode {
 id:string;pageId:string;parentId:string|null;children:string[];kind:NodeKind;name:string;
 x:number;y:number;width:number;height:number;fill:string;text?:string;hidden:boolean;locked:boolean;
 prototypeLinks?:PrototypeLink[];path?:InterfacePath;stroke?:string;strokeWidth?:number;imageFill?:{assetId:string;fit:'cover'|'contain'};
 altText?:string;variableMode?:VariableMode;bindings?:{fill?:string;gap?:string;padding?:string};exportSettings?:InterfaceExportSetting[];textStyleId?:string;annotation?:string;ready?:boolean;layout?:InterfaceLayout;sizing?:InterfaceSizing;constraints?:InterfaceConstraints;componentSlot?:string;instance?:InterfaceInstance;breakpoints?:InterfaceBreakpoint[];span?:number;aspectRatio?:number;scroll?:boolean;sticky?:boolean;
 [key:string]:unknown;
}
export interface InterfacePage {snap?:SnapSettings;id:string;name:string;children:string[];[key:string]:unknown;}
export interface InterfaceDocument {kind:'somnia-interface';version:1;id:string;name:string;revision:number;pages:InterfacePage[];nodes:InterfaceNode[];components?:InterfaceComponent[];variables?:InterfaceVariable[];textStyles?:InterfaceTextStyle[];assets?:InterfaceAsset[];prototypeStartFrameId?:string;[key:string]:unknown;}
