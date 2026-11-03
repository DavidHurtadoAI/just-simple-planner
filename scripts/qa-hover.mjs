import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startPreviewDiagnostics, stopPreviewDiagnostics, verifyNativeErrors } from './qa-preview-diagnostics.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = path.resolve(repo, '../../@Nexus-dev');
const cli = 'C:\\Program Files\\Obsidian\\Obsidian.com';
function run(...args) {
  const out = execFileSync(cli, ['vault=@Nexus-dev', ...args], { encoding: 'utf8', timeout: 25000, windowsHide: true }).trim();
  if (/^Error:/m.test(out)) throw Error(out);
  return out;
}
function evaluate(code) {
  const out = run('eval', 'code=(async()=>{if(app.vault.adapter.getBasePath()!==' + JSON.stringify(canonical) + ')throw Error("Wrong vault");' + code + '})()');
  const start = out.indexOf('=>'); if (start < 0) throw Error('No evaluation result: ' + out);
  return out.slice(start + 2).trim();
}
function state(code) { return evaluate('const q=window.__jspHoverQA;const {assert,wait}=q;q.step=' + JSON.stringify(code.slice(0,160)) + ';' + code); }
function move(point) { run('dev:cdp', 'method=Input.dispatchMouseEvent', 'params=' + JSON.stringify({ type: 'mouseMoved', ...point, buttons: 0, modifiers: 0 })); }
function hover(name, date) {
  state('q.s.closeHoverPreview();return true;');
  move({ x: 12, y: 75 });
  const point = JSON.parse(state('return JSON.stringify(q.point(q[' + JSON.stringify(name) + '],' + JSON.stringify(date ?? null) + '));'));
  move(point);
}
function escape() { for (const type of ['keyDown', 'keyUp']) run('dev:cdp', 'method=Input.dispatchKeyEvent', 'params=' + JSON.stringify({ type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })); }
const passed = [];
function check(name, code) { if (state(code + "return 'PASS';") !== 'PASS') throw Error(name); passed.push(name); console.log('PASS ' + name); }
run('dev:debug', 'on'); run('dev:errors', 'clear');
run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":true}');
startPreviewDiagnostics(evaluate);
try {
  evaluate(String.raw`
    const p=app.plugins.getPlugin('just-simple-planner');if(!p)throw Error('Planner unavailable');if(!app.internalPlugins.getPluginById('page-preview')?.enabled)throw Error('Enable the Page preview core plugin before this suite');
    const assert=(ok,msg)=>{if(!ok)throw Error(msg)},wait=async(fn)=>{for(let i=0;i<240;i++){if(fn())return;await new Promise(r=>setTimeout(r,25))}throw Error('Timed out')};
    const q=window.__jspHoverQA={p,assert,wait,layout:app.workspace.getLayout(),folder:'Pruebas/Just Simple Planner/Previsualización QA/'+Date.now(),leaves:[],notes:[],events:[],before:new Map()};
    q.errors=[];q.onError=event=>q.errors.push({message:event.message,step:q.step,mode:q.s?.mode,popover:!!q.s?.hoverPopover});window.addEventListener('error',q.onError);
    await p.reloadIndex();for(const item of [...p.entries.values(),...p.threads.values()])q.before.set(item.path,await app.vault.read(p.file(item.path)));p.classicViewClosed();
    q.settingsPath=app.vault.configDir+'/plugins/just-simple-planner/data.json';q.settings=await app.vault.adapter.read(q.settingsPath);
    let folder='';for(const part of q.folder.split('/')){folder=folder?folder+'/'+part:part;if(!app.vault.getAbstractFileByPath(folder))await app.vault.createFolder(folder)}
    q.thread=q.folder+'/Hilo de previsualización QA.md';q.a=q.folder+'/Nota completa QA.md';q.b=q.folder+'/Nota arrastrable QA.md';q.target=q.folder+'/Destino del enlace QA.md';q.link=name=>'[['+name.slice(0,-3)+']]';
    q.notes=[[q.thread,'---\nplanner_type: thread\ncolor: cyan\norder: -100\n---\n'],[q.a,'---\nplanner_type: entry\ntitle: Nota completa QA\ndate: 2026-11-03\nthread: "'+q.link(q.thread)+'"\nrepeat: weekly\nrepeat_until: 2026-11-17\nproject: Proyecto de previsualización QA\n---\nInicio de la nota.\n\n'+q.link(q.target)+'\n\nContenido completo que aparece en la ventana nativa.\n\n- [ ] Una tarea de la nota.\n\nFinal del contenido de previsualización QA.\n'],[q.b,'---\nplanner_type: entry\ntitle: Nota arrastrable QA\ndate: 2026-11-04\nthread: "'+q.link(q.thread)+'"\n---\nContenido arrastrable QA.\n'],[q.target,'---\nplanner_type: entry\ntitle: Destino del enlace QA\ndate: 2026-11-05\nthread: "'+q.link(q.thread)+'"\n---\nContenido del destino del enlace QA.\n']];
    for(const [name,text]of q.notes)await app.vault.create(name,text);await wait(()=>q.notes.every(([name])=>app.metadataCache.getCache(name)?.frontmatter));
    q.ref=app.workspace.on('hover-link',value=>{if(value.source==='just-simple-planner')q.events.push(value)});return 'FIXTURES';
  `);
  state(String.raw`
    const doc={filters:{and:['file.ext == "md"','file.inFolder('+JSON.stringify(q.folder)+')','note.planner_type != "qa-archived"']},views:[{type:'just-simple-planner-bases',name:'Planner',dateProperty:'note.date',titleProperty:'note.title',threadProperty:'note.thread',nextProperty:'note.next',repeatProperty:'note.repeat',repeatUntilProperty:'note.repeat_until',dayWidth:'140',plannerState:{mode:'board',firstDay:'2026-10-04',scrollLeft:4200,scrollTop:0}}]};
    q.base=await app.vault.create(q.folder+'/Planner de previsualización QA.base',JSON.stringify(doc,null,2));q.leaf=app.workspace.getLeaf('tab');q.leaves.push(q.leaf);await q.leaf.openFile(q.base);await wait(()=>q.leaf.view.controller?.view?.session.entries.has(q.a));q.s=q.leaf.view.controller.view.surface;
    q.show=async leaf=>{await app.workspace.revealLeaf(leaf);app.workspace.setActiveLeaf(leaf,{focus:true});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))};
    q.board=async()=>{q.s.closeHoverPreview();await q.show(q.leaf);q.s=q.leaf.view.controller.view.surface;await q.s.setState({mode:'board',firstDay:'2026-10-04',scrollLeft:4200,scrollTop:0,activeThread:q.thread,collapsed:[],search:'',status:'all',showTasks:false});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))};
    q.card=(name,date)=>[...q.s.contentEl.querySelectorAll('.jsp-card')].find(c=>c.dataset.path===name&&(!date||c.dataset.date===date));
    q.point=(name,date)=>{const card=q.card(name,date);assert(card,'Card missing');const r=card.querySelector('.jsp-card-heading strong').getBoundingClientRect(),point={x:r.left+Math.min(12,r.width/2),y:r.top+Math.min(8,r.height/2)};assert(document.elementFromPoint(point.x,point.y)?.closest('.jsp-card')===card,'Card not visible at pointer');return point};
    q.preview=()=>q.s.hoverPopover?.hoverEl;q.ready=async text=>{await wait(()=>{const e=q.preview();return e?.isConnected&&Number(getComputedStyle(e).opacity)>.9&&getComputedStyle(e).visibility==='visible'&&e.getBoundingClientRect().height>100&&e.textContent.includes(text)}).catch(()=>{const p=q.s.hoverPopover,e=q.preview();throw Error('Preview not visible: '+JSON.stringify({expected:text,state:p?.state,onTarget:p?.onTarget,onHover:p?.onHover,loaded:p?._loaded,opacity:e?getComputedStyle(e).opacity:null,source:q.events.at(-1)?.linktext,text:e?.textContent.slice(0,700)}))});assert(q.events.at(-1)?.event.ctrlKey===false&&q.events.at(-1)?.event.metaKey===false,'Preview required a modifier')};
    await q.board();return 'READY';
  `);
  hover('a');
  check('plain pointer hover opens a native Bases note preview with properties and full Markdown', String.raw`await q.ready('Final del contenido de previsualización QA.');assert(q.preview().querySelector('.metadata-container'),'Native properties missing');assert(q.preview().textContent.includes('Proyecto de previsualización QA'),'Property value missing');assert(q.events.at(-1).event.isTrusted,'Pointer was not trusted');`);
  run('dev:screenshot', 'path=' + path.join(repo, 'qa/hover-preview.png'));
  check('moving inside a card does not retrigger it and buttons/links keep their hover actions', String.raw`const card=q.card(q.a),title=card.querySelector('strong'),body=card.querySelector('.jsp-card-body'),button=card.querySelector('button'),link=card.querySelector('a.internal-link'),before=q.events.length;assert(link,'Markdown link missing');body.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,relatedTarget:title}));button.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,relatedTarget:q.s.root}));link.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,relatedTarget:q.s.root}));assert(q.events.length===before,'Card hijacked a child hover');title.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,relatedTarget:button}));assert(q.events.length===before+1,'Moving from a button to the title did not preview');const count=q.events.length;card.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,relatedTarget:q.s.root,buttons:1}));assert(q.events.length===count,'Held-button hover started a preview');`);
  // Put this long Notebook card near the top so the native 400px popup fits.
  state(String.raw`q.s.closeHoverPreview();await q.s.setState({mode:'notebook',activeThread:q.thread,scrollLeft:0,scrollTop:0,search:'',status:'all'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));q.s.scroll.scrollTop+=q.card(q.a).getBoundingClientRect().top-q.s.scroll.getBoundingClientRect().top-8;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true;`);
  hover('a');
  check('Notebook cards preview the same complete source without a modifier', String.raw`await q.ready('Final del contenido de previsualización QA.');assert(q.events.at(-1).linktext===q.a,'Notebook preview opened another file');`);
  state(String.raw`await q.board();q.s.collapsed.add(q.thread);q.s.render();return true;`);
  hover('a');
  check('folded cards still preview the complete note', String.raw`await q.ready('Final del contenido de previsualización QA.');assert(q.card(q.a).offsetHeight===24,'Thread is not folded');`);
  state(String.raw`await q.board();q.s.scroll.scrollLeft=37*140;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true;`);
  hover('a', '2026-11-10');
  check('a later repeated appearance previews its original source note', String.raw`await q.ready('Final del contenido de previsualización QA.');assert(q.events.at(-1).linktext===q.a&&q.events.at(-1).sourcePath===q.a,'Repeated appearance changed the source path');assert(q.card(q.a,'2026-11-10'),'Later appearance missing');`);
  state(String.raw`q.s.closeHoverPreview();const previous=app.workspace.getLeavesOfType('just-simple-planner');await q.p.openPlanner();const leaf=app.workspace.getLeavesOfType('just-simple-planner')[0];if(!previous.includes(leaf))q.leaves.push(leaf);await q.show(leaf);q.s=leaf.view.surface;await q.s.setState({mode:'board',firstDay:'2026-10-04',scrollLeft:4200,scrollTop:0,collapsed:[],activeThread:q.thread,search:'',status:'all',showTasks:false});q.s.scroll.scrollTop=0;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true;`);
  hover('a');
  check('the retained classic view also opens native previews on ordinary hover', String.raw`await q.ready('Final del contenido de previsualización QA.');assert(q.events.at(-1).linktext===q.a,'Classic source path changed');`);
  state(String.raw`await q.board();return true;`);
  hover('b');
  check('starting a card drag closes the preview and suppresses further hover requests', String.raw`await q.ready('Contenido arrastrable QA.');const popover=q.preview(),card=q.card(q.b),data=new DataTransfer();card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:data}));await wait(()=>!popover.isConnected).catch(()=>{throw Error('Preview still connected after close: '+JSON.stringify({parent:!!q.s.hoverPopover,dragging:!!q.s.dragging,panning:q.s.panning,linking:!!q.s.linking,opacity:getComputedStyle(popover).opacity,display:getComputedStyle(popover).display}))});assert(q.s.dragging&&!q.s.hoverPopover&&!popover.isConnected,'Drag left the preview open');const count=q.events.length;q.card(q.a).dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));assert(q.events.length===count,'Dragging emitted a hover request');card.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:data}));assert(!q.s.dragging,'Drag cancellation failed');`);
  hover('a');
  check('middle-button panning closes the preview without changing a note', String.raw`await q.ready('Final del contenido de previsualización QA.');const popover=q.preview();q.s.scroll.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:871,pointerType:'mouse',isPrimary:true,button:1,buttons:4,clientX:600,clientY:350}));await wait(()=>!popover.isConnected).catch(()=>{throw Error('Preview still connected after close: '+JSON.stringify({parent:!!q.s.hoverPopover,dragging:!!q.s.dragging,panning:q.s.panning,linking:!!q.s.linking,opacity:getComputedStyle(popover).opacity,display:getComputedStyle(popover).display}))});assert(q.s.panning&&!q.s.hoverPopover&&!popover.isConnected,'Pan left the preview open');const count=q.events.length;q.card(q.a).dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));assert(q.events.length===count,'Panning emitted a hover');q.s.scroll.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:871,pointerType:'mouse'}));assert(!q.s.panning,'Pan stuck');`);
  hover('a');
  check('starting a connection closes the preview and suppresses hover until cancellation', String.raw`await q.ready('Final del contenido de previsualización QA.');const popover=q.preview(),handle=q.card(q.a).querySelector('.jsp-connection-handle'),r=handle.getBoundingClientRect();handle.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:872,pointerType:'mouse',isPrimary:true,button:0,clientX:r.left+5,clientY:r.top+5}));await wait(()=>!popover.isConnected).catch(()=>{throw Error('Preview still connected after close: '+JSON.stringify({parent:!!q.s.hoverPopover,dragging:!!q.s.dragging,panning:q.s.panning,linking:!!q.s.linking,opacity:getComputedStyle(popover).opacity,display:getComputedStyle(popover).display}))});assert(q.s.linking&&!q.s.hoverPopover&&!popover.isConnected,'Connection left the preview open');const count=q.events.length;q.card(q.b).dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));assert(q.events.length===count,'Connection emitted a hover');q.s.scroll.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:872}));assert(!q.s.linking,'Connection stuck');`);
  hover('a');
  check('the card menu closes the preview and keeps the removal action', String.raw`await q.ready('Final del contenido de previsualización QA.');const popover=q.preview();q.card(q.a).querySelector('.jsp-card-menu').click();await wait(()=>!popover.isConnected).catch(()=>{throw Error('Preview still connected after close: '+JSON.stringify({parent:!!q.s.hoverPopover,dragging:!!q.s.dragging,panning:q.s.panning,linking:!!q.s.linking,opacity:getComputedStyle(popover).opacity,display:getComputedStyle(popover).display}))});assert(!q.s.hoverPopover&&!popover.isConnected,'Menu left the preview open');assert(document.querySelector('.menu')?.textContent.includes('Remove note from planner'),'Removal action lost');`);
  escape();
  hover('a');
  check('rebuilding cards closes the preview before removing its old anchor', String.raw`await q.ready('Final del contenido de previsualización QA.');const popover=q.preview(),card=q.card(q.a);q.s.render();assert(!popover.isConnected&&!q.s.hoverPopover,'Render retained a preview with a stale anchor');assert(!card.isConnected&&q.card(q.a)?.isConnected,'Cards were not rebuilt');`);
  hover('a');
  check('an asynchronous preview cannot reopen during a connection gesture', String.raw`q.s.closeHoverPreview();const card=q.card(q.a),handle=card.querySelector('.jsp-connection-handle'),r=handle.getBoundingClientRect();card.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,relatedTarget:q.s.root}));handle.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:873,pointerType:'mouse',isPrimary:true,button:0,clientX:r.left+5,clientY:r.top+5}));assert(q.s.linking,'Pending-preview connection did not start');await new Promise(r=>setTimeout(r,1200));assert(!q.s.hoverPopover&&!document.querySelector('.hover-popover'),'A late preview covered the active gesture');q.s.scroll.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:873}));assert(!q.s.linking,'Pending-preview connection stayed active');`);
  hover('a');
  check('closing the Base removes its preview and leaves all note bytes untouched', String.raw`await q.ready('Final del contenido de previsualización QA.');const surface=q.s,popover=q.preview();await q.leaf.detach();await wait(()=>!popover.isConnected).catch(()=>{throw Error('Preview still connected after close: '+JSON.stringify({parent:!!q.s.hoverPopover,dragging:!!q.s.dragging,panning:q.s.panning,linking:!!q.s.linking,opacity:getComputedStyle(popover).opacity,display:getComputedStyle(popover).display}))});assert(!surface.hoverPopover,'Closed view retained its preview');for(const [name,text]of q.notes)assert(await app.vault.read(q.p.file(name))===text,'Hover or gestures changed '+name);`);
} finally {
  try { console.log(evaluate(String.raw`const q=window.__jspHoverQA;if(!q)return 'CLEAN';q.s?.closeHoverPreview();if(q.ref)app.workspace.offref(q.ref);for(const leaf of q.leaves)leaf.detach();for(const [name]of q.notes){const file=app.vault.getAbstractFileByPath(name);if(file)await app.fileManager.processFrontMatter(file,fm=>{fm.planner_type='qa-archived'})}await app.workspace.changeLayout(q.layout);window.removeEventListener('error',q.onError);for(const [name,text]of q.before)q.assert(await app.vault.read(q.p.file(name))===text,'Original changed: '+name);q.assert(await app.vault.adapter.read(q.settingsPath)===q.settings,'Settings changed');return JSON.stringify({cleanup:'Original notes/settings preserved; workspace restored; fixtures archived',errors:q.errors});`)); }
  finally {
    try { stopPreviewDiagnostics(evaluate); }
    finally { run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":false}'); }
  }
}
const hostWarnings = verifyNativeErrors(run, evaluate, true);
if (hostWarnings.length) console.log('HOST WARNINGS ' + JSON.stringify(hostWarnings));
console.log(JSON.stringify({ vault: canonical, checks: passed.length, passed }, null, 2));
