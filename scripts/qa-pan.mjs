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
const passed = [];
function check(name, code) {
  const output = evaluate(`const q=window.__justSimplePlannerPanQA;const {p,view,viewport,pointer,assert,near}=q;${code}return 'PASS';`);
  if (!output.includes('PASS')) throw Error(`${name}: incomplete result: ${output}`);
  passed.push(name); console.log(`PASS ${name}`);
}
try {
  const setup = evaluate(`const p=app.plugins.getPlugin('just-simple-planner');if(!p)throw Error('Planner is not loaded');await p.openPlanner();document.querySelector('[aria-label="Switch to board"]')?.click();const view=app.workspace.getLeavesOfType('just-simple-planner')[0].view;const viewport=view.contentEl.querySelector('.jsp-scroll');const before=new Map();for(const entry of p.entries.values())before.set(entry.path,await app.vault.read(p.file(entry.path)));const q={p,view,viewport,before,original:{height:viewport.style.maxHeight,left:viewport.scrollLeft,top:viewport.scrollTop},activeId:null,moved:false};q.assert=(ok,message)=>{if(!ok)throw Error(message)};q.near=(a,b)=>Math.abs(a-b)<1;q.pointer=(target,type,x,y,id=71,button=1)=>{if(type==='pointerdown')q.activeId=id;const event=new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'mouse',isPrimary:true,button,buttons:type==='pointerup'?0:button===1?4:1,clientX:x,clientY:y});target.dispatchEvent(event);if(type==='pointerup'||type==='pointercancel'||type==='lostpointercapture')q.activeId=null;return event};window.__justSimplePlannerPanQA=q;viewport.style.maxHeight='320px';viewport.scrollTop=80;q.assert(viewport.scrollTop>40,'Need vertical scroll room');return 'READY';`);
  if (!setup.includes('READY')) throw Error(`Setup did not complete: ${setup}`);
  check('middle-drag right/down follows the hand', `const left=viewport.scrollLeft,top=viewport.scrollTop;const down=pointer(viewport,'pointerdown',700,250);assert(down.defaultPrevented&&view.panning,'Middle-down did not start pan');pointer(viewport,'pointermove',760,275);pointer(viewport,'pointerup',760,275);assert(near(viewport.scrollLeft,left-60)&&near(viewport.scrollTop,top-25),'Wrong pan direction');assert(!view.panning,'Pan did not finish');`);
  check('reverse pan over a card does not reschedule', `const left=viewport.scrollLeft,top=viewport.scrollTop;pointer(viewport.querySelector('.jsp-card'),'pointerdown',700,250,72);pointer(viewport,'pointermove',650,225,72);pointer(viewport,'pointerup',650,225,72);assert(near(viewport.scrollLeft,left+50)&&near(viewport.scrollTop,top+25),'Reverse/card pan failed');assert(!view.dragging,'Pan started rescheduling');`);
  check('cancel, lost capture and left-button exclusion', `pointer(viewport,'pointerdown',700,250,73);pointer(viewport,'pointercancel',700,250,73);assert(!view.panning,'Cancel failed');pointer(viewport,'pointerdown',700,250,74);pointer(viewport,'lostpointercapture',700,250,74);assert(!view.panning,'Lost capture failed');pointer(viewport,'pointerdown',700,250,75,0);assert(!view.panning,'Left button started pan');pointer(viewport,'pointerup',700,250,75,0);`);
  check('native middle-button defaults are prevented', `for(const type of ['mousedown','auxclick']){const event=new MouseEvent(type,{bubbles:true,cancelable:true,button:1});viewport.dispatchEvent(event);assert(event.defaultPrevented,'Native default: '+type)}`);
  check('Shift-wheel matches Visual Card Writer', `const left=viewport.scrollLeft;const wheel=new WheelEvent('wheel',{bubbles:true,cancelable:true,shiftKey:true,deltaY:60});viewport.dispatchEvent(wheel);assert(wheel.defaultPrevented&&near(viewport.scrollLeft,left+60),'Wrong wheel direction');const after=viewport.scrollLeft;viewport.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,shiftKey:true,deltaY:-2,deltaMode:1}));assert(near(viewport.scrollLeft,after-80),'Line normalization failed');`);
  check('card drag to the right advances one day and undoes', `const source=[...p.entries.values()].find(e=>e.path.startsWith('Pruebas/Just Simple Planner/Entradas/')&&[...viewport.querySelectorAll('.jsp-card')].some(c=>c.dataset.path===e.path));assert(source,'No named fixture');const element=[...viewport.querySelectorAll('.jsp-card')].find(c=>c.dataset.path===source.path);const lane=[...viewport.querySelectorAll('.jsp-lane')].find(l=>l.dataset.thread===source.thread);const transfer=new DataTransfer();element.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));assert(view.dragging&&!view.panning,'Drag/pan conflict');const day=new Date(source.date+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+1);const next=day.toISOString().slice(0,10);const index=Math.round((Date.parse(next+'T12:00:00Z')-Date.parse(view.firstDay+'T12:00:00Z'))/86400000);const x=lane.getBoundingClientRect().left+(index+.5)*p.settings.dayWidth;lane.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer,clientX:x,clientY:lane.getBoundingClientRect().top+30}));for(let i=0;i<100&&(p.entries.get(source.path).date!==next||p.history.busy);i++)await new Promise(r=>setTimeout(r,25));assert(p.entries.get(source.path).date===next,'Rightward drop did not advance');q.moved=true;await p.history.undo();q.moved=false;`);
  check('source Markdown remains byte-for-byte unchanged', `for(const [file,text] of q.before)assert(await app.vault.read(p.file(file))===text,'Changed note: '+file);`);
  console.log(JSON.stringify({ vault: canonical, checks: passed.length, passed }, null, 2));
} finally {
  console.log(evaluate(`const q=window.__justSimplePlannerPanQA;if(q){if(q.activeId!==null)q.pointer(q.viewport,'pointercancel',0,0,q.activeId);if(q.moved)await q.p.history.undo();q.viewport.style.maxHeight=q.original.height;q.viewport.scrollLeft=q.original.left;q.viewport.scrollTop=q.original.top;q.p.refresh();delete window.__justSimplePlannerPanQA;}return 'Pan test layout restored';`));
}
