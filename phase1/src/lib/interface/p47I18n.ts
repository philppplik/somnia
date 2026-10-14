const keys=['textAlign','textAlign.left','textAlign.center','textAlign.right'];
const labels={en:['Text alignment','Left','Center','Right'],de:['Textausrichtung','Links','Zentriert','Rechts'],es:['Alineación de texto','Izquierda','Centrado','Derecha'],fr:['Alignement du texte','Gauche','Centré','Droite'],'pt-BR':['Alinhamento de texto','Esquerda','Centro','Direita']};
export const INTERFACE_P47_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>[`interface.${key}`,values[i]]))]));
