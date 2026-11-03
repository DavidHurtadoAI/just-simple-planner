import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vault = path.resolve(repo, '../../@Nexus-dev');
const cli = 'C:\\Program Files\\Obsidian\\Obsidian.com';
function run(...args) {
  const out = execFileSync(cli, ['vault=@Nexus-dev', ...args], { encoding: 'utf8', timeout: 25000, windowsHide: true }).trim();
  if (/^Error:/m.test(out)) throw Error(out);
  return out;
}
function evaluate(code) {
  const out = run('eval', 'code=(async()=>{if(app.vault.adapter.getBasePath()!==' + JSON.stringify(vault) + ')throw Error("Wrong vault");' + code + '})()');
  const start = out.indexOf('=>'); if (start < 0) throw Error('Missing evaluation: ' + out);
  return out.slice(start + 2).trim();
}
function state(code) { return evaluate('const q=window.__jspCardCapture;const {assert,wait}=q;' + code); }
function inventory(folder = vault, result = new Map()) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const name = path.join(folder, entry.name);
    if (entry.isDirectory()) inventory(name, result);
    else if (entry.name.endsWith('.md')) result.set(name, createHash('sha256').update(readFileSync(name)).digest('hex'));
  }
  return result;
}
function shot(name) {
  state('await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true;');
  console.log(run('dev:screenshot', 'path=' + path.join(repo, 'docs/images', name + '.png')));
}
function escape() { for (const type of ['keyDown', 'keyUp']) run('dev:cdp', 'method=Input.dispatchKeyEvent', 'params=' + JSON.stringify({ type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })); }
if (run('vault', 'info=path') !== vault) throw Error('Wrong vault');
const before = inventory();
run('dev:debug', 'on'); run('dev:errors', 'clear');
run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":true}');
try {
  console.log(evaluate(String.raw`
    const p=app.plugins.getPlugin('just-simple-planner');if(p?.manifest.version!=='0.5.6')throw Error('Load Planner 0.5.6 before capturing');
    if(!app.internalPlugins.getPluginById('page-preview')?.enabled)throw Error('Enable Page preview');
    const assert=(ok,msg)=>{if(!ok)throw Error(msg)},wait=async fn=>{for(let i=0;i<240;i++){if(fn())return;await new Promise(r=>setTimeout(r,25))}throw Error('Timed out')};
    const q=window.__jspCardCapture={p,assert,wait,layout:app.workspace.getLayout(),folder:'Pruebas/Just Simple Planner/Capturas 0.5.6/'+Date.now(),notes:[]};
    q.settingsPath=app.vault.configDir+'/plugins/just-simple-planner/data.json';q.settings=await app.vault.adapter.read(q.settingsPath);
    let folder='';for(const part of q.folder.split('/')){folder=folder?folder+'/'+part:part;if(!app.vault.getAbstractFileByPath(folder))await app.vault.createFolder(folder)}
    q.thread=q.folder+'/Publicación.md';q.a=q.folder+'/Revisar el borrador.md';q.b=q.folder+'/Preparar la publicación.md';q.c=q.folder+'/Recoger comentarios.md';
    const link=name=>'[['+name.slice(0,-3)+']]';
    const note=(name,title,date,body,next)=>[name,'---\nplanner_type: entry\ntitle: '+title+'\ndate: '+date+'\nthread: "[['+q.thread.slice(0,-3)+'|Publicación]]"\n'+(next?'next:\n  - "'+link(next)+'"\n':'')+'---\n'+body];
    q.notes=[[q.thread,'---\nplanner_type: thread\ncolor: cyan\norder: -100\n---\n'],note(q.a,'Revisar el borrador','2026-11-03','Revisar el texto antes de publicar.\n',q.b),note(q.b,'Preparar la publicación','2026-11-04','## Preparar la publicación\n\nDejar el contenido y los recursos listos para compartir.\n\n- [ ] Comprobar los enlaces.\n'),note(q.c,'Recoger comentarios','2026-11-06','Conectar las observaciones con la siguiente mejora.\n')];
    for(const [name,text]of q.notes)await app.vault.create(name,text);await wait(()=>q.notes.every(([name])=>app.metadataCache.getCache(name)?.frontmatter));return 'Fixtures ready';
  `));
  state(String.raw`
    const doc={filters:{and:['file.inFolder('+JSON.stringify(q.folder)+')',{or:['note.planner_type == "entry"','note.planner_type == "thread"']}]},views:[{type:'just-simple-planner-bases',name:'Publicación',dateProperty:'note.date',titleProperty:'note.title',threadProperty:'note.thread',nextProperty:'note.next',dayWidth:'140',plannerState:{mode:'board',firstDay:'2026-10-04',scrollLeft:4200,scrollTop:0}}]};
    const file=await app.vault.create(q.folder+'/Planner de publicación.base',JSON.stringify(doc,null,2));q.leaf=app.workspace.getLeaf('tab');await q.leaf.openFile(file);await app.workspace.revealLeaf(q.leaf);app.workspace.setActiveLeaf(q.leaf,{focus:true});await wait(()=>q.leaf.view.controller?.view?.session.entries.has(q.b));q.s=q.leaf.view.controller.view.surface;await q.s.setState({mode:'board',firstDay:'2026-10-04',scrollLeft:4200,scrollTop:0,activeThread:q.thread,collapsed:[],search:'',status:'all',showTasks:false});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));q.card=name=>[...q.s.contentEl.querySelectorAll('.jsp-card')].find(el=>el.dataset.path===name);return true;
  `);
  const point = JSON.parse(state("const r=q.card(q.b).querySelector('strong').getBoundingClientRect();return JSON.stringify({x:r.left+10,y:r.top+8});"));
  run('dev:cdp', 'method=Input.dispatchMouseEvent', 'params={"type":"mouseMoved","x":150,"y":110,"buttons":0,"modifiers":0}');
  run('dev:cdp', 'method=Input.dispatchMouseEvent', 'params=' + JSON.stringify({ type: 'mouseMoved', ...point, buttons: 0, modifiers: 0 }));
  state("await wait(()=>{const e=q.s.hoverPopover?.hoverEl;return e?.isConnected&&Number(getComputedStyle(e).opacity)>.99&&e.querySelector('.metadata-container')&&e.textContent.includes('Comprobar los enlaces.')});return true;");
  shot('card-hover-preview');
  state("q.card(q.a).querySelector('.jsp-card-menu').click();return true;");
  state("const item=[...document.querySelectorAll('.menu-item')].find(el=>el.textContent.includes('Remove note from planner'));assert(item,'Removal action missing');item.click();await wait(()=>document.querySelector('.jsp-membership-modal .mod-cta'));return true;");
  shot('remove-from-planner');
  escape();
  state("await wait(()=>!document.querySelector('.jsp-membership-modal'));for(const [name,text]of q.notes)assert(await app.vault.read(q.p.file(name))===text,'Capture changed a note');return true;");
} finally {
  try {
    console.log(evaluate(String.raw`const q=window.__jspCardCapture;if(!q)return 'No capture session';q.s?.closeHoverPreview();if(document.querySelector('.jsp-membership-modal')){const button=[...document.querySelectorAll('.jsp-membership-modal button')].find(el=>el.textContent==='Cancel');button?.click()}q.leaf?.detach();for(const [name]of q.notes){const file=app.vault.getAbstractFileByPath(name);if(file)await app.fileManager.processFrontMatter(file,fm=>{fm.planner_type='qa-archived'})}await app.workspace.changeLayout(q.layout);if(await app.vault.adapter.read(q.settingsPath)!==q.settings)throw Error('Settings changed');return true;`));
  } finally { run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":false}'); }
  const after = inventory();
  const changed = [...before].filter(([name, hash]) => after.get(name) !== hash).map(([name]) => name);
  if (changed.length) throw Error('Original Markdown changed: ' + changed.join(', '));
}
const errors = run('dev:errors'); if (!errors.includes('No errors captured.')) throw Error(errors);
console.log('Native screenshots captured; original Markdown/settings unchanged; workspace restored; capture fixtures archived.');
