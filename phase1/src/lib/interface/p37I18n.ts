const keys=['breakpointView','breakpointView.native'];
const labels={en:['Breakpoint view','Native size'],de:['Haltepunkt-Ansicht','Originalgröße'],es:['Vista de punto de ruptura','Tamaño original'],fr:['Vue point de rupture','Taille d’origine'],'pt-BR':['Visão de breakpoint','Tamanho original']};
export const INTERFACE_P37_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>[`interface.${key}`,values[i]]))]));
