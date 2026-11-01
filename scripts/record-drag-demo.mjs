// Maintainer-only recording tool. Requires desktop Obsidian with @Nexus-dev open.
// Captures real Chromium frames and an intercepted native explorer drag, using
// Obsidian's own drag payload. The pointer overlay is recording-only.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = path.resolve(repo, '../../@Nexus-dev');
const cli = 'C:\\Program Files\\Obsidian\\Obsidian.com';
const mode = process.argv[2] ?? 'prepare';
const sessionFile = path.join(repo, 'qa/drag-demo-session.log');
const fixture = 'Pruebas/Notas dispersas/Reunión con Aurora.md';
function run(...args) {
  const out = execFileSync(cli, ['vault=@Nexus-dev', ...args], { encoding: 'utf8', timeout: 90000, maxBuffer: 24 * 1024 * 1024, windowsHide: true }).trim();
  if (/^Error:/m.test(out)) throw Error(out);
  return out;
}
if (run('vault', 'info=path') !== canonical) throw Error('Wrong vault.');
function evaluate(code) {
  // The desktop CLI has a small IPC command-size limit. Load the owned QA
  // script through a short command instead of passing its entire source.
  const script = path.join(repo, 'qa', `drag-demo-${mode}.log`);
  writeFileSync(script, `(async()=>{if(app.vault.adapter.getBasePath()!==${JSON.stringify(canonical)})throw Error('Wrong vault');${code}})()`);
  const out = run('eval', `code=eval(require('fs').readFileSync(${JSON.stringify(script)},'utf8'))`);
  if (!out.startsWith('=>')) throw Error(out);
  return out.slice(2).trim();
}
function cdp(method, params = {}) { return JSON.parse(run('dev:cdp', `method=${method}`, `params=${JSON.stringify(params)}`)); }

if (mode === 'prepare') {
  mkdirSync(path.join(repo, 'qa'), { recursive: true });
  if (evaluate('return Boolean(window.__jspDragDemo);') === 'true') throw Error('Restore the previous recording session first.');
  const directory = path.join(repo, 'qa', `drag-demo-${Date.now()}`);
  mkdirSync(directory);
  const settingsFile = path.join(canonical, '.obsidian/plugins/just-simple-planner/data.json');
  writeFileSync(sessionFile, JSON.stringify({ directory, settings: readFileSync(settingsFile).toString('base64') }));
  cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  console.log(evaluate(`
    if(window.__jspDragDemo)throw Error('Restore the previous recording session first');
    if(document.querySelector('.modal-container'))throw Error('Close the current modal first');
    const p=app.plugins.getPlugin('just-simple-planner');
    if(!p||p.entries.size!==20||p.threads.size!==4)throw Error('Expected the canonical fictional demo');
    const q={p,directory:${JSON.stringify(directory)},fixture:${JSON.stringify(fixture)},before:new Map(),frames:[],errors:[],recording:false};
    window.__jspDragDemo=q;
    q.wait=async(fn)=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error('Recording state timed out')};
    for(const name of [...p.entries.keys(),...p.threads.keys()])q.before.set(name,await app.vault.read(p.file(name)));
    q.undo=[...p.history.undoStack];q.redo=[...p.history.redoStack];
    q.active=app.workspace.activeLeaf;
    await p.openPlanner();
    q.v=app.workspace.getLeavesOfType('just-simple-planner')[0].view;
    const v=q.v;q.view={state:v.getState(),search:v.search,status:v.status,tasks:v.showTasks,selected:[...v.selected],focus:v.focusPath,left:v.scroll.scrollLeft,top:v.scroll.scrollTop};
    q.explorer=app.workspace.getLeavesOfType('file-explorer')[0].view;
    q.explorerState=q.explorer.getState();
    q.folders=Object.values(q.explorer.fileItems).filter(item=>item.collapsible).map(item=>[item.file.path,item.collapsed]);
    q.navScroll=q.explorer.containerEl.querySelector('.nav-files-container')?.scrollTop??0;
    q.text=['---',p.settings.propertyNames.date+': 2026-11-02','calendar: true','---','Seguimiento del taller con el cliente Aurora.','','- [ ] Enviar el resumen de la reunión.',''].join(String.fromCharCode(10));
    let folder='';for(const part of q.fixture.split('/').slice(0,-1)){folder=folder?folder+'/'+part:part;if(!app.vault.getAbstractFileByPath(folder))await app.vault.createFolder(folder)}
    q.file=app.vault.getAbstractFileByPath(q.fixture);
    if(q.file){if(await app.vault.read(q.file)!==q.text)throw Error('Differing existing source fixture')}else q.file=await app.vault.create(q.fixture,q.text);
    await q.wait(()=>q.explorer.fileItems[q.fixture]&&app.metadataCache.getFileCache(q.file));
    for(const item of Object.values(q.explorer.fileItems))if(item.collapsible)item.setCollapsed(true);
    for(const name of ['Pruebas','Pruebas/Notas dispersas'])q.explorer.fileItems[name].setCollapsed(false);
    q.explorer.fileItems[q.fixture].selfEl.scrollIntoView({block:'center'});
    q.thread=[...p.threads.values()].find(t=>t.title==='Curso de inteligencia artificial').path;
    v.mode='board';v.search='';v.status='all';v.showTasks=false;v.focusPath=null;v.selected.clear();v.collapsed=new Set([...p.threads.keys()].filter(name=>name!==q.thread));v.activeThread=q.thread;v.jump('2026-11-02');v.scroll.scrollTop=0;
    app.workspace.setActiveLeaf(v.leaf,{focus:true});v.scroll.focus({preventScroll:true});
    q.cursor=document.createElement('div');q.cursor.id='jsp-demo-cursor';q.cursor.style.cssText='position:fixed;left:0;top:0;width:26px;height:32px;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 1px 2px #0006);transform:translate(-50px,-50px)';
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 26 34');svg.style.cssText='width:100%;height:100%';const arrow=document.createElementNS(svg.namespaceURI,'path');arrow.setAttribute('d','M3 2 L3 25 L9 19 L14 30 L19 28 L14 17 L24 17 Z');arrow.setAttribute('fill','#fff');arrow.setAttribute('stroke','#17202a');arrow.setAttribute('stroke-width','2');svg.appendChild(arrow);q.cursor.appendChild(svg);document.body.appendChild(q.cursor);
    q.follow=event=>{q.cursor.style.transform='translate('+event.clientX+'px,'+event.clientY+'px)'};
    document.addEventListener('mousemove',q.follow,true);document.addEventListener('dragover',q.follow,true);
    q.wc=require('electron').remote.getCurrentWebContents();
    q.listener=async(event,method,params)=>{try{if(method==='Input.dragIntercepted')q.drag=params.data;if(method==='Page.screencastFrame'){if(q.recording){const file=require('path').join(q.directory,String(q.frames.length).padStart(5,'0')+'.png');require('fs').writeFileSync(file,Buffer.from(params.data,'base64'));q.frames.push({file,time:Date.now()})}await q.wc.debugger.sendCommand('Page.screencastFrameAck',{sessionId:params.sessionId})}}catch(error){q.errors.push(String(error))}};
    q.wc.debugger.on('message',q.listener);
    q.rect=element=>{const r=element.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}};
    await new Promise(r=>setTimeout(r,250));
    return JSON.stringify({ready:true,source:q.rect(q.explorer.fileItems[q.fixture].selfEl),target:q.rect([...v.root.querySelectorAll('.jsp-thread-label')].find(el=>el.parentElement.dataset.thread===q.thread)),viewport:[innerWidth,innerHeight]});
  `));
} else if (mode === 'record') {
  console.log(evaluate(`
    const q=window.__jspDragDemo;if(!q)throw Error('Prepare the recording first');
    const send=(method,params)=>q.wc.debugger.sendCommand(method,params);
    const pause=ms=>new Promise(r=>setTimeout(r,ms));
    const source=q.rect(q.explorer.fileItems[q.fixture].selfEl);
    const target=q.rect([...q.v.root.querySelectorAll('.jsp-thread-label')].find(el=>el.parentElement.dataset.thread===q.thread));
    const mouse=(type,point,buttons=0)=>send('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:buttons||type==='mousePressed'||type==='mouseReleased'?'left':'none',buttons,clickCount:type==='mousePressed'?1:0});
    const move=async(a,b,steps,drag)=>{for(let i=1;i<=steps;i++){const t=i/steps,point={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};if(drag)await send('Input.dispatchDragEvent',{type:'dragOver',...point,data:q.drag});else await mouse('mouseMoved',point);await pause(35)}};
    q.recording=true;
    await send('Page.startScreencast',{format:'png',maxWidth:1280,maxHeight:800,everyNthFrame:1});
    await mouse('mouseMoved',source);await pause(1600);
    await send('Input.setInterceptDrags',{enabled:true});
    await mouse('mousePressed',source,1);
    await mouse('mouseMoved',{x:source.x+10,y:source.y},1);
    await mouse('mouseMoved',{x:source.x+24,y:source.y},1);
    await q.wait(()=>q.drag);
    if(!q.drag.items.some(item=>item.data?.includes('obsidian://open')))throw Error('Native explorer did not supply an Obsidian note URI');
    q.nativeDrag=JSON.parse(JSON.stringify(q.drag));
    await send('Input.dispatchDragEvent',{type:'dragEnter',...source,data:q.drag});
    await move(source,target,32,true);await pause(1500);
    await send('Input.dispatchDragEvent',{type:'drop',...target,data:q.drag});
    await mouse('mouseReleased',target,0);await send('Input.setInterceptDrags',{enabled:false});
    await q.wait(()=>document.querySelector('.jsp-membership-modal'));
    const modal=document.querySelector('.jsp-membership-modal');
    if(modal.querySelector('input[type=date]').value!=='2026-11-02'||modal.querySelector('select').value!==q.thread)throw Error('Unexpected enrollment proposal');
    await pause(3600);
    const button=[...modal.querySelectorAll('button')].find(el=>el.textContent==='Add to planner');
    const save=q.rect(button);await move(target,save,18,false);await pause(400);
    await mouse('mousePressed',save,1);await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:save.x,y:save.y,button:'left',buttons:0,clickCount:1});
    await q.wait(()=>!document.querySelector('.jsp-membership-modal')&&q.p.entries.has(q.fixture)&&!q.p.history.busy);
    q.enrolled=true;
    await q.wait(()=>[...q.v.root.querySelectorAll('.jsp-card')].some(el=>el.dataset.path===q.fixture));
    const card=q.rect([...q.v.root.querySelectorAll('.jsp-card')].find(el=>el.dataset.path===q.fixture));
    await move(save,card,20,false);await pause(2800);
    if(q.file.path!==q.fixture||app.metadataCache.getFileCache(q.file)?.frontmatter?.calendar!==true)throw Error('Original note changed location or lost calendar property');
    q.recording=false;await send('Page.stopScreencast');
    if(q.errors.length)throw Error(q.errors.join('; '));
    require('fs').writeFileSync(require('path').join(q.directory,'frames.json'),JSON.stringify(q.frames));
    require('fs').writeFileSync(require('path').join(q.directory,'native-drag.json'),JSON.stringify(q.nativeDrag));
    return JSON.stringify({recorded:true,frames:q.frames.length,directory:q.directory,entries:q.p.entries.size});
  `));
} else if (mode === 'encode') {
  const session = JSON.parse(readFileSync(sessionFile, 'utf8'));
  const captured = JSON.parse(readFileSync(path.join(session.directory, 'frames.json'), 'utf8'));
  if (!captured.length) throw Error('The recording has no frames.');
  // Sample at up to 12.5 fps while preserving real timing, including pauses.
  const sampled = [];
  for (const frame of captured) if (!sampled.length || frame.time - sampled.at(-1).time >= 80) sampled.push(frame);
  if (sampled.at(-1) !== captured.at(-1)) sampled.push(captured.at(-1));
  const output = path.join(repo, 'docs/images/add-existing-note.gif');
  const args = ['-dispose', 'None'];
  for (let index = 0; index < sampled.length; index++) {
    const delay = index === sampled.length - 1 ? 120 : Math.max(2, Math.round((sampled[index + 1].time - sampled[index].time) / 10));
    args.push('-delay', String(delay), sampled[index].file);
  }
  args.push('-crop', '1236x640+44+40', '+repage', '+dither', '-colors', '128', '-layers', 'Optimize', '-loop', '0', output);
  execFileSync('magick', args, { timeout: 120000, windowsHide: true });
  console.log(JSON.stringify({ output, captured: captured.length, sampled: sampled.length, bytes: readFileSync(output).length }));
} else if (mode === 'restore') {
  console.log(evaluate(`
    const q=window.__jspDragDemo;if(!q)return 'No recording session';
    q.recording=false;
    try{await q.wc?.debugger.sendCommand('Page.stopScreencast')}catch{}
    try{await q.wc?.debugger.sendCommand('Input.setInterceptDrags',{enabled:false});await q.wc?.debugger.sendCommand('Input.cancelDragging')}catch{}
    const modal=document.querySelector('.jsp-membership-modal');if(modal)[...modal.querySelectorAll('button')].find(el=>el.textContent==='Cancel')?.click();
    if(q.p.entries.has(q.fixture)){await q.p.history.undo();if(await app.vault.read(q.file)!==q.text)throw Error('Recording source was not restored exactly')}
    if(q.undo){q.p.history.undoStack=q.undo;q.p.history.redoStack=q.redo}
    if(q.cursor)q.cursor.remove();
    if(q.follow){document.removeEventListener('mousemove',q.follow,true);document.removeEventListener('dragover',q.follow,true)}
    if(q.listener)q.wc.debugger.removeListener('message',q.listener);
    if(q.explorer){await q.explorer.setState(q.explorerState);for(const [name,collapsed]of q.folders??[])q.explorer.fileItems[name]?.setCollapsed(collapsed);const scroller=q.explorer.containerEl.querySelector('.nav-files-container');if(scroller)scroller.scrollTop=q.navScroll}
    if(q.view){const s=q.view;q.v.search=s.search;q.v.status=s.status;q.v.showTasks=s.tasks;q.v.selected=new Set(s.selected);q.v.focusPath=s.focus;await q.v.setState(s.state);q.v.scroll.scrollLeft=s.left;q.v.scroll.scrollTop=s.top}
    if(q.active)app.workspace.setActiveLeaf(q.active,{focus:false});
    for(const [name,text]of q.before)if(await app.vault.read(q.p.file(name))!==text)throw Error('Existing demo note changed: '+name);
    if(q.p.entries.size!==20||q.p.threads.size!==4)throw Error('Unexpected restored demo counts');
    delete window.__jspDragDemo;return 'Source note, existing notes, history, explorer and planner view restored';
  `));
  cdp('Emulation.clearDeviceMetricsOverride');
  cdp('Emulation.setFocusEmulationEnabled', { enabled: false });
  const saved = JSON.parse(readFileSync(sessionFile, 'utf8'));
  if (!readFileSync(path.join(canonical, '.obsidian/plugins/just-simple-planner/data.json')).equals(Buffer.from(saved.settings, 'base64'))) throw Error('Saved settings changed.');
} else throw Error('Use prepare, record, restore or encode.');
