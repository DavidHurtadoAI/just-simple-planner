import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vault = path.resolve(root, '../../@Nexus-dev');
const cli = 'C:\\Program Files\\Obsidian\\Obsidian.com';
function run(...args) { const out = execFileSync(cli, ['vault=@Nexus-dev', ...args], { encoding: 'utf8', timeout: 25000, windowsHide: true }).trim(); if (/^Error:/m.test(out)) throw Error(out); return out; }
function evaluate(code) { const out = run('eval', 'code=(async()=>{if(app.vault.adapter.getBasePath()!==' + JSON.stringify(vault) + ')throw Error("Wrong vault");' + code + '})()'); if (!out.startsWith('=>')) throw Error('No CLI evaluation result'); return out; }
function state(code) { return evaluate('const q=window.__jspRelease;const {p,assert,wait}=q;' + code); }
function shot(name) { state('await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true;'); console.log(run('dev:screenshot', 'path=' + path.join(root, 'docs/images', name + '.png'))); }
function escape() { for (const type of ['keyDown', 'keyUp']) run('dev:cdp', 'method=Input.dispatchKeyEvent', 'params=' + JSON.stringify({ type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })); }
const mode = process.argv[2];
run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":true}');
if (mode === 'prepare') {
  evaluate(String.raw`
    if(window.__jspRelease&&!window.__jspRelease.cleaned)throw Error('Capture session already exists');
    const p=app.plugins.getPlugin('just-simple-planner');if(!p)throw Error('Planner unavailable');
    const assert=(ok,msg)=>{if(!ok)throw Error(msg)},wait=async(fn)=>{for(let i=0;i<240;i++){if(fn())return;await new Promise(r=>setTimeout(r,25))}throw Error('Timed out')};
    const q=window.__jspRelease={p,assert,wait,folder:'Pruebas/Just Simple Planner/Capturas 0.5.2',before:new Map(),notes:[],leaves:[],layout:app.workspace.getLayout()};
    if(app.vault.getAbstractFileByPath(q.folder))throw Error('Capture folder exists; preserve it and choose a new folder');
    for(const leaf of app.workspace.getLeavesOfType('bases')){const v=leaf.view.controller?.view;if(v?.type==='just-simple-planner-bases')for(const item of [...v.session.entries.values(),...v.session.threads.values()])q.before.set(item.path,await app.vault.read(p.file(item.path)))}
    q.settingsPath=app.vault.configDir+'/plugins/just-simple-planner/data.json';q.settings=await app.vault.adapter.read(q.settingsPath);
    q.style=document.head.createEl('style',{text:'[aria-label^="Pip"],[aria-label^="Call Pip"],.tooltip{display:none !important}'});
    q.thread=name=>q.folder+'/'+name+'.md';q.link=path=>'[['+path.slice(0,-3)+']]';
    q.product=q.thread('Producto');q.content=q.thread('Contenidos');q.training=q.thread('Formación');q.empty=q.thread('Más adelante');
    q.paths={define:q.thread('Definir el prototipo'),build:q.thread('Construir el prototipo'),review:q.thread('Revisión de avance'),feedback:q.thread('Recoger feedback'),draft:q.thread('Revisar el borrador'),publish:q.thread('Preparar la publicación'),guide:q.thread('Publicar la guía'),comments:q.thread('Recoger comentarios'),prepare:q.thread('Preparar el taller'),teach:q.thread('Impartir el taller'),tutor:q.thread('Tutorías de seguimiento')};
    return 'PREPARED';
  `);
  state(String.raw`
    const note=(key,title,date,thread,body='',props={})=>[q.paths[key],'---\n'+Object.entries({planner_type:'entry',title,date,thread:q.link(thread),...props}).map(([k,v])=>k+': '+JSON.stringify(v)).join('\n')+'\n---\n'+body];
    q.notes=[...[[q.product,'cyan',-100],[q.content,'purple',-99],[q.training,'orange',-98],[q.empty,'green',-97]].map(([path,color,order])=>[path,'---\nplanner_type: thread\ncolor: '+color+'\norder: '+order+'\nstatus: active\n---\n']),
      note('define','Definir el prototipo','2026-11-02',q.product,'- [x] Acordar el alcance.\n',{next:[q.link(q.paths.build)]}),
      note('build','Construir el prototipo','2026-11-03',q.product,'Tres días para preparar una primera versión.\n- [ ] Probar el recorrido completo.\n',{end_date:'2026-11-05',next:[q.link(q.paths.feedback)]}),
      note('review','Revisión de avance','2026-11-03',q.product,'',{repeat:'every 2 days',repeat_until:'2026-11-13',repeat_except:['2026-11-07']}),
      note('feedback','Recoger feedback','2026-11-06',q.product,'Conectar las observaciones con la siguiente mejora.\n'),
      note('draft','Revisar el borrador','2026-11-02',q.content,'',{next:[q.link(q.paths.publish)]}),
      note('publish','Preparar la publicación','2026-11-03',q.content,'Dejar el contenido y los recursos listos para una revisión final.\n- [ ] Comprobar los enlaces del artículo.\n',{end_date:'2026-11-04',next:[q.link(q.paths.guide)]}),
      note('guide','Publicar la guía','2026-11-06',q.content,'Explicar los cambios con ejemplos claros.\n',{next:[q.link(q.paths.comments)]}),
      note('comments','Recoger comentarios','2026-11-07',q.content),
      note('prepare','Preparar el taller','2026-11-02',q.training,'- [ ] Preparar los ejercicios.\n',{next:[q.link(q.paths.teach)]}),
      note('teach','Impartir el taller','2026-11-05',q.training,'Dos días de práctica con notas y proyectos.\n',{end_date:'2026-11-06'}),
      note('tutor','Tutorías de seguimiento','2026-11-04',q.training,'Resolver dudas sobre el ejercicio.\n',{additional_dates:['2026-11-08','2026-11-11']})];
    let folder='';for(const part of q.folder.split('/')){folder=folder?folder+'/'+part:part;if(!app.vault.getAbstractFileByPath(folder))await app.vault.createFolder(folder)}
    for(const [path,text]of q.notes)await app.vault.create(path,text);
    await wait(()=>q.notes.every(([path])=>app.metadataCache.getFileCache(p.file(path))?.frontmatter));return 'NOTES';
  `);
  state(String.raw`
    q.makeBase=async(name,thread)=>{const filters=['file.ext == \"md\"','file.inFolder('+JSON.stringify(q.folder)+')','note.planner_type != "qa-archived"'];if(thread)filters.push('note.thread == '+JSON.stringify(q.link(thread)));const doc={filters:{and:filters},views:[{type:'just-simple-planner-bases',name:thread?'Planner':'Equipo',dateProperty:'note.date',titleProperty:'note.title',threadProperty:'note.thread',nextProperty:'note.next',endDateProperty:'note.end_date',repeatProperty:'note.repeat',repeatUntilProperty:'note.repeat_until',repeatExceptProperty:'note.repeat_except',additionalDatesProperty:'note.additional_dates',dayWidth:'140',threadNotes:thread?[thread]:[q.product,q.content,q.training,q.empty],plannerState:{mode:'board',firstDay:'2026-10-03',scrollLeft:4060,scrollTop:0}}]};return app.vault.create(q.folder+'/'+name+'.base',JSON.stringify(doc,null,2))};
    q.base=await q.makeBase('Planner de equipo');q.productBase=await q.makeBase('Planner de producto',q.product);q.trainingBase=await q.makeBase('Planner de formación',q.training);
    q.open=async(file,split=false)=>{const leaf=app.workspace.getLeaf(split?'split':'tab',split?'vertical':undefined);q.leaves.push(leaf);await leaf.openFile(file);app.workspace.setActiveLeaf(leaf,{focus:true});await wait(()=>leaf.view.controller?.view?.session?.entries.size);return leaf};
    q.close=async()=>{for(const leaf of q.leaves)await leaf.detach();q.leaves=[]};
    q.board=async()=>{await q.close();q.leaf=await q.open(q.base);q.v=q.leaf.view.controller.view;await q.v.surface.setState({mode:'board',firstDay:'2026-10-03',scrollLeft:4200,scrollTop:0,collapsed:[q.training,q.empty],activeThread:q.product,search:'',status:'all',showTasks:false})};
    await q.board();return 'READY';
  `);
} else if (mode === 'board') {
  state('await q.board();return true;'); shot('bases-board');
} else if (mode === 'notebook') {
  state("await q.board();q.v.surface.contentEl.querySelector('[aria-label=\"Switch to notebook\"]').click();q.v.surface.contentEl.querySelector('[aria-label=\"Tasks\"]').click();return true;"); shot('bases-notebook');
} else if (mode === 'scheduling') {
  state(String.raw`await q.board();const label=[...q.leaf.view.containerEl.querySelectorAll('.bases-toolbar .text-button-label')].find(e=>e.textContent==='Equipo');label.parentElement.click();return true;`);
  state(String.raw`document.querySelector('.bases-toolbar-menu-item.mod-active .bases-toolbar-menu-item-icon').click();return true;`);
  state(String.raw`const header=[...document.querySelectorAll('.input-group-header-text')].find(e=>e.textContent==='Optional scheduling');if(header.parentElement.querySelector('.is-collapsed'))header.parentElement.click();const menu=document.querySelector('.bases-toolbar-menu');await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));menu.querySelector('input')?.blur();menu.querySelector('.bases-toolbar-menu-form').scrollTop=500;return menu.textContent;`);
  shot('bases-scheduling'); escape();
} else if (mode === 'multi-day') {
  escape();
  state(String.raw`await q.board();const entry=q.v.session.entries.get(q.paths.publish);q.v.surface.collapsed.add(q.product);q.v.surface.revealEntry(entry);q.v.surface.scroll.scrollLeft=30*q.v.session.settings.dayWidth;const card=[...q.v.surface.contentEl.querySelectorAll('.jsp-card')].find(c=>c.dataset.path===entry.path);q.v.surface.scroll.scrollTop+=card.getBoundingClientRect().top-q.v.surface.scroll.getBoundingClientRect().top-65;const right=app.workspace.getLeaf('split','vertical');q.leaves.push(right);await right.openFile(p.file(entry.path));app.workspace.setActiveLeaf(q.leaf,{focus:true});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const target=[...q.v.surface.contentEl.querySelectorAll('.jsp-card')].find(c=>c.dataset.path===entry.path);q.v.surface.scroll.scrollTop+=target.getBoundingClientRect().top-q.v.surface.scroll.getBoundingClientRect().top-65;return true;`);
  shot('bases-multi-day');
} else if (mode === 'multiple') {
  escape();
  state(String.raw`await q.close();const left=await q.open(q.productBase),right=await q.open(q.trainingBase,true);for(const leaf of [left,right]){const v=leaf.view.controller.view;await v.surface.setState({mode:'board',firstDay:'2026-10-03',scrollLeft:4200,scrollTop:0,collapsed:[],search:'',status:'all',showTasks:false})}left.view.controller.view.surface.scroll.scrollLeft=31*140;right.view.controller.view.surface.scroll.scrollLeft=32*140;app.workspace.setActiveLeaf(left,{focus:true});return true;`);
  shot('bases-multiple-planners');
} else if (mode === 'classic' || mode === 'migration') {
  escape();
  state(String.raw`await q.close();await p.openPlanner();const leaf=app.workspace.getLeavesOfType('just-simple-planner')[0];q.leaves.push(leaf);app.workspace.setActiveLeaf(leaf,{focus:true});const surface=leaf.view.surface;await surface.setState({mode:'board',firstDay:'2026-10-03',scrollLeft:4200,scrollTop:0,collapsed:[],search:'prototipo',status:'all',showTasks:false});return true;`);
  if (mode === 'classic') shot('bases-classic-transition');
  else { state("p.openMigration();await wait(()=>document.querySelector('.jsp-migration-modal button.mod-cta')&&!document.querySelector('.jsp-migration-modal button.mod-cta').disabled);return true;"); shot('bases-migration-review'); escape(); }
} else if (mode === 'cleanup') {
  escape();
  console.log(state(String.raw`await q.close();for(const [path,text]of q.notes){const file=p.file(path);await app.vault.modify(file,text.replace(/\nplanner_type: (entry|thread)\n/,'\nplanner_type: qa-archived\n'))}q.style.remove();await app.workspace.changeLayout(q.layout);for(const [path,text]of q.before)assert(await app.vault.read(p.file(path))===text,'Original changed: '+path);assert(await app.vault.adapter.read(q.settingsPath)===q.settings,'Settings changed');q.cleaned=true;return 'All original notes/settings preserved; layout restored; capture notes retained as archived';`));
  run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":false}');
} else throw Error('Use prepare, board, notebook, scheduling, multi-day, multiple, classic, migration or cleanup');
