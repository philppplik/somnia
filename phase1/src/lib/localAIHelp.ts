import guide from './localAIGuide.json';
export const localHelpTopics=['device','remove','offline','voice']as const;
export type LocalHelpTopic=typeof localHelpTopics[number];
const heading:Record<LocalHelpTopic,string>={device:'What stays on this device',remove:'Choose and manage models',offline:'Offline mode and cloud routing',voice:'Voice: experimental, unavailable by default'};
export function localHelpGuide(topic:LocalHelpTopic|'all'):string{if(topic==='all')return guide.text;const start=guide.text.indexOf('## '+heading[topic]+'\n');if(start<0)throw Error('Guide section missing');const end=guide.text.indexOf('\n## ',start+4);return guide.text.slice(start,end<0?undefined:end).trim();}
