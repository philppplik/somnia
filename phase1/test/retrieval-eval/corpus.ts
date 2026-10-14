/** Non-private, hand-labelled development corpus. Never production/private input. */
export const sources=[
 {id:'en/harbor.md',text:'Harbor cargo schedules: container ships arrive at the port on Tuesday.',topic:0},
 {id:'de/hafen.md',text:'Hafenfracht: Containerschiffe erreichen den Hafen am Dienstag.',topic:0},
 {id:'en/alpine.md',text:'Alpine weather: snow closes the mountain trail in winter.',topic:1},
 {id:'de/berge.md',text:'Bergwetter: Schnee sperrt den Wanderweg im Winter.',topic:1},
 {id:'en/invoice.md',text:'Invoice reference ZX-42: payment is due after thirty days.',topic:2},
 {id:'de/rechnung.md',text:'Rechnung ZX-42: Zahlung nach dreißig Tagen fällig.',topic:2},
 {id:'en/garden.md',text:'Garden watering: tomatoes need water in dry weather.',topic:3},
 {id:'de/garten.md',text:'Gartenbewässerung: Tomaten brauchen bei Trockenheit Wasser.',topic:3},
] as const;
export const queries=[
 {id:'en-literal-port',locale:'en',text:'Harbor cargo',relevant:['en/harbor.md','de/hafen.md'],topic:0},
 {id:'de-literal-port',locale:'de',text:'Hafenfracht',relevant:['en/harbor.md','de/hafen.md'],topic:0},
 {id:'en-paraphrase-port',locale:'en',text:'coastal freight arrivals',relevant:['en/harbor.md','de/hafen.md'],topic:0},
 {id:'de-paraphrase-port',locale:'de',text:'Ankunft der Seefracht',relevant:['en/harbor.md','de/hafen.md'],topic:0},
 {id:'en-literal-code',locale:'en',text:'ZX-42',relevant:['en/invoice.md','de/rechnung.md'],topic:2},
 {id:'de-literal-code',locale:'de',text:'Zahlung',relevant:['en/invoice.md','de/rechnung.md'],topic:2},
 {id:'en-paraphrase-trail',locale:'en',text:'walking route blocked by winter conditions',relevant:['en/alpine.md','de/berge.md'],topic:1},
 {id:'de-paraphrase-trail',locale:'de',text:'Winter verhindert die Wanderung',relevant:['en/alpine.md','de/berge.md'],topic:1},
] as const;
