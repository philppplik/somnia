import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorProject } from '@somnia/editor-core';
import { App } from './App';
import { connectEditorProject } from './store/appStore';
import './styles/global.css';
import './styles/bento.css';
import {isTauri} from '@tauri-apps/api/core';
import {installDesktopAdapter} from './lib/desktopAdapter';
import {installFileAdapter} from './lib/fileAdapter';
import {createWebFsPort,webFsSupported} from './lib/webFsPort';
import {registerCommand} from './lib/commands';
import {patchState} from './store/appStore';
// Deliberately memory-only. Replace with choose_project -> read_file in the desktop integrator.
const project=new EditorProject({
 'index.html':'<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Untitled project</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n  <header id="header"><nav>Somnia studio</nav></header>\n  <main id="main">\n    <section class="hero">\n      <h1>Make room for something new.</h1>\n      <p>Your first idea starts here.</p>\n      <button>Explore</button>\n    </section>\n  </main>\n  <footer>Made locally.</footer>\n</body>\n</html>\n',
 'styles.css':'/* Local project styles. */\nbody { margin: 0; font-family: system-ui, sans-serif; }\n.hero { padding: 80px; }\n'
});
const disconnect=connectEditorProject(project,{name:'Untitled project',alreadySaved:false});
if(import.meta.hot)import.meta.hot.dispose(disconnect);
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);

if(isTauri())void installDesktopAdapter().catch(error=>console.error(error));
else if(webFsSupported())void installFileAdapter(createWebFsPort()).catch(error=>console.error(error));
else registerCommand({id:'project.open',title:'Open folder',category:'Project',run:()=>patchState({notice:'Local folders need Chrome, Edge or Opera on HTTPS or localhost (File System Access API). This browser can only keep a working copy in memory. Use Export source ZIP to keep your work.'})});
