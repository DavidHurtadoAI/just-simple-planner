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
  const output = evaluate(`const q=window.__jspModifierPanQA;const {p,v,viewport,assert,near}=q;${code}`);
  if (!output.startsWith('=>')) throw Error(output);
  return output.slice(2).trim();
}
function json(code) { return JSON.parse(state(`return JSON.stringify(${code});`)); }
function mouse(type, point, modifiers = 0) {
  run('dev:cdp', 'method=Input.dispatchMouseEvent', `params=${JSON.stringify({ type, ...point, modifiers, button: 'left', buttons: type === 'mouseReleased' ? 0 : type === 'mousePressed' ? 1 : held ? 1 : 0, clickCount: 1 })}`);
  if (type === 'mousePressed') held = true;
  if (type === 'mouseReleased') held = false;
}
function escape() {
  for (const type of ['keyDown', 'keyUp']) run('dev:cdp', 'method=Input.dispatchKeyEvent', `params=${JSON.stringify({ type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })}`);
}
const passed = [];
let held = false;
let point = { x: 0, y: 0 };
function check(name, code) {
  if (state(`${code}return 'PASS';`) !== 'PASS') throw Error(name);
  passed.push(name); console.log(`PASS ${name}`);
}
function press(modifiers) {
  point = json('q.point()'); mouse('mouseMoved', point, modifiers); mouse('mousePressed', point, modifiers);
}
function move(dx, dy, modifiers) {
  point = { x: point.x + dx, y: point.y + dy }; mouse('mouseMoved', point, modifiers);
}
try {
  run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":true}');
  evaluate(`const p=app.plugins.getPlugin('just-simple-planner');if(!p)throw Error('Planner not loaded');await p.openPlanner();const v=app.workspace.getLeavesOfType('just-simple-planner')[0].view,viewport=v.contentEl.querySelector('.jsp-scroll');const q={p,v,viewport,original:{state:v.getState(),search:v.search,status:v.status,tasks:v.showTasks,selected:[...v.selected],height:viewport.style.maxHeight,left:viewport.scrollLeft,top:viewport.scrollTop},before:new Map()};q.assert=(ok,msg)=>{if(!ok)throw Error(msg)};q.near=(a,b)=>Math.abs(a-b)<1;window.__jspModifierPanQA=q;for(const entry of p.entries.values())q.before.set(entry.path,await app.vault.read(p.file(entry.path)));v.mode='board';v.search='';v.status='all';v.showTasks=false;v.collapsed=new Set();v.firstDay='2026-10-01';v.initialScroll=false;v.selected.clear();v.render();viewport.style.maxHeight='320px';viewport.scrollLeft=27*p.settings.dayWidth;viewport.scrollTop=80;q.source=[...p.entries.values()].find(e=>e.title==='Preparar los ejemplos del taller');if(!q.source?.path.startsWith('Pruebas/Just Simple Planner/Entradas/'))throw Error('Named fixture missing');q.card=()=>v.renderedCards.get(q.source.path);q.point=()=>{const r=q.card().getBoundingClientRect(),s=viewport.getBoundingClientRect();return {x:r.left+r.width*.45,y:Math.max(r.top+70,s.top+95)}};q.snapshot=()=>{q.left=viewport.scrollLeft;q.top=viewport.scrollTop;q.selection=[...v.selected].sort().join('|')};return 'READY';`);

  press(2); mouse('mouseReleased', point, 2);
  check('trusted Ctrl-click still selects a card', `assert(v.selected.has(q.source.path),'Ctrl-click lost its card target');`);
  state(`q.snapshot();return 'READY';`);
  press(2); move(2, 1, 2); mouse('mouseReleased', point, 2);
  check('small pointer jitter remains a selection click', `assert(!v.selected.has(q.source.path),'Click did not toggle selection');assert(near(viewport.scrollLeft,q.left)&&near(viewport.scrollTop,q.top),'Small jitter panned');`);

  press(4); mouse('mouseReleased', point, 4);
  check('trusted Cmd-click still selects a card', `assert(v.selected.has(q.source.path),'Cmd-click selection failed');`);
  for (const [modifier, name, dx, dy] of [[2, 'Ctrl', 45, 20], [4, 'Cmd', -35, -15]]) {
    state(`q.snapshot();return 'READY';`);
    press(modifier); move(dx, dy, modifier);
    check(`${name}-drag pans over a card without starting a card move`, `assert(v.panning&&!v.dragging&&!v.linking,'Gesture conflict');assert(near(viewport.scrollLeft,q.left-(${dx}))&&near(viewport.scrollTop,q.top-(${dy})),'Wrong direction');`);
    mouse('mouseReleased', point, modifier);
    check(`${name}-drag release preserves selection and clears capture`, `assert(!v.panning&&!viewport.classList.contains('is-panning'),'Pan stuck');assert([...v.selected].sort().join('|')===q.selection,'Pan click changed selection');`);
  }
  // A later click must not be swallowed by suppression of the pan-release click.
  press(2); mouse('mouseReleased', point, 2);
  check('the click after a completed pan is not swallowed', `assert(!v.selected.has(q.source.path),'Next click was suppressed');`);

  state(`q.snapshot();return 'READY';`);
  press(2); move(30, -10, 0); mouse('mouseReleased', point, 0);
  check('releasing the modifier during a gesture still finishes the pan', `assert(!v.panning&&!v.dragging,'Released modifier left a gesture active');assert(near(viewport.scrollLeft,q.left-30)&&near(viewport.scrollTop,q.top+10),'Modifier release interrupted movement');`);

  state(`q.snapshot();return 'READY';`);
  point = json(`(()=>{const point=q.point();return {x:point.x+p.settings.dayWidth,y:point.y}})()`);
  mouse('mouseMoved', point, 2); mouse('mousePressed', point, 2); move(35, -15, 2); mouse('mouseReleased', point, 2);
  check('Ctrl-drag also pans from empty day space', `assert(!v.panning&&!v.dragging,'Blank-space pan stuck');assert(near(viewport.scrollLeft,q.left-35)&&near(viewport.scrollTop,q.top+15),'Blank-space pan failed');`);

  state(`viewport.scrollTop=0;return 'READY';`);
  const menu = json(`(()=>{const r=q.card().querySelector('.jsp-card-menu').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  point = menu; mouse('mouseMoved', point, 2); mouse('mousePressed', point, 2); mouse('mouseReleased', point, 2);
  check('Ctrl-click on a card button keeps its normal action', `assert(!v.panning&&document.querySelector('.menu')?.textContent.includes('Connect to'),'Entry button was intercepted');`);
  escape();

  press(2);
  state(`v.root.win.dispatchEvent(new Event('blur'));return 'BLURRED';`);
  mouse('mouseReleased', point, 2);
  check('losing window focus cancels a pending pan', `assert(!v.panning&&!viewport.classList.contains('is-panning'),'Blur left pending pan active');`);
  check('the gesture never writes source Markdown', `for(const [file,text]of q.before)assert(await app.vault.read(p.file(file))===text,'Changed note: '+file);`);
  if (!run('dev:errors').includes('No errors captured.')) throw Error('Obsidian captured errors.');
  console.log(JSON.stringify({ vault: canonical, checks: passed.length, passed }, null, 2));
} finally {
  if (held) mouse('mouseReleased', point);
  escape();
  console.log(evaluate(`const q=window.__jspModifierPanQA;if(q){q.v.root.win.dispatchEvent(new Event('blur'));const s=q.original;q.v.search=s.search;q.v.status=s.status;q.v.showTasks=s.tasks;q.v.selected=new Set(s.selected);q.viewport.style.maxHeight=s.height;await q.v.setState(s.state);q.viewport.scrollLeft=s.left;q.viewport.scrollTop=s.top;delete window.__jspModifierPanQA;}return 'Original planner view restored';`));
  run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":false}');
}
