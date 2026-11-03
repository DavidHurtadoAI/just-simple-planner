import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const cli = 'C:\\Program Files\\Obsidian\\Obsidian.com';
const canonical = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../@Nexus-dev');
function run(...args) {
  const out = execFileSync(cli, ['vault=@Nexus-dev', ...args], { encoding: 'utf8', timeout: 25000, windowsHide: true }).trim();
  if (/^Error:/m.test(out)) throw Error(out);
  return out;
}
function evaluate(code) {
  const out = run('eval', 'code=(async()=>{if(app.vault.adapter.getBasePath()!==' + JSON.stringify(canonical) + ')throw Error("Wrong vault");' + code + '})()');
  if (!out.startsWith('=>')) throw Error('No evaluation result: ' + out);
  return out;
}
function state(code) { return evaluate('const q=window.__jspClassicUIQA;const {p,v,assert,wait}=q;' + code); }
const passed = [];
function check(name, code) { state(code + "return 'PASS';"); passed.push(name); console.log('PASS ' + name); }
run('dev:debug', 'on'); run('dev:errors', 'clear');
run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":true}');
try {
  evaluate(String.raw`
    const p=app.plugins.getPlugin('just-simple-planner');await p.openPlanner();await p.reloadIndex();
    const leaf=app.workspace.getLeavesOfType('just-simple-planner')[0];app.workspace.setActiveLeaf(leaf,{focus:true});const v=leaf.view.surface;
    const assert=(ok,msg)=>{if(!ok)throw Error(msg)},wait=async(fn)=>{for(let i=0;i<240;i++){if(fn())return;await new Promise(r=>setTimeout(r,25))}throw Error('Timed out')};
    const q=window.__jspClassicUIQA={p,v,assert,wait,folder:'Pruebas/Just Simple Planner/Interfaz clásica QA/'+Date.now(),before:new Map(),owned:new Set(),settings:{...p.settings},view:v.getState()};
    for(const item of [...p.entries.values(),...p.threads.values()])q.before.set(item.path,await app.vault.read(p.file(item.path)));
    let folder='';for(const part of q.folder.split('/')){folder=folder?folder+'/'+part:part;if(!app.vault.getAbstractFileByPath(folder))await app.vault.createFolder(folder)}
    q.event=app.vault.on('create',f=>{if(f.extension==='md'&&f.path.startsWith(q.folder+'/'))q.owned.add(f.path)});
    q.thread=q.folder+'/Hilo de interfaz QA.md';q.a=q.folder+'/Primera entrada QA.md';q.b=q.folder+'/Segunda entrada QA.md';q.short=q.folder+'/2026-11-03 - Nombre completo QA.md';
    q.text='---\nplanner_type: entry\ntitle: Primera entrada UI QA\ndate: 2026-11-03\nthread: "[['+q.thread.slice(0,-3)+']]"\nnext: []\n---\nPrimer párrafo de interfaz.\n\n- [ ] Completar la comprobación UI.\n\nAguja de búsqueda UI.\n';
    q.fixtures=[[q.thread,'---\nplanner_type: thread\norder: -1000\ncolor: cyan\nstatus: active\n---\n'],[q.a,q.text],[q.b,q.text.replace('Primera entrada UI QA','Segunda entrada UI QA').replace('2026-11-03','2026-11-05')],[q.short,'---\nplanner_type: entry\ndate: 2026-11-03\nthread: "[['+q.thread.slice(0,-3)+']]"\n---\n']];
    for(const [name,text]of q.fixtures)await app.vault.create(name,text);await wait(()=>q.fixtures.every(([name])=>app.metadataCache.getFileCache(p.file(name))?.frontmatter));await p.reloadIndex();
    p.settings={...p.settings,entryFolder:q.folder};await v.setState({mode:'board',firstDay:'2026-10-04',scrollLeft:4200,scrollTop:0,collapsed:[],activeThread:q.thread,search:'',status:'all',showTasks:false});
    q.card=name=>[...v.contentEl.querySelectorAll('.jsp-card')].find(c=>c.dataset.path===name);q.modal=()=>document.querySelector('.jsp-entry-modal');q.button=name=>[...q.modal().querySelectorAll('button')].find(b=>b.textContent===name);q.input=(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))};q.key=(key,extra={})=>v.root.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra}));
    await wait(()=>q.card(q.short));return 'READY';
  `);
  check('classic cards retain the filename date and use both heights', String.raw`assert(p.entries.get(q.short).title==='2026-11-03 - Nombre completo QA','Filename prefix lost');assert(q.card(q.short).offsetHeight===68&&q.card(q.a).offsetHeight===116,'Card sizes');`);
  check('double-click opens the editor and Cancel preserves all bytes', String.raw`q.card(q.a).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await wait(()=>q.modal());assert(q.modal().querySelector('textarea').value.includes('Primer párrafo'),'Body missing');q.button('Cancel').click();await wait(()=>!q.modal());await new Promise(r=>setTimeout(r,250));v.root.focus();assert(await app.vault.read(p.file(q.a))===q.text,'Cancel wrote');`);
  // A synthetic card click does not activate Obsidian's workspace leaf. Select
  // the real target before sending a trusted F2 through its keyboard routing.
  state(String.raw`app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('just-simple-planner')[0],{focus:true});q.card(q.a).click();assert(v.selected.has(q.a),'F2 selection missing');v.root.focus();return 'FOCUSED';`);
  for (const type of ['keyDown', 'keyUp']) run('dev:cdp', 'method=Input.dispatchKeyEvent', 'params=' + JSON.stringify({ type, key: 'F2', code: 'F2', windowsVirtualKeyCode: 113 }));
  check('F2 edits title and body through Save, with exact undo', String.raw`assert(q.modal(),'Trusted F2 did not open editor');q.input(q.modal().querySelector('input'),'Título editado UI QA');q.input(q.modal().querySelector('textarea'),'Contenido guardado desde la interfaz.\n');q.button('Save').click();await wait(()=>!q.modal()&&p.entries.get(q.a)?.title==='Título editado UI QA'&&!p.history.busy);assert(p.entries.get(q.a).body.includes('Contenido guardado'),'Body save lost');await p.history.undo();assert(await app.vault.read(p.file(q.a))===q.text,'Editor undo');`);
  check('Ctrl-arrow moves the selection and keyboard undo/redo restores it', String.raw`q.card(q.a).click();q.key('ArrowRight',{ctrlKey:true});await wait(()=>p.entries.get(q.a)?.date==='2026-11-04'&&!p.history.busy);q.key('z',{ctrlKey:true});await wait(()=>p.entries.get(q.a)?.date==='2026-11-03'&&!p.history.busy);q.key('y',{ctrlKey:true});await wait(()=>p.entries.get(q.a)?.date==='2026-11-04'&&!p.history.busy);q.key('z',{ctrlKey:true});await wait(()=>p.entries.get(q.a)?.date==='2026-11-03'&&!p.history.busy);assert(await app.vault.read(p.file(q.a))===q.text,'Keyboard undo lost bytes');`);
  check('Ctrl-click and keyboard move treat two notes as one undo operation', String.raw`q.card(q.a).click();q.card(q.b).dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true}));assert(v.selected.size===2,'Multiselection');const before=await app.vault.read(p.file(q.b));q.key('ArrowRight',{ctrlKey:true});await wait(()=>p.entries.get(q.a)?.date==='2026-11-04'&&p.entries.get(q.b)?.date==='2026-11-06'&&!p.history.busy);q.key('z',{ctrlKey:true});await wait(()=>p.entries.get(q.a)?.date==='2026-11-03'&&p.entries.get(q.b)?.date==='2026-11-05'&&!p.history.busy);assert(await app.vault.read(p.file(q.a))===q.text&&await app.vault.read(p.file(q.b))===before,'Batch undo');`);
  check('Tab creates a next-day continuation through the actual editor', String.raw`q.card(q.a).click();q.key('Tab');await wait(()=>q.modal());assert(q.modal().querySelector('input[type=date]').value==='2026-11-04','Continuation date');q.input(q.modal().querySelector('input'),'Paso siguiente de interfaz QA');q.input(q.modal().querySelector('textarea'),'Continuación creada con Tab.');q.button('Save').click();await wait(()=>!q.modal()&&[...p.entries.values()].some(e=>e.title==='Paso siguiente de interfaz QA'&&p.entries.get(q.a).next.includes(e.path))&&!p.history.busy);q.created=[...p.entries.values()].find(e=>e.title==='Paso siguiente de interfaz QA');assert(q.created.path.startsWith(q.folder+'/')&&q.created.thread===q.thread,'Continuation location/thread');await p.history.undo();assert(await app.vault.read(p.file(q.a))===q.text,'Continuation undo');`);
  check('search finds body text beyond the preview and Escape clears selection', String.raw`const input=v.contentEl.querySelector('.jsp-search');q.input(input,'Aguja de búsqueda UI');assert(q.card(q.a)&&q.card(q.b)&&!q.card(q.short),'Full body search');q.input(input,'');q.card(q.a).click();q.key('Escape');assert(!v.selected.size&&!v.focusPath,'Escape selection');`);
  check('Notebook date navigation reaches the requested date and returns to board', String.raw`v.contentEl.querySelector('[aria-label="Switch to notebook"]').click();assert(v.contentEl.querySelector('.jsp-notebook'),'Notebook');const input=v.contentEl.querySelector('.jsp-navigation input[type=date]');input.value='2026-11-05';input.dispatchEvent(new Event('change',{bubbles:true}));const heading=v.contentEl.querySelector('h3[data-date="2026-11-05"]');assert(heading&&heading.getBoundingClientRect().top<v.scroll.getBoundingClientRect().bottom,'Notebook navigation');v.contentEl.querySelector('[aria-label="Switch to board"]').click();assert(q.card(q.a),'Board return');`);
  check('task completion writes Markdown with exact undo', String.raw`const entry=p.entries.get(q.a),line=entry.body.split(/\r?\n/).findIndex(l=>l.includes('- [ ]'));await p.toggleEntryTask(entry,line,true);assert((await app.vault.read(p.file(q.a))).includes('- [x] Completar'),'Task not saved');await p.history.undo();assert(await app.vault.read(p.file(q.a))===q.text,'Task undo');`);
  check('an editor with a stale snapshot retains its draft and preserves the concurrent edit', String.raw`p.editEntry(p.entries.get(q.a));q.input(q.modal().querySelector('textarea'),'Borrador que debe conservarse.');const edited=q.text+'\nCambio concurrente conservado.\n';try{await app.vault.modify(p.file(q.a),edited);q.button('Save').click();await wait(()=>!q.button('Save').disabled);assert(q.modal().querySelector('textarea').value==='Borrador que debe conservarse.','Draft lost');assert(await app.vault.read(p.file(q.a))===edited,'Concurrent edit overwritten');q.button('Cancel').click()}finally{await app.vault.modify(p.file(q.a),q.text);await p.reloadIndex()}`);
  check('thread folding keeps compact cards and restores the normal height', String.raw`v.collapsed.add(q.thread);v.render();assert(q.card(q.a).offsetHeight===24&&q.card(q.short).offsetHeight===24,'Folded heights');v.collapsed.delete(q.thread);v.render();assert(q.card(q.a).offsetHeight===116&&q.card(q.short).offsetHeight===68,'Unfolded heights');`);
  check('all pre-existing planner notes remain byte-for-byte unchanged', String.raw`for(const [name,text]of q.before)assert(await app.vault.read(p.file(name))===text,'Original changed: '+name);`);
} finally {
  try {
    console.log(evaluate(String.raw`const q=window.__jspClassicUIQA;if(!q)return 'CLEAN';q.button&&document.querySelector('.jsp-entry-modal')&&q.button('Cancel').click();q.p.settings=q.settings;if(q.event)app.vault.offref(q.event);for(const name of q.owned){const file=q.p.file(name);await app.fileManager.processFrontMatter(file,fm=>{fm.planner_type='qa-archived'})}await q.wait(()=>[...q.owned].every(name=>app.metadataCache.getFileCache(q.p.file(name))?.frontmatter?.planner_type==='qa-archived'));await q.p.reloadIndex();await q.v.setState(q.view);for(const [name,text]of q.before)q.assert(await app.vault.read(q.p.file(name))===text,'Original changed: '+name);return 'Original notes/settings/view preserved; fixtures archived';`));
  } finally { run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":false}'); }
}
if (!run('dev:errors').includes('No errors captured.')) throw Error(run('dev:errors'));
console.log(JSON.stringify({ vault: canonical, checks: passed.length, passed }, null, 2));
