const keys=['sc.zoomFit','sc.zoomSelection','sc.zoom100'];
const labels={en:['Zoom to fit','Zoom to selection','Zoom to 100%'],de:['Einpassen','Auf Auswahl zoomen','Auf 100 % zoomen'],es:['Ajustar a la ventana','Ampliar selección','Ampliar al 100 %'],fr:['Ajuster à la fenêtre','Zoomer sur la sélection','Zoomer à 100 %'],'pt-BR':['Ajustar à tela','Zoom na seleção','Zoom em 100%']};
export const INTERFACE_P57_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>[`interface.${key}`,values[i]]))]));
