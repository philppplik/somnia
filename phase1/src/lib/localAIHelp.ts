import guides from './generated/localAIGuides';
export const localHelpTopics=['device','remove','offline','voice']as const;
export type LocalHelpTopic=typeof localHelpTopics[number];
const heading:Record<LocalHelpTopic,string>={device:'What stays on this device',remove:'Choose and manage models',offline:'Offline mode and cloud routing',voice:'Voice: experimental, unavailable by default'};
const germanHeading:Record<LocalHelpTopic,string>={device:'Was auf diesem Gerät bleibt',remove:'Modelle auswählen und verwalten',offline:'Offline-Modus und Cloud-Routing',voice:'Sprache: experimentell, standardmäßig nicht verfügbar'};
export function localHelpGuide(topic:LocalHelpTopic|'all',locale='en'):string{const text=locale==='de'?guides.de:guides.en;if(topic==='all')return text;const title=locale==='de'?germanHeading[topic]:heading[topic];const start=text.indexOf('## '+title+'\n');if(start<0)throw Error('Guide section missing');const end=text.indexOf('\n## ',start+4);return text.slice(start,end<0?undefined:end).trim();}
