const keys=['stroke','strokeColor','strokeWidth'];
const labels={en:['Stroke','Stroke color','Stroke width'],de:['Kontur','Konturfarbe','Konturbreite'],es:['Trazo','Color del trazo','Grosor del trazo'],fr:['Contour','Couleur du contour','Épaisseur du contour'],'pt-BR':['Contorno','Cor do contorno','Largura do contorno']};
export const INTERFACE_P56_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>[`interface.${key}`,values[i]]))]));
