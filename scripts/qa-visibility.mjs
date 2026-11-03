import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const cli = 'C:\\Program Files\\Obsidian\\Obsidian.com';
const canonical = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../@Nexus-dev');
function run(...args) { const out = execFileSync(cli, ['vault=@Nexus-dev', ...args], { encoding: 'utf8', timeout: 25000, windowsHide: true }).trim(); if (/^Error:/m.test(out)) throw Error(out); return out; }
function evaluate(code) { const out = run('eval', 'code=(async()=>{if(app.vault.adapter.getBasePath()!==' + JSON.stringify(canonical) + ')throw Error("Wrong vault");' + code + '})()'); if (!out.startsWith('=>')) throw Error('No evaluation result'); return out; }
function state(code) { return evaluate('const q=window.__jspVisibilityQA;const {assert,wait}=q;' + code); }
const passed = [];
function check(name, code) { state(code + "return 'PASS';"); passed.push(name); console.log('PASS ' + name); }
run('dev:debug', 'on'); run('dev:errors', 'clear');
run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":true}');
try {
  evaluate(String.raw`
    const p=app.plugins.getPlugin('just-simple-planner'),assert=(ok,msg)=>{if(!ok)throw Error(msg)},wait=async(fn)=>{for(let i=0;i<240;i++){if(fn())return;await new Promise(r=>setTimeout(r,25))}throw Error('Timed out')};
    const q=window.__jspVisibilityQA={p,assert,wait,layout:app.workspace.getLayout(),folder:'Pruebas/Just Simple Planner/Visibilidad QA/'+Date.now(),leaves:[]};
    let folder='';for(const part of q.folder.split('/')){folder=folder?folder+'/'+part:part;if(!app.vault.getAbstractFileByPath(folder))await app.vault.createFolder(folder)}
    q.note=await app.vault.create(q.folder+'/Nota de visibilidad QA.md','---\nplanner_type: entry\ntitle: Nota de visibilidad QA\ndate: 2026-11-03\nthread: Visibilidad QA\n---\nContenido inicial de visibilidad.\n');
    q.other=await app.vault.create(q.folder+'/Otra pestaña QA.md','---\nplanner_type: qa-archived\n---\nOtra pestaña para probar el estado oculto.\n');
    const doc={filters:{and:['file.ext == "md"','file.inFolder('+JSON.stringify(q.folder)+')','note.planner_type == "entry"']},views:[{type:'just-simple-planner-bases',name:'Planner',dayWidth:'140',plannerState:{mode:'board',firstDay:'2026-10-04',scrollLeft:4200,scrollTop:0}}]};
    q.base=await app.vault.create(q.folder+'/Planner de visibilidad QA.base',JSON.stringify(doc,null,2));q.leaf=app.workspace.getLeaf('tab');q.leaves.push(q.leaf);await q.leaf.openFile(q.base);app.workspace.setActiveLeaf(q.leaf,{focus:true});await wait(()=>q.leaf.view.controller?.view?.session?.entries.has(q.note.path));q.view=q.leaf.view.controller.view;
    await q.view.surface.setState({mode:'board',firstDay:'2026-10-04',scrollLeft:4200,scrollTop:0,collapsed:[],search:'',status:'all'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));q.saved=q.view.surface.getState();assert(q.saved.scrollLeft===4200,'Initial visible position');
    q.show=async()=>{await app.workspace.revealLeaf(q.leaf);app.workspace.setActiveLeaf(q.leaf,{focus:true});await wait(()=>q.view.surface.scroll.clientWidth>0);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))};
    q.hide=async()=>{if(!q.otherLeaf){q.otherLeaf=app.workspace.getLeaf('tab');q.leaves.push(q.otherLeaf);await q.otherLeaf.openFile(q.other)}await app.workspace.revealLeaf(q.otherLeaf);app.workspace.setActiveLeaf(q.otherLeaf,{focus:true});await wait(()=>q.view.surface.scroll.clientWidth===0)};
    return 'READY';
  `);
  check('updating a hidden Base preserves its saved date and horizontal position', String.raw`await q.hide();await app.vault.modify(q.note,(await app.vault.read(q.note))+'\nCambio con la pestaña oculta.\n');await wait(()=>q.view.session.entries.get(q.note.path)?.body.includes('Cambio con la pestaña oculta'));const saved=q.view.config.get('plannerState');assert(saved.firstDay===q.saved.firstDay&&saved.scrollLeft===q.saved.scrollLeft,'Hidden update lost position: '+JSON.stringify(saved));`);
  check('revealing the hidden planner restores the same visible day', String.raw`await q.show();const actual=q.view.surface.getState();assert(actual.firstDay===q.saved.firstDay&&actual.scrollLeft===q.saved.scrollLeft,'Reveal moved the board: '+JSON.stringify(actual));`);
  check('repeated hidden updates and tab switches do not shift the loaded date window', String.raw`for(let i=0;i<4;i++){await q.hide();q.view.surface.render();await q.show();const actual=q.view.surface.getState();assert(actual.firstDay===q.saved.firstDay&&actual.scrollLeft===q.saved.scrollLeft,'Tab switch drifted')}`);
  check('closing a hidden Base and reopening it retains its date window and position', String.raw`await q.hide();await q.leaf.view.save();await q.leaf.detach();q.leaf=app.workspace.getLeaf('tab');q.leaves.push(q.leaf);await q.leaf.openFile(q.base);app.workspace.setActiveLeaf(q.leaf,{focus:true});await wait(()=>q.leaf.view.controller?.view?.session?.entries.has(q.note.path));q.view=q.leaf.view.controller.view;await q.show();const actual=q.view.surface.getState();assert(actual.firstDay===q.saved.firstDay&&actual.scrollLeft===q.saved.scrollLeft,'Reopen lost hidden state: '+JSON.stringify(actual));`);
  check('restoring a new state while hidden applies it when the view becomes visible', String.raw`await q.hide();q.saved={...q.saved,firstDay:'2026-10-05',scrollLeft:4340};await q.view.surface.setState(q.saved);const hidden=q.view.surface.getState();assert(hidden.firstDay===q.saved.firstDay&&hidden.scrollLeft===q.saved.scrollLeft,'Pending state lost');await q.show();const actual=q.view.surface.getState();assert(actual.firstDay===q.saved.firstDay&&actual.scrollLeft===q.saved.scrollLeft,'Pending restore lost');`);
  check('Notebook keeps its vertical position through hidden data updates', String.raw`const text=await app.vault.read(q.note);await app.vault.modify(q.note,text+'\n'+Array.from({length:50},(_,i)=>'Párrafo de prueba '+i+'.').join('\n\n'));await wait(()=>q.view.session.entries.get(q.note.path)?.body.includes('Párrafo de prueba 49.'));await q.view.surface.setState({mode:'notebook',activeThread:'text:Visibilidad QA',scrollLeft:0,scrollTop:160});await wait(()=>q.view.surface.scroll.scrollHeight>q.view.surface.scroll.clientHeight+200);q.view.surface.scroll.scrollTop=160;q.view.surface.onScroll();await q.hide();await app.vault.modify(q.note,(await app.vault.read(q.note))+'\nActualización del cuaderno oculto.\n');await wait(()=>q.view.session.entries.get(q.note.path)?.body.includes('Actualización del cuaderno oculto'));assert(q.view.surface.getState().scrollTop===160,'Hidden Notebook position');await q.show();assert(q.view.surface.scroll.scrollTop===160&&q.view.surface.getState().mode==='notebook','Notebook reveal position');`);
} finally {
  try { console.log(evaluate(String.raw`const q=window.__jspVisibilityQA;if(!q)return 'CLEAN';for(const leaf of q.leaves)leaf.detach();if(q.note)await app.fileManager.processFrontMatter(q.note,fm=>{fm.planner_type='qa-archived'});await app.workspace.changeLayout(q.layout);return 'Workspace restored; fixtures retained';`)); }
  finally { run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":false}'); }
}
if (!run('dev:errors').includes('No errors captured.')) throw Error(run('dev:errors'));
console.log(JSON.stringify({ vault: canonical, checks: passed.length, passed }, null, 2));
