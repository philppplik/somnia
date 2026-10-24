import React from 'react';import {createRoot} from 'react-dom/client';import {AgentPanel} from '../src/components/agent/AgentPanel';import '../src/styles/global.css';import '../src/styles/agent.css';
if(!import.meta.env.DEV)throw Error('Development only');document.documentElement.dataset.theme=location.search.includes('dark')?'dark':'light';globalThis.fetch=async()=>{throw Error('No network or real model');};
createRoot(document.getElementById('root')!).render(<main className="max-w-lg p-3"><AgentPanel/></main>);
