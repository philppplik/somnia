const keys=['flipH','flipV'];
const labels={en:['Flip horizontal','Flip vertical'],de:['Horizontal spiegeln','Vertikal spiegeln'],es:['Voltear horizontal','Voltear vertical'],fr:['Retourner horizontalement','Retourner verticalement'],'pt-BR':['Inverter horizontal','Inverter vertical']};
export const INTERFACE_P49_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>[`interface.${key}`,values[i]]))]));
