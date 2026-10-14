export type AxisSizing='fixed'|'hug'|'fill';
export interface InterfaceLayout {direction:'free'|'row'|'column';wrap:boolean;gap:number;padding:[number,number,number,number];align:'start'|'center'|'end'|'stretch';}
export interface InterfaceSizing {width:AxisSizing;height:AxisSizing;minWidth:number;minHeight:number;maxWidth:number;maxHeight:number;absolute:boolean;}
export type ConstraintMode='start'|'end'|'center'|'stretch'|'scale';
export interface InterfaceConstraints {horizontal:ConstraintMode;vertical:ConstraintMode;parentWidth:number;parentHeight:number;}
export interface InstanceOverride {slot:string;values:Record<string,string|number|boolean>;}
export interface InterfaceInstance {componentId:string;variantId:string;overrides:InstanceOverride[];}
export interface InterfaceComponent {id:string;name:string;variants:{id:string;name:string;rootId:string}[];}
export const DEFAULT_LAYOUT:InterfaceLayout={direction:'free',wrap:false,gap:12,padding:[16,16,16,16],align:'start'};
export const DEFAULT_SIZING:InterfaceSizing={width:'fixed',height:'fixed',minWidth:1,minHeight:1,maxWidth:32768,maxHeight:32768,absolute:false};
