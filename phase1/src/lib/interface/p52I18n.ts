const keys=['gradient','gradientAngle','gradientStart','gradientEnd'];
const labels={en:['Gradient','Gradient angle','Start color','End color'],de:['Verlauf','Verlaufswinkel','Startfarbe','Endfarbe'],es:['Degradado','Ángulo del degradado','Color inicial','Color final'],fr:['Dégradé','Angle du dégradé','Couleur de début','Couleur de fin'],'pt-BR':['Gradiente','Ângulo do gradiente','Cor inicial','Cor final']};
export const INTERFACE_P52_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>[`interface.${key}`,values[i]]))]));
