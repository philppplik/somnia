const fs=require('fs');
const puz='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M10 4a2 2 0 1 1 4 0v1h4v4h-1a2 2 0 1 0 0 4h1v4h-4v-1a2 2 0 1 0-4 0v1H6v-4h1a2 2 0 1 0 0-4H6V5h4z"/></svg>';
const side=(on='Extensions')=>`<div class="side"><div class="s">Search settings</div><h6>App</h6><a>General</a><a>Appearance</a><h6>Editor</h6><a>Code</a><a>Preview</a><h6>Power-Ups</h6><a>AI</a><a class="${on=='Extensions'?'on':''}">Extensions</a><a>Collaboration</a></div>`;
const tabs=(n,u=1)=>`<div class="tabs"><span class="${n==0?'on':''}">Installed</span><span class="${n==1?'on':''}">Browse</span><span class="${n==2?'on':''}">Updates <b>${u}</b></span></div>`;
const page=(theme,body,pal='')=>`<!doctype html><html data-theme="${theme}" ${pal?`data-palette="${pal}"`:''}><head><meta charset="utf-8"><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="mock.css"></head><body><div class="modal">${side()}<div class="main">${body}</div></div></body></html>`;
const ico=`<div class="ico">${puz}</div>`;
const risk={none:'<span class="pill">No permissions</span>',low:'<span class="pill">Low access</span>',proj:'<span class="pill warn">Reads your project</span>',write:'<span class="pill warn">Can change your project</span>'};
const head=(t,s)=>`<h1>${t}</h1><p class="sub">${s}</p>`;
const P={
'commands':['Add commands','Show its commands in the command bar.'],
'project.read':['Read project files','Read the text of files in the open project. It cannot see other folders.'],
'project.write':['Change your project','Edit elements through editor operations. Changes go on the undo stack.'],
'selection':['See your selection','Read the tag and id of the selected element.'],
'ui.notify':['Show notices','Show short messages in the status bar.'],
'storage':['Save small settings','Keep a little data for itself inside Somnia.']};
const permRow=(k,on=true,extra='')=>`<div class="perm"><div class="tog ${on?'on':''}"></div><div class="grow"><code>${k}</code> ${extra}<p>${P[k][1]}</p></div></div>`;
const out={};
// 01 installed
out['01-installed']=page('light',`${head('Extensions','Add features to Somnia. Extensions stay off until you switch them on.')}${tabs(0)}
<div class="banner"><b>1 update available.</b><span class="grow">Word count 1.1.0 asks for one new permission.</span><span class="btn sm pri">Review update</span></div>
<div class="card"><div class="ext">${ico}<div class="grow"><div class="row"><h2>Word count</h2><span class="meta">v1.0.0 · Somnia</span><span class="pill acc">Update 1.1.0</span></div><div class="meta">Counts words in your open page.</div><div class="row" style="margin-top:8px">${risk.proj}<span class="pill">3 of 3 permissions on</span><span class="pill">Runs code</span></div></div><div class="row"><span class="btn ghost sm">Manage</span><div class="tog on"></div></div></div></div>
<div class="card"><div class="ext">${ico}<div class="grow"><div class="row"><h2>Section Kit</h2><span class="meta">v1.0.0 · Somnia</span></div><div class="meta">Section snippets and a panel to insert them.</div><div class="row" style="margin-top:8px">${risk.none}<span class="pill">Adds a panel</span><span class="pill">Adds snippets</span></div></div><div class="row"><span class="btn ghost sm">Manage</span><div class="tog on"></div></div></div></div>
<div class="card"><div class="ext">${ico}<div class="grow"><div class="row"><h2>Safe external links</h2><span class="meta">v1.0.0 · local file</span></div><div class="meta">Adds rel and target to a selected link.</div><div class="row" style="margin-top:8px">${risk.write}<span class="pill bad">1 of 4 permissions off</span><span class="pill">Runs code</span><span class="pill">Not from the catalog</span></div></div><div class="row"><span class="btn ghost sm">Manage</span><div class="tog"></div></div></div></div>
<div class="row" style="margin-top:14px"><span class="btn">Install from file…</span><span class="btn ghost">Install from folder…</span><span class="grow"></span><span class="btn ghost">Disable all</span></div>`);
// 02 browse
out['02-browse']=page('light',`${head('Extensions','Browsing contacts GitHub once, only when you open this tab.')}${tabs(1)}
<div class="row" style="margin-bottom:10px"><div class="input grow">Search extensions</div><span class="btn">Refresh index</span></div>
<div class="row" style="margin-bottom:12px"><span class="pill acc">All (3)</span><span class="pill">Themes (1)</span><span class="pill">Panels (1)</span><span class="pill">Tools (1)</span><span class="grow"></span><span class="pill">Status: All ▾</span><span class="pill">No permissions only</span></div>
<div class="meta" style="margin-bottom:8px">3 of 3 extensions</div>
<div class="card"><div class="ext">${ico}<div class="grow"><div class="row"><h2>Quiet Colors</h2><span class="meta">v1.0.0 · Somnia · Themes</span></div><div class="meta">A calm code theme with light and dark syntax colors.</div><div class="row" style="margin-top:8px">${risk.none}<span class="pill">No code</span></div></div><span class="btn sm">Details</span><span class="btn pri sm">Review install</span></div></div>
<div class="card"><div class="ext">${ico}<div class="grow"><div class="row"><h2>Section Kit</h2><span class="meta">v1.0.0 · Somnia · Panels</span><span class="pill ok">Installed</span></div><div class="meta">Section snippets and a panel to insert them.</div><div class="row" style="margin-top:8px">${risk.none}<span class="pill">Adds a panel</span></div></div><span class="btn sm">Details</span></div></div>
<div class="card"><div class="ext">${ico}<div class="grow"><div class="row"><h2>Page Outline</h2><span class="meta">v0.3.0 · community · Panels</span></div><div class="meta">A read-only outline of headings in the open page.</div><div class="row" style="margin-top:8px">${risk.proj}<span class="pill">Adds a panel</span></div></div><span class="btn sm">Details</span><span class="btn pri sm">Review install</span></div></div>
<div class="note" style="position:absolute;bottom:22px;left:28px;right:28px">Mockup assumption: "Page Outline" is a made-up entry to show a permission-bearing row. The real index has only Quiet Colors today.</div>`);
// 03 install review
out['03-install-review']=page('light',`${head('Extensions','')}${tabs(1)}<div class="card dim"><h2>Page Outline</h2></div><div class="card dim"><h2>Quiet Colors</h2></div>
<div class="scrim"><div class="dlg"><div class="row"><div class="ico">${puz}</div><div><h3>Install Page Outline?</h3><div class="meta">v0.3.0 · community · checked against the index hash</div></div></div>
<p style="margin:12px 0 2px;color:var(--text-secondary)">It will stay <b>off</b> until you switch it on. It can do this once enabled:</p>
${permRow('project.read',true)}${permRow('selection',true)}
<div class="note">Permissions can be switched off later under Manage. A feature that needs a permission you turned off will stop working and tell you why.</div>
<div class="row"><span class="pill">Adds a panel</span><span class="pill">No network, no file writes</span><span class="grow"></span><span class="meta">Source on GitHub ↗</span></div>
<div class="foot"><span class="btn">Cancel</span><span class="btn">Install, keep off</span><span class="btn pri">Install and turn on</span></div></div></div>`);
// 04 manage
out['04-manage-permissions']=page('light',`${head('Extensions','')}<div class="row" style="margin-bottom:12px"><span class="btn ghost sm">← All extensions</span></div>
<div class="ext" style="margin-bottom:12px">${ico}<div class="grow"><div class="row"><h1 style="margin:0">Safe external links</h1><span class="pill off">Off</span></div><div class="meta">v1.0.0 · local file · somnia.safe-links · Runs code in a background worker</div></div><div class="tog"></div></div>
<div class="card"><h2 style="margin-bottom:2px">Permissions</h2><div class="meta">Turn off any permission at any time. It takes effect on the next call, no restart.</div>
<div style="margin-top:6px">${permRow('commands',true)}${permRow('selection',true)}${permRow('project.write',false,'<span class="pill bad">Turned off by you</span>')}${permRow('ui.notify',true)}</div>
<div class="note">Without "Change your project", the command <b>Safe external links</b> will run but stop with the host error "needs the \"project.write\" permission". <span class="kbd">Turn on</span> restores it.</div></div>
<div class="card"><div class="row"><div class="grow"><h2>Remove</h2><div class="meta">Deletes the extension and its saved settings. Your project files are not touched.</div></div><span class="btn danger">Remove…</span></div></div>`);
// 05 update review
out['05-update-review']=page('light',`${head('Extensions','')}${tabs(2)}<div class="card dim"><h2>Word count</h2></div>
<div class="scrim"><div class="dlg" style="width:560px"><div class="row"><div class="ico">${puz}</div><div><h3>Update Word count</h3><div class="meta">1.0.0 → 1.1.0 · Somnia</div></div></div>
<p style="margin:12px 0 2px;color:var(--text-secondary)">Your enabled state and permission choices are kept. New permissions start <b>off</b>.</p>
<div class="perm"><div class="tog on"></div><div class="grow"><code>project.read</code><p>Unchanged. On.</p></div></div>
<div class="perm"><div class="tog on"></div><div class="grow"><code>ui.notify</code><p>Unchanged. On.</p></div></div>
<div class="perm"><div class="tog"></div><div class="grow"><code>storage</code> <span class="new">NEW</span><p>${P.storage[1]} Off until you allow it.</p></div><span class="btn sm">Allow</span></div>
<div class="note">What changed: counts selected text only, remembers your last mode. 1 new permission.</div>
<div class="foot"><span class="btn">Not now</span><span class="btn pri">Update, keep new permission off</span></div></div></div>`);
// 06 states dark
out['06-remove-and-states-dark']=page('dark',`${head('Extensions','')}${tabs(0,0)}
<div class="card"><div class="ext">${ico}<div class="grow"><div class="row"><h2>Word count</h2><span class="meta">v1.0.0</span><span class="pill bad">Failed to start</span></div><div class="meta">Its code threw an error on activation. It was turned off. <span style="color:var(--accent)">View details in Problems</span></div></div><span class="btn ghost sm">Manage</span><div class="tog"></div></div></div>
<div class="card"><div class="ext">${ico}<div class="grow"><div class="row"><h2>Offline example</h2><span class="pill warn">Can't reach GitHub</span></div><div class="meta">Browse needs a connection. Installed extensions keep working. <span style="color:var(--accent)">Try again</span></div></div></div></div>
<div class="scrim"><div class="dlg"><h3>Remove Section Kit?</h3><p style="color:var(--text-secondary)">This removes its panel and snippets, and clears its saved settings. This cannot be undone. You can install it again from Browse.</p><div class="foot"><span class="btn">Cancel</span><span class="btn danger">Remove Section Kit</span></div></div></div>`,'midnight');
for(const k in out)fs.writeFileSync(k+'.html',out[k]);
