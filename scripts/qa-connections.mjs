import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const cli = 'C:\\Program Files\\Obsidian\\Obsidian.com';
const canonical = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../@Nexus-dev');
function run(...args) {
  const output = execFileSync(cli, ['vault=@Nexus-dev', ...args], { encoding: 'utf8', timeout: 20000, windowsHide: true }).trim();
  if (/^Error:/m.test(output)) throw Error(output);
  return output;
}
if (run('vault', 'info=path') !== canonical) throw Error('Wrong vault.');
const guard = `if(app.vault.adapter.getBasePath()!==${JSON.stringify(canonical)})throw Error('Wrong vault');`;
function evaluate(code) { return run('eval', `code=(async()=>{${guard}${code}})()`); }
function state(code) {
  const output = evaluate(`const q=window.__jspConnectionsQA;const {p,view,viewport,assert,wait}=q;${code}`);
  if (!output.startsWith('=>')) throw Error(`No evaluation result: ${output}`);
  return output;
}
function json(code) { return JSON.parse(state(`return JSON.stringify(${code});`).slice(2).trim()); }
function mouse(type, point, pressed = false) {
  return run('dev:cdp', 'method=Input.dispatchMouseEvent', `params=${JSON.stringify({ type, x: point.x, y: point.y, ...(type === 'mouseMoved' && !pressed ? {} : { button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }) })}`);
}
function escape() {
  for (const type of ['keyDown', 'keyUp']) run('dev:cdp', 'method=Input.dispatchKeyEvent', `params=${JSON.stringify({ type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })}`);
}
const passed = [];
function check(name, code) { const output = state(`${code}return 'PASS';`); if (!output.includes('PASS')) throw Error(`${name}: ${output}`); passed.push(name); console.log(`PASS ${name}`); }
function dragTo(destination) {
  const points = json('q.points()');
  mouse('mouseMoved', points.hover);
  mouse('mousePressed', points.start);
  mouse('mouseMoved', destination ?? points.target, true);
  return points;
}

try {
  run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":true}');
  const setup = evaluate(`const p=app.plugins.getPlugin('just-simple-planner');if(!p)throw Error('Planner not loaded');await p.openPlanner();const view=app.workspace.getLeavesOfType('just-simple-planner')[0].view;const viewport=view.contentEl.querySelector('.jsp-scroll');const original={state:view.getState(),search:view.search,status:view.status,tasks:view.showTasks,left:viewport.scrollLeft,top:viewport.scrollTop};view.mode='board';view.collapsed=new Set();view.search='';view.status='all';view.showTasks=false;view.firstDay='2026-10-01';view.initialScroll=false;view.render();const source=[...p.entries.values()].find(e=>e.title==='Preparar los ejemplos del taller');const target=[...p.entries.values()].find(e=>e.title==='Preparar la estructura del artículo');if(!source||!target||!source.path.startsWith('Pruebas/Just Simple Planner/Entradas/')||!target.path.startsWith('Pruebas/Just Simple Planner/Entradas/'))throw Error('Named fixtures not found');if(source.next.includes(target.path))throw Error('Fixtures already connected; preserving them');const before=new Map();for(const entry of p.entries.values())before.set(entry.path,await app.vault.read(p.file(entry.path)));const q={p,view,viewport,source,target,before,original,commits:0,count:p.entries.size};q.assert=(value,message)=>{if(!value)throw Error(message)};q.wait=async(fn)=>{for(let i=0;i<120;i++){if(fn())return;await new Promise(r=>setTimeout(r,25))}throw Error('Timed out waiting for connection')};q.card=entry=>[...view.contentEl.querySelectorAll('.jsp-card')].find(c=>c.dataset.path===entry.path);q.points=()=>{const card=q.card(source);const a=card.getBoundingClientRect(),h=card.querySelector('.jsp-connection-handle').getBoundingClientRect(),b=q.card(target).getBoundingClientRect();return {hover:{x:a.left+a.width/2,y:a.top+a.height/2},start:{x:h.left+h.width/2,y:h.top+h.height/2},target:{x:b.left+b.width/2,y:b.top+b.height/2},blank:{x:a.left+a.width/2,y:a.bottom+20}}};window.__jspConnectionsQA=q;viewport.scrollLeft=27*p.settings.dayWidth;viewport.scrollTop=0;return 'READY';`);
  if (!setup.includes('READY')) throw Error(`Setup failed: ${setup}`);

  const points = json('q.points()');
  mouse('mouseMoved', points.hover);
  check('real mouse hover reveals the card connector', `const handle=q.card(q.source).querySelector('.jsp-connection-handle');assert(Number(getComputedStyle(handle).opacity)>.9,'Connector did not appear on hover');assert(getComputedStyle(handle).pointerEvents!=='none','Connector cannot receive input');`);

  dragTo();
  check('dragging previews an arrow and highlights the cross-thread target', `assert(view.linking?.target===q.target.path,'Destination not detected under captured pointer');assert(view.contentEl.querySelector('.jsp-preview-line.has-target'),'Live preview missing');assert(q.card(q.target).classList.contains('is-connection-target'),'Target not highlighted');assert(!view.dragging&&!view.panning,'Connection interfered with card drag or pan');`);
  run('dev:screenshot', `path=${path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../qa/conexion-arrastrando.png')}`);
  mouse('mouseReleased', json('q.points().target'));
  check('dropping creates the wikilink without moving either note', `await wait(()=>p.entries.get(q.source.path).next.includes(q.target.path)&&!p.history.busy);q.commits++;assert((await app.vault.read(p.file(q.source.path))).includes(p.link(q.target.path)),'Wikilink not saved');assert(p.entries.get(q.source.path).date===q.source.date&&p.entries.get(q.target.path).date===q.target.date,'Connection moved a date');assert(!view.linking&&!view.contentEl.querySelector('.jsp-connection-preview'),'Preview was not cleared');`);

  state(`q.depth=p.history.undoStack.length;return 'READY';`);
  dragTo(); mouse('mouseReleased', json('q.points().target'));
  check('repeated drops do not duplicate links or history', `assert(p.entries.get(q.source.path).next.filter(path=>path===q.target.path).length===1,'Duplicate connection');assert(p.history.undoStack.length===q.depth,'Duplicate drop created history');`);

  state(`q.card(q.source).querySelector('.jsp-card-menu').click();return 'OPEN';`);
  check('the three-dot menu retains Connect to and Disconnect', `const menu=document.querySelector('.menu');assert(menu?.textContent.includes('Connect to'),'Connect to disappeared');assert(menu.textContent.includes('Disconnect'),'Disconnect disappeared');`);
  escape();

  state(`await wait(()=>[...view.contentEl.querySelectorAll('.jsp-connection')].some(g=>g.dataset.source===q.source.path&&g.dataset.target===q.target.path));return 'READY';`);
  const edgePoint = json(`(()=>{const group=[...view.contentEl.querySelectorAll('.jsp-connection')].find(g=>g.dataset.source===q.source.path&&g.dataset.target===q.target.path);assert(group,'Permanent line missing');const curve=group.querySelector('.jsp-edge');const point=curve.getPointAtLength(curve.getTotalLength()/2);const rect=view.stage.getBoundingClientRect();return {x:rect.left+point.x,y:rect.top+point.y};})()`);
  mouse('mouseMoved', edgePoint);
  check('hovering the actual line reveals its disconnect widget', `const group=[...view.contentEl.querySelectorAll('.jsp-connection')].find(g=>g.dataset.source===q.source.path&&g.dataset.target===q.target.path);const remove=group.querySelector('.jsp-edge-remove');assert(Number(getComputedStyle(remove).opacity)>.9,'Disconnect widget did not appear');assert(getComputedStyle(remove).pointerEvents!=='none','Disconnect widget is not clickable');assert([...view.contentEl.querySelectorAll('.jsp-edges [aria-label]')].every(el=>typeof el.isShown==='function'),'Tooltip owner is not supported by Obsidian');`);
  run('dev:screenshot', `path=${path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../qa/desconexion.png')}`);
  mouse('mousePressed', edgePoint); mouse('mouseReleased', edgePoint);
  check('clicking the line widget disconnects and supports undo', `await wait(()=>!p.entries.get(q.source.path).next.includes(q.target.path)&&!p.history.busy);q.commits++;await p.history.undo();q.commits--;assert(p.entries.get(q.source.path).next.includes(q.target.path),'Disconnect undo failed');await p.history.undo();q.commits--;assert(await app.vault.read(p.file(q.source.path))===q.before.get(q.source.path),'Connection undo did not restore exact source');`);

  const blank = json('q.points().blank');
  dragTo(blank); mouse('mouseReleased', blank);
  check('dropping on empty space cancels without creating a note', `assert(!view.linking&&!view.contentEl.querySelector('.jsp-connection-preview'),'Blank drop left preview');assert(p.entries.size===q.count,'Blank drop created a note');assert(await app.vault.read(p.file(q.source.path))===q.before.get(q.source.path),'Blank drop changed source');`);

  dragTo(); escape(); mouse('mouseReleased', json('q.points().target'));
  check('Escape cancels a valid-looking connection', `assert(!view.linking&&!view.contentEl.querySelector('.jsp-connection-preview'),'Escape did not cancel');assert(!p.entries.get(q.source.path).next.includes(q.target.path),'Escape saved a connection');`);

  const self = json('q.points().hover'); dragTo(self); mouse('mouseReleased', self);
  check('a card cannot connect to itself', `assert(!p.entries.get(q.source.path).next.includes(q.source.path),'Self-link created');assert(await app.vault.read(p.file(q.source.path))===q.before.get(q.source.path),'Self-drop changed the note');`);

  const edge = json(`(()=>{q.edgeStart=viewport.scrollLeft;const rect=viewport.getBoundingClientRect();return {x:rect.right-24,y:rect.top+150};})()`);
  dragTo(edge);
  check('the board autoscrolls near the edge while connecting', `await wait(()=>viewport.scrollLeft>q.edgeStart);assert(view.linking&&view.contentEl.querySelector('.jsp-connection-preview'),'Edge scroll lost the connection gesture');`);
  escape(); mouse('mouseReleased', { x: 700, y: 400 });
  state(`viewport.scrollLeft=q.edgeStart;return 'RESTORED';`);
  check('pointer cancellation clears the gesture without writes', `const handle=q.card(q.source).querySelector('.jsp-connection-handle');const rect=handle.getBoundingClientRect();handle.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:99,pointerType:'mouse',isPrimary:true,button:0,clientX:rect.left+11,clientY:rect.top+11}));assert(view.linking,'Synthetic cancellation gesture did not start');viewport.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:99}));assert(!view.linking&&!view.contentEl.querySelector('.jsp-connection-preview'),'Pointer cancel did not clean up');assert(await app.vault.read(p.file(q.source.path))===q.before.get(q.source.path),'Cancellation wrote the note');`);

  state(`const handle=q.card(q.source).querySelector('.jsp-connection-handle');handle.focus();handle.click();return 'OPEN';`);
  check('keyboard-accessible connector still opens the target picker', `assert([...document.querySelectorAll('input')].some(input=>input.placeholder==='Connect to an entry…'),'Target picker missing');`);
  escape();
  check('the fixture set and exact Markdown contents are preserved', `for(const [file,text] of q.before)assert(await app.vault.read(p.file(file))===text,'Changed fixture: '+file);assert(p.entries.size===q.count,'Entry count changed');`);
  const errors = run('dev:errors');
  if (!errors.includes('No errors captured.')) throw Error(`Obsidian errors during connection test: ${errors}`);
  passed.push('no Obsidian errors during hover, drag and disconnect');
  console.log('PASS no Obsidian errors during hover, drag and disconnect');
  console.log(JSON.stringify({ vault: canonical, checks: passed.length, passed }, null, 2));
} finally {
  run('dev:cdp', 'method=Input.dispatchMouseEvent', 'params={"type":"mouseReleased","x":700,"y":400,"button":"left","buttons":0}');
  console.log(evaluate(`const q=window.__jspConnectionsQA;if(q){q.view.finishConnection(false);while(q.commits>0){await q.p.history.undo();q.commits--}const s=q.original;q.view.mode=s.state.mode;q.view.firstDay=s.state.firstDay;q.view.collapsed=new Set(s.state.collapsed);q.view.activeThread=s.state.activeThread;q.view.search=s.search;q.view.status=s.status;q.view.showTasks=s.tasks;q.view.initialScroll=false;q.view.render();q.viewport.scrollLeft=s.left;q.viewport.scrollTop=s.top;delete window.__jspConnectionsQA;}return 'Connection test state restored';`));
  run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":false}');
}
