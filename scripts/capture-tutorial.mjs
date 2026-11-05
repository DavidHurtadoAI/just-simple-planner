/** Real Obsidian captures and a guided-workflow check, only in the canonical dev vault. */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = path.resolve(root, '../../@Nexus-dev');
const cli = 'C:\\Program Files\\Obsidian\\Obsidian.com';
const images = path.join(root, 'docs/images/tutorial');
const folder = 'Planner tutorial';
const sessionFile = path.join(root, 'qa/tutorial-session.log');
const mode = process.argv[2];
function run(...args) {
  const out = execFileSync(cli, ['vault=@Nexus-dev', ...args], { encoding: 'utf8', timeout: 30000, maxBuffer: 24 * 1024 * 1024, windowsHide: true }).trim();
  if (/^Error:/m.test(out)) throw Error(out);
  return out;
}
function evaluate(code) {
  const source = '(async()=>{if(app.vault.adapter.getBasePath()!==' + JSON.stringify(canonical) + ')throw Error("Wrong vault");' + code + '})()';
  // Encode multiline source so the CLI receives a single argument on Windows.
  const encoded = Buffer.from(source).toString('base64');
  run('eval', 'code=window.__jspTutorialCode=String()');
  for (let i = 0; i < encoded.length; i += 4000) run('eval', "code=window.__jspTutorialCode+='" + encoded.slice(i, i + 4000) + "';true");
  const out = run('eval', 'code=eval(new TextDecoder().decode(Uint8Array.from(atob(window.__jspTutorialCode),c=>c.charCodeAt(0))))');
  if (!out.startsWith('=>')) throw Error(out);
  return out.slice(2).trim();
}
function state(code) { return evaluate('const q=window.__jspTutorial;if(!q||q.cleaned)throw Error("No tutorial capture session");const {p,assert,wait}=q;' + code); }
function cdp(method, params = {}) { return JSON.parse(run('dev:cdp', 'method=' + method, 'params=' + JSON.stringify(params))); }
function escape() { for (const type of ['keyDown', 'keyUp']) cdp('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); }
function shot(name, selector, board = false) {
  state('q.v?.surface.closeHoverPreview();await q.frames();await new Promise(r=>setTimeout(r,250));return true;');
  const rect = JSON.parse(state(`const els=${selector ? '[...document.querySelectorAll(' + JSON.stringify(selector) + ')]' : '[q.leaf.view.contentEl]'};assert(els.length,'Missing capture target');const rects=els.map(el=>el.getBoundingClientRect());const x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y));const r={x,y,width:Math.max(...rects.map(r=>r.right))-x,height:Math.max(...rects.map(r=>r.bottom))-y};let height=r.height;if(${board}){const rows=[...els[0].querySelectorAll('.jsp-row')];if(rows.length)height=Math.min(height,rows.at(-1).getBoundingClientRect().bottom-r.y+42)}if(${JSON.stringify(name)}==='09-notebook-tasks'){const items=[...els[0].querySelectorAll('.jsp-notebook .jsp-card,.jsp-task')];height=Math.min(height,Math.max(...items.map(e=>e.getBoundingClientRect().bottom))-r.y+36)}if(${JSON.stringify(name)}==='10-markdown-source'){const items=els.flatMap(el=>[...el.querySelectorAll('.jsp-row,.cm-line')]);height=Math.min(height,Math.max(...items.map(e=>e.getBoundingClientRect().bottom))-r.y+36)}return JSON.stringify({x:Math.max(0,r.x),y:Math.max(0,r.y),width:Math.min(r.width,innerWidth-r.x),height:Math.min(height,innerHeight-r.y),scale:1});`));
  const result = cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: rect });
  mkdirSync(images, { recursive: true });
  writeFileSync(path.join(images, name + '.png'), Buffer.from(result.data, 'base64'));
  console.log('Captured ' + name + '.png');
}
function files(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(path.join(dir, item.name), prefix + item.name + '/') : [[prefix + item.name, readFileSync(path.join(dir, item.name), 'utf8')]]);
}

if (run('eval', 'code=app.vault.adapter.getBasePath()').replace(/^=>\s*/, '') !== canonical) throw Error('Wrong vault; no UI action performed');

if (mode === 'all' || mode === 'finish') {
  const steps=mode==='all'?['board', 'settings', 'layout', 'filters', 'thread', 'editor', 'menu', 'connect', 'move', 'fold', 'spotlight', 'notebook', 'source', 'advanced', 'scheduling', 'remove']:['move', 'fold', 'spotlight', 'notebook', 'source', 'advanced', 'scheduling', 'remove'];
  for (const step of steps) {
    process.stdout.write(execFileSync(process.execPath, [fileURLToPath(import.meta.url), step], { encoding: 'utf8', timeout: 60000, windowsHide: true }));
  }
} else if (mode === 'prepare' || mode === 'resume') {
  const saved = mode === 'resume' ? JSON.parse(readFileSync(sessionFile, 'utf8')) : null;
  const source = files(path.join(root, 'examples/tutorial/Planner tutorial')).map(([name, text]) => [folder + '/' + name, text.replaceAll('Planner tutorial/', folder + '/')]);
  console.log(evaluate(`
    if(window.__jspTutorial&&!window.__jspTutorial.cleaned)throw Error('Capture session already exists');
    const p=app.plugins.getPlugin('just-simple-planner');if(!p||p.manifest.version!=='0.5.6'||!p.basesAvailable)throw Error('Expected Planner 0.5.6 and Bases');
    const assert=(v,msg)=>{if(!v)throw Error(msg)},wait=async(fn)=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,25))}throw Error('Timed out')};
    const saved=${JSON.stringify(saved)};
    const q=window.__jspTutorial={p,assert,wait,folder:${JSON.stringify(folder)},before:new Map(saved?.before??[]),leaves:[],layout:saved?.layout??app.workspace.getLayout(),source:${JSON.stringify(source)},checks:saved?.checks??[]};
    assert(saved||!app.vault.getAbstractFileByPath(q.folder),'Capture folder exists; use resume to preserve it');
    if(!saved)for(const file of app.vault.getMarkdownFiles())if(!file.path.startsWith('Pruebas/Just Simple Planner/Tutorial 0.5.6/'))q.before.set(file.path,await app.vault.read(file));
    q.settingsPath=app.vault.configDir+'/plugins/just-simple-planner/data.json';q.settings=saved?.settings??await app.vault.adapter.read(q.settingsPath);
    q.frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    q.captureStyle=document.head.createEl('style',{text:'[aria-label^="Pip"],[aria-label^="Call Pip"],.tooltip{display:none !important}'});
    q.open=async(file)=>{if(q.leaf){await q.leaf.view.save?.();q.leaf.detach()}q.leaf=app.workspace.getLeaf('tab');q.leaves.push(q.leaf);await q.leaf.openFile(file);app.workspace.setActiveLeaf(q.leaf,{focus:true});await wait(()=>q.leaf.view.controller?.view?.type==='just-simple-planner-bases');q.v=q.leaf.view.controller.view;await q.frames();await new Promise(r=>setTimeout(r,180));return q.v};
    q.board=async(advanced=false)=>{await q.open(app.vault.getAbstractFileByPath(q.folder+(advanced?'/Avanzado/Planner avanzado.base':'/Primeros pasos/Primer planner.base')));await wait(()=>q.v.session.entries.size===(advanced?3:5));await q.v.surface.setState({mode:'board',firstDay:'2026-10-10',scrollLeft:30*190,scrollTop:0,collapsed:[],search:'',status:'all',showTasks:false});const date=q.v.surface.contentEl.querySelector('[aria-label="Go to date"]');date.value='2026-11-09';date.dispatchEvent(new Event('change',{bubbles:true}));await q.frames();q.v.surface.scroll.scrollLeft=30*190;await q.frames()};
    q.fill=(el,value)=>{assert(el,'Missing input');el.value=value;el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))};
    q.button=(label,root=document)=>{const b=[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===label||b.getAttribute('aria-label')===label);assert(b,'Missing button '+label);b.click()};
    q.main=q.folder+'/Primeros pasos';q.paths={define:q.main+'/Definir el objetivo.md',draft:q.main+'/Redactar la propuesta.md',review:q.main+'/Revisar con el equipo.md',prepare:q.main+'/Preparar la publicación.md',publish:q.main+'/Publicar el resultado.md'};
    let current='';for(const part of q.folder.split('/')){current=current?current+'/'+part:part;if(!app.vault.getAbstractFileByPath(current))await app.vault.createFolder(current)}
    for(const [name,text]of q.source){const parent=name.slice(0,name.lastIndexOf('/'));if(!app.vault.getAbstractFileByPath(parent))await app.vault.createFolder(parent);const existing=app.vault.getAbstractFileByPath(name);if(!existing)await app.vault.create(name,text);else if(name.endsWith('.md'))assert(await app.vault.read(existing)===text,'Existing fixture differs; preserve it: '+name)}
    await wait(()=>q.source.filter(([n])=>n.endsWith('.md')).every(([n])=>app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(n))?.frontmatter));
    return 'Prepared tutorial files; original Markdown and plugin settings captured';
  `));
  mkdirSync(path.dirname(sessionFile), { recursive: true });
  writeFileSync(sessionFile, state('return JSON.stringify({before:[...q.before],layout:q.layout,settings:q.settings,checks:q.checks});'));
  cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  cdp('Emulation.setDeviceMetricsOverride', { width: 1500, height: 980, deviceScaleFactor: 1, mobile: false });
  console.log(state('await q.board();assert(q.v.session.entries.size===5,"Starter count");assert(q.v.session.threads.size===2,"Thread count");assert([...q.v.session.entries.values()].reduce((n,e)=>n+e.next.length,0)===4,"Connection count");assert(q.v.session.invalid.size===0,"Invalid starter notes");q.checks.push("Starter: 5 entries, 2 threads, 4 connections, no invalid notes");return JSON.stringify({text:q.leaf.view.contentEl.innerText,toolbar:[...q.leaf.view.containerEl.querySelectorAll(".bases-toolbar button,.bases-toolbar .text-icon-button")].map(e=>({text:e.innerText,label:e.getAttribute("aria-label")}))});'));
  shot('01-first-planner', null, true);
} else if (mode === 'inspect') {
  console.log(state('return JSON.stringify({text:document.body.innerText.slice(-16000),menus:[...document.querySelectorAll(".bases-toolbar-menu,.menu,.popover")].map(e=>e.outerHTML.slice(0,18000))});'));
} else if (mode === 'eval') {
  console.log(state(process.argv[3]));
} else if (mode === 'capture') {
  shot(process.argv[3], process.argv[4] || null, process.argv[5] === 'board');
} else if (mode === 'board') {
  escape(); console.log(state('await q.board();return true;')); shot('01-first-planner', null, true);
} else if (mode === 'settings' || mode === 'scheduling') {
  escape(); state('await q.board(' + (mode === 'scheduling') + ');q.leaf.view.containerEl.querySelector(".bases-toolbar-views-menu .text-icon-button").click();await q.frames();document.querySelector(".bases-toolbar-menu-item.mod-active .bases-toolbar-menu-item-icon").click();await q.frames();return true;');
  if (mode === 'scheduling') state('const label=[...document.querySelectorAll(".input-group-header-text")].find(e=>e.textContent==="Optional scheduling");label.parentElement.click();await q.frames();return true;');
  shot(mode === 'settings' ? '04-view-properties' : '12-schedule-properties', '.bases-toolbar-menu'); escape();
} else if (mode === 'layout') {
  escape();state('await q.board();q.leaf.view.containerEl.querySelector(".bases-toolbar-views-menu .text-icon-button").click();await q.frames();document.querySelector(".bases-toolbar-menu-item.mod-active .bases-toolbar-menu-item-icon").click();await q.frames();const row=[...document.querySelectorAll(".input-row")].find(e=>e.querySelector(".input-row-label")?.textContent==="Layout");row.querySelector(".combobox-button").click();await q.frames();return true;');
  shot('02-select-layout', '.bases-toolbar-menu, .suggestion-container'); escape();escape();
} else if (mode === 'filters') {
  escape(); state('await q.board();q.leaf.view.containerEl.querySelector(".bases-toolbar-filter-menu .text-icon-button").click();await q.frames();for(const header of document.querySelectorAll(".bases-toolbar-section-header")){if(header.textContent.includes("All views")&&header.classList.contains("is-collapsed")||header.textContent.includes("This view")&&!header.classList.contains("is-collapsed"))header.click()}await q.frames();return true;');
  shot('03-base-filters', '.bases-toolbar-menu');
  console.log(state('return document.querySelector(".bases-toolbar-menu").innerText;')); escape();
} else if (mode === 'fold' || mode === 'spotlight') {
  escape(); state('await q.board();' + (mode === 'fold' ? 'q.v.surface.collapsed.add(q.main+"/Publicaciones.md");' : 'q.spotlightBefore=await app.vault.read(p.file(q.paths.review));await q.v.session.connect(q.paths.review,q.paths.prepare,true);await wait(()=>!q.v.session.entries.get(q.paths.review)?.next.includes(q.paths.prepare));q.v.surface.focusPath=q.paths.review;') + 'q.v.surface.render();return true;');
  shot(mode === 'fold' ? '08-folded-thread' : '08-spotlight', null, true);
  if(mode==='spotlight')state('q.v.surface.focusPath=null;await q.v.session.history.undo();await wait(()=>q.v.session.entries.get(q.paths.review)?.snapshot===q.spotlightBefore);return true;');
} else if (mode === 'editor') {
  escape(); state('await q.board();q.v.session.editEntry(q.v.session.entries.get(q.paths.define));await wait(()=>document.querySelector(".jsp-entry-modal"));return true;');
  shot('05-entry-editor', '.jsp-entry-modal'); escape();
} else if (mode === 'thread') {
  escape();state('await q.board();q.button("New thread",q.v.surface.contentEl);await wait(()=>document.querySelector(".modal-title")?.textContent==="New thread");q.fill(document.querySelector(".modal input"),"Proyecto Aurora");q.fill(document.querySelector(".modal select"),"cyan");return true;');
  shot('05-thread-editor', '.modal');escape();
} else if (mode === 'menu') {
  escape(); state('await q.board();const card=q.v.surface.renderedCards.get(q.paths.draft);card.querySelector(".jsp-card-menu").click();return true;');
  shot('06-card-menu', '.menu:not(.bases-toolbar-menu)'); escape();
} else if (mode === 'move') {
  escape();state('await q.board();q.moveBefore=await app.vault.read(p.file(q.paths.define));q.v.session.editEntry(q.v.session.entries.get(q.paths.define));await wait(()=>document.querySelector(".jsp-entry-modal"));const modal=document.querySelector(".jsp-entry-modal");q.fill(modal.querySelector("input[type=date]"),"2026-11-10");q.button("Save",modal);await wait(()=>!document.querySelector(".jsp-entry-modal")&&q.v.session.entries.get(q.paths.define)?.date==="2026-11-10");return true;');
  shot('07-reschedule',null,true);
  console.log(state('await q.v.session.history.undo();await wait(()=>q.v.session.entries.get(q.paths.define)?.snapshot===q.moveBefore);assert(await app.vault.read(p.file(q.paths.define))===q.moveBefore,"Date edit undo changed note");q.checks.push("Entry editor changes the date; Undo restores exact Markdown");return "Verified date editing and Undo";'));
} else if (mode === 'connect') {
  escape();state('await q.board();q.dragBefore=await app.vault.read(p.file(q.paths.define));return true;');
  const points=JSON.parse(state('const card=q.v.surface.renderedCards.get(q.paths.define),target=q.v.surface.renderedCards.get(q.paths.review),r=card.getBoundingClientRect(),h=card.querySelector(".jsp-connection-handle").getBoundingClientRect(),t=target.getBoundingClientRect();return JSON.stringify({card:{x:r.x+r.width/2,y:r.y+20},handle:{x:h.x+h.width/2,y:h.y+h.height/2},target:{x:t.x+t.width/2,y:t.y+t.height/2},moved:{x:r.x+r.width/2+190,y:r.y+20}});'));
  const mouse=(type,point,down=false)=>cdp('Input.dispatchMouseEvent',{type,...point,button:type==='mouseMoved'&&!down?'none':'left',buttons:down?1:0,clickCount:1});
  mouse('mouseMoved',points.card);
  const from=points.handle,to=points.target;
  mouse('mousePressed',from,true);mouse('mouseMoved',{x:from.x+12,y:from.y+2},true);mouse('mouseMoved',to,true);
  shot('06-connect-drag',null,true);
  mouse('mouseReleased',to);
  state('await wait(()=>q.v.session.entries.get(q.paths.define)?.next.includes(q.paths.review));return true;');
  console.log(state('await q.v.session.history.undo();await wait(()=>q.v.session.entries.get(q.paths.define)?.snapshot===q.dragBefore);assert(await app.vault.read(p.file(q.paths.define))===q.dragBefore,"Trusted gesture undo changed note");q.checks.push("Mouse connection drag saves a next link; Undo restores exact Markdown");return "Verified trusted mouse gesture and Undo";'));
} else if (mode === 'source') {
  escape();state('await q.board();q.sourceLeaf=app.workspace.getLeaf("split","vertical");q.leaves.push(q.sourceLeaf);await q.sourceLeaf.setViewState({type:"markdown",state:{file:q.paths.define,mode:"source",source:true}});app.workspace.setActiveLeaf(q.sourceLeaf,{focus:true});q.leaf.view.contentEl.dataset.tutorialCapture="true";q.sourceLeaf.view.contentEl.dataset.tutorialCapture="true";await q.frames();return true;');
  shot('10-markdown-source','[data-tutorial-capture]');state('delete q.leaf.view.contentEl.dataset.tutorialCapture;delete q.sourceLeaf.view.contentEl.dataset.tutorialCapture;q.sourceLeaf.detach();return true;');
} else if (mode === 'notebook') {
  escape(); state('await q.board();q.v.surface.activeThread=q.main+"/Proyecto Aurora.md";q.button("Switch to notebook",q.v.surface.contentEl);q.button("Tasks",q.v.surface.contentEl);await q.frames();assert(q.v.surface.contentEl.querySelectorAll(".jsp-task-rail input[type=checkbox]").length===5,"Expected five pending tasks");q.checks.push("Notebook and five source checkboxes");return true;');
  shot('09-notebook-tasks');
} else if (mode === 'advanced') {
  escape(); state('await q.board(true);assert(q.v.session.entries.size===3,"Advanced source notes");assert(q.v.session.invalid.size===0,"Invalid advanced notes");const entries=[...q.v.session.entries.values()];const projected=q.v.session.projectEntries(entries,"2026-11-09","2026-11-30");const weekly=projected.filter(e=>e.title==="Revisión semanal").map(e=>e.date);assert(JSON.stringify(weekly)===JSON.stringify(["2026-11-09","2026-11-23","2026-11-30"]),"Weekly dates");const extra=projected.filter(e=>e.title==="Tutorías de seguimiento").map(e=>e.date);assert(JSON.stringify(extra)===JSON.stringify(["2026-11-10","2026-11-12","2026-11-17"]),"Additional dates");q.checks.push("Advanced: inclusive 3-day range, skipped weekly occurrence, three additional-date appearances");return true;');
  shot('11-advanced-board', null, true);
} else if (mode === 'remove') {
  escape(); state('await q.board();await q.v.session.reviewNote(p.file(q.paths.publish),{remove:true});return true;');
  shot('10-remove-keep-note', '.jsp-membership-modal'); escape();
} else if (mode === 'drag-flow') {
  escape();console.log(state(String.raw`
    await q.board();const s=q.v.session,v=q.v.surface;const entries=[...s.entries.values()],before=new Map(await Promise.all(entries.map(async e=>[e.path,await app.vault.read(p.file(e.path))])));const start=s.entries.get(q.paths.define),card=v.renderedCards.get(start.path),transfer=new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer,shiftKey:true}));assert(v.dragging?.paths.size===5,'Expected the complete cross-thread flow');
    const lane=[...v.contentEl.querySelectorAll('.jsp-lane')].find(e=>e.dataset.thread===start.thread),target='2026-11-11',index=Math.round((Date.parse(target+'T12:00:00Z')-Date.parse(v.firstDay+'T12:00:00Z'))/86400000);lane.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer,clientX:lane.getBoundingClientRect().left+index*s.settings.dayWidth+s.settings.dayWidth/2,clientY:lane.getBoundingClientRect().top+30}));
    await wait(()=>s.entries.get(start.path)?.date===target&&!s.history.busy);for(const entry of entries)assert(Date.parse(s.entries.get(entry.path).date+'T12:00:00Z')-Date.parse(entry.date+'T12:00:00Z')===2*86400000,'Flow lost date gaps');await s.history.undo();await wait(()=>entries.every(e=>s.entries.get(e.path)?.snapshot===before.get(e.path)));for(const [name,text]of before)assert(await app.vault.read(p.file(name))===text,'Flow undo changed '+name);q.checks.push('DOM drag moves all five connected cards across two threads by two days; Undo restores every file');return q.checks.at(-1);
  `));
} else if (mode === 'workflow') {
  escape();
  console.log(state(String.raw`
    const parent='Pruebas/Just Simple Planner/Tutorial 0.5.6/Construcción guiada';if(!app.vault.getAbstractFileByPath(parent))await app.vault.createFolder(parent);q.build=parent+'/'+Date.now();assert(!app.vault.getAbstractFileByPath(q.build),'Guided fixture exists');await app.vault.createFolder(q.build);
    const original=${JSON.stringify(readFileSync(path.join(root, 'docs/downloads/First planner.base'), 'utf8'))};
    const base=await app.vault.create(q.build+'/Mi primer planner.base',original.replaceAll('Mi primer planner',q.build));await q.open(base);await wait(()=>q.v.surface.contentEl.querySelector('.jsp-empty'));const s=q.v.session;
    q.button('New thread',q.v.surface.contentEl);await wait(()=>document.querySelector('.modal-title')?.textContent==='New thread');let modal=document.querySelector('.modal');q.fill(modal.querySelector('input'),'Proyecto guiado QA');q.fill(modal.querySelector('select'),'cyan');q.button('Create',modal);await wait(()=>s.threads.size===1);const thread=[...s.threads.values()][0];assert(thread.path.startsWith(q.build+'/'),'Native thread creation escaped folder filter');q.checks.push('New thread dialog creates a real note within the Base folder');
    q.button('New entry',q.v.surface.contentEl);await wait(()=>document.querySelector('.jsp-entry-modal'));modal=document.querySelector('.jsp-entry-modal');q.fill(modal.querySelector('input[type=text]'),'Definir el objetivo QA');q.fill(modal.querySelector('input[type=date]'),'2026-11-09');q.fill(modal.querySelector('select'),thread.path);q.fill(modal.querySelector('textarea'),'Objetivo del ensayo.\n\n- [ ] Revisar el resultado.');q.button('Save',modal);await wait(()=>s.entries.size===1);const first=[...s.entries.values()][0];assert(first.path.startsWith(q.build+'/'),'Native entry creation escaped folder filter');assert(first.thread===thread.path,'New entry thread');assert(first.date==='2026-11-09','New entry date');q.checks.push('New entry dialog writes the date, thread and Markdown task');
    s.newEntry('2026-11-10',thread.path,first.path);await wait(()=>document.querySelector('.jsp-entry-modal'));modal=document.querySelector('.jsp-entry-modal');assert(modal.querySelector('input[type=date]').value==='2026-11-10','Continuation date');q.fill(modal.querySelector('input[type=text]'),'Redactar la propuesta QA');q.button('Save',modal);await wait(()=>s.entries.size===2&&s.entries.get(first.path)?.next.length===1);const second=[...s.entries.values()].find(e=>e.path!==first.path);assert(s.entries.get(first.path).next[0]===second.path,'Continuation link');q.checks.push('Connected continuation saves a second note and a normal next wikilink');
    const before=await app.vault.read(p.file(first.path));await s.patch([{path:first.path,fields:{date:'2026-11-10'},expectedDate:'2026-11-09'}]);await wait(()=>s.entries.get(first.path)?.date==='2026-11-10');await s.history.undo();await wait(()=>s.entries.get(first.path)?.date==='2026-11-09');assert(await app.vault.read(p.file(first.path))===before,'Move undo lost note bytes');q.checks.push('Rescheduling and Undo restore the exact original note');
    const entry=s.entries.get(first.path),line=entry.body.split(/\r?\n/).findIndex(l=>l.includes('- [ ]'));await s.toggleEntryTask(entry,line,true);await wait(()=>s.entries.get(first.path)?.body.includes('- [x]'));await s.history.undo();await wait(()=>s.entries.get(first.path)?.body===entry.body);assert(await app.vault.read(p.file(first.path))===before,'Task undo lost note');q.checks.push('Task completion updates Markdown and Undo restores it');
    await s.reviewNote(p.file(first.path),{remove:true});await wait(()=>document.querySelector('.jsp-membership-modal'));q.button('Remove from planner',document.querySelector('.jsp-membership-modal'));await wait(()=>!s.entries.has(first.path));const kept=await app.vault.read(p.file(first.path));assert(!kept.includes('planner_type: entry')&&kept.includes('date: 2026-11-09')&&kept.includes('Objetivo del ensayo.'),'Removal changed source content');await s.history.undo();await wait(()=>s.entries.has(first.path));assert(await app.vault.read(p.file(first.path))===before,'Removal Undo lost note');q.checks.push('Remove from planner keeps the file/date/body; Undo restores exact contents');
    return JSON.stringify({checks:q.checks,guidedNotes:[...s.entries.keys(),...s.threads.keys()]});
  `));
} else if (mode === 'cleanup') {
  escape();
  console.log(state(`
    for(const leaf of q.leaves){if(leaf.view?.file?.path.startsWith(q.folder+'/')||leaf.view?.file?.path.startsWith('Pruebas/Just Simple Planner/Tutorial 0.5.6/')){await leaf.view.save?.();leaf.detach()}}
    for(const file of app.vault.getMarkdownFiles().filter(f=>f.path.startsWith(q.folder+'/')||f.path.startsWith('Pruebas/Just Simple Planner/Tutorial 0.5.6/'))){const text=await app.vault.read(file);await app.vault.modify(file,text.replace(/\\nplanner_type: (entry|thread)\\n/,'\\nplanner_type: qa-archived\\n'))}
    for(const [name,text]of q.before)assert(await app.vault.read(p.file(name))===text,'Original note changed: '+name);
    assert(await app.vault.adapter.read(q.settingsPath)===q.settings,'Plugin settings changed');
    q.captureStyle?.remove();await app.workspace.changeLayout(q.layout);
    const owned=[];app.workspace.iterateAllLeaves(leaf=>{const name=leaf.view?.file?.path;if(name?.startsWith(q.folder+'/')||name?.startsWith('Pruebas/Just Simple Planner/Tutorial 0.5.6/'))owned.push(leaf)});for(const leaf of owned)leaf.detach();q.cleaned=true;
    return JSON.stringify({checks:q.checks,originalNotesPreserved:q.before.size,settingsPreserved:true,fixtures:'Retained as qa-archived; no notes deleted',layoutRestored:true});
  `));
  cdp('Emulation.clearDeviceMetricsOverride');
  cdp('Emulation.setFocusEmulationEnabled', { enabled: false });
} else throw Error('Use prepare/resume, all/finish, workflow, inspect, eval, capture, board, settings, layout, filters, thread, editor, menu, connect, move, fold, spotlight, notebook, source, advanced, scheduling, remove or cleanup');
