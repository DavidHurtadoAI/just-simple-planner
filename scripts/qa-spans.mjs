import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const cli = 'C:\\Program Files\\Obsidian\\Obsidian.com';
const canonical = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../@Nexus-dev');
function run(...args) { const result = execFileSync(cli, ['vault=@Nexus-dev', ...args], { encoding: 'utf8', timeout: 25000, windowsHide: true }).trim(); if (/^Error:/m.test(result)) throw Error(result); return result; }
function evaluate(code) { return run('eval', 'code=(async()=>{if(app.vault.adapter.getBasePath()!==' + JSON.stringify(canonical) + ')throw Error("Wrong vault");' + code + '})()'); }
function state(code) { return evaluate('const q=window.__jspSpansQA;const {p,s,v,surface,assert,wait,cards}=q;' + code); }
const passed = [];
function check(name, code) { const result = state(code + "return 'PASS';"); if (!result.includes('PASS')) throw Error(name + ': ' + result); passed.push(name); console.log('PASS ' + name); }
run('dev:debug', 'on'); run('dev:errors', 'clear');
run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":true}');
try {
  const initialized = evaluate(String.raw`
    const p=app.plugins.getPlugin('just-simple-planner');if(!p)throw Error('Planner unavailable');
    const assert=(ok,message)=>{if(!ok)throw Error(message)},wait=async(fn)=>{for(let i=0;i<240;i++){if(fn())return;await new Promise(r=>setTimeout(r,25))}throw Error('Timed out')};
    const q=window.__jspSpansQA={p,assert,wait,folder:'Pruebas/Just Simple Planner/Duración QA/'+Date.now(),before:new Map(),fixtures:[],active:app.workspace.activeLeaf};
    for(const leaf of app.workspace.getLeavesOfType('bases')){const view=leaf.view.controller?.view;if(view?.type!=='just-simple-planner-bases')continue;for(const item of [...view.session.entries.values(),...view.session.threads.values()])if(!q.before.has(item.path))q.before.set(item.path,await app.vault.read(p.file(item.path)))}
    q.settingsPath=app.vault.configDir+'/plugins/just-simple-planner/data.json';q.settings=await app.vault.adapter.read(q.settingsPath);
    let folder='';for(const part of q.folder.split('/')){folder=folder?folder+'/'+part:part;if(!app.vault.getAbstractFileByPath(folder))await app.vault.createFolder(folder)}
    for(const [key,name]of Object.entries({thread:'Hilo de duración QA',course:'Curso de dos días QA',next:'Preparar entrega QA',after:'Después del curso QA',ongoing:'Viaje en curso QA',long:'Proyecto de varios meses QA',repeat:'Taller semanal QA',invalid:'Fecha final inválida QA',extra:'Sesiones sueltas QA'}))q[key]=q.folder+'/'+name+'.md';
    return 'INITIALIZED';
  `);
  if (!initialized.includes('INITIALIZED')) throw Error('Initialization: ' + initialized);
  const fixtures = state(String.raw`
    const note=(title,date,body='',extra='')=>'---\nplanner_type: entry\ntitle: '+JSON.stringify(title)+'\ndate: '+date+'\nthread: '+JSON.stringify('[['+q.thread.slice(0,-3)+']]')+'\n'+extra+'---\n'+body;
    q.fixtures=[
      [q.thread,'---\nplanner_type: thread\ncolor: purple\norder: 0\n---\n'],
      [q.course,note('Curso de dos días QA','2026-11-03T09:30:00+01:00','','end_date: 2026-11-04T20:00:00+01:00\nfinish: 2026-11-06\nnext: ['+JSON.stringify('[['+q.next.slice(0,-3)+']]')+']\n')],
      [q.next,note('Preparar entrega QA','2026-11-04','- [ ] Comprobar la entrega.\n')],
      [q.after,note('Después del curso QA','2026-11-05')],
      [q.ongoing,note('Viaje en curso QA','2026-10-20','Conservar las fechas reales.\n','end_date: 2026-11-04\n')],
      [q.long,note('Proyecto de varios meses QA','2026-10-20','Cruza ambos bordes.\n','end_date: 2027-03-01\n')],
      [q.repeat,note('Taller semanal QA','2026-11-02','Misma nota en cada taller.\n','end_date: 2026-11-04\nrepeat: weekly\nrepeat_until: 2026-11-23\n')],
      [q.invalid,note('Fecha final inválida QA','2026-11-03','','end_date: 2026-11-02\n')],
      [q.extra,note('Sesiones sueltas QA','2026-11-03','','additional_dates: [2026-11-05]\n')]
    ];
    for(const [path,text]of q.fixtures){assert(!app.vault.getAbstractFileByPath(path),'Fixture exists');await app.vault.create(path,text)}
    await wait(()=>q.fixtures.every(([path])=>app.metadataCache.getFileCache(p.file(path))?.frontmatter));
    return 'FIXTURES';
  `);
  if (!fixtures.includes('FIXTURES')) throw Error('Fixtures: ' + fixtures);
  const ready = state(String.raw`
    const doc={filters:{and:['file.inFolder('+JSON.stringify(q.folder)+')','note.planner_type != "qa-archived"']},views:[{type:'just-simple-planner-bases',name:'Duración QA',dateProperty:'note.date',titleProperty:'note.title',threadProperty:'note.thread',nextProperty:'note.next',endDateProperty:'note.end_date',repeatProperty:'note.repeat',repeatUntilProperty:'note.repeat_until',additionalDatesProperty:'note.additional_dates',dayWidth:'140',plannerState:{mode:'board',firstDay:'2026-11-03',scrollLeft:1400,scrollTop:0}}]};
    q.base=await app.vault.create(q.folder+'/Planner de duración QA.base',JSON.stringify(doc,null,2));q.leaf=app.workspace.getLeaf('tab');await q.leaf.openFile(q.base);await wait(()=>q.leaf.view.controller?.view?.session?.entries.size===8);
    q.v=q.leaf.view.controller.view;q.s=q.v.session;q.surface=q.v.surface;
    await q.surface.setState({mode:'board',firstDay:'2026-11-03',scrollLeft:1400,scrollTop:0,collapsed:[]});
    q.cards=path=>[...q.surface.contentEl.querySelectorAll('.jsp-card')].filter(c=>c.dataset.path===path);
    q.shift=(day,delta)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10)};
    q.drag=async(path,grab,delta,flow=false)=>{const card=q.cards(path)[0],lane=card.parentElement,a=lane.getBoundingClientRect(),index=(parseFloat(card.style.left)-10)/140+grab,transfer=new DataTransfer(),previous=q.s.entries.get(path).date;card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer,clientX:a.left+(index+.5)*140,clientY:card.getBoundingClientRect().top+20,shiftKey:flow}));assert(q.surface.dragging,'Drag did not start');lane.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer,clientX:a.left+(index+delta+.5)*140,clientY:a.top+20}));await wait(()=>q.s.entries.get(path)?.date===q.shift(previous,delta)&&!q.s.history.busy)};
    await wait(()=>q.cards(q.course)[0]?.offsetWidth===260);return 'READY';
  `);
  if (!ready.includes('READY')) throw Error(ready);
  check('inclusive end dates create one two-column card without changing its height', String.raw`const c=cards(q.course)[0];assert(cards(q.course).length===1&&c.offsetWidth===260&&c.offsetHeight===68,'Wrong span or height');assert(c.dataset.date==='2026-11-03'&&c.dataset.endDate==='2026-11-04','Wrong dates');assert(c.getAttribute('aria-label').includes('2026-11-03 through 2026-11-04'),'Inaccessible range');assert(cards(q.next)[0].offsetWidth===120&&cards(q.next)[0].offsetHeight===116,'Single-day regression');`);
  check('mixed durations and repeated appearances never overlap inside a thread', String.raw`const all=[...surface.contentEl.querySelectorAll('.jsp-card')];for(const [i,a]of all.entries())for(const b of all.slice(i+1)){const horizontal=a.offsetLeft<b.offsetLeft+b.offsetWidth&&b.offsetLeft<a.offsetLeft+a.offsetWidth,vertical=a.offsetTop<b.offsetTop+b.offsetHeight&&b.offsetTop<a.offsetTop+a.offsetHeight;assert(!horizontal||!vertical,'Cards overlap: '+a.dataset.path+' / '+b.dataset.path)}const last=Math.max(...all.map(c=>c.offsetTop+c.offsetHeight));assert(last<all[0].closest('.jsp-row').offsetHeight,'Row clips cards');`);
  check('ongoing notes clip at the board edge while retaining their real dates', String.raw`const c=cards(q.ongoing)[0];assert(c.dataset.date==='2026-10-20'&&c.dataset.endDate==='2026-11-04','Dates clipped in data');assert(c.offsetLeft===10&&c.offsetWidth===260&&c.classList.contains('continues-before'),'Wrong ongoing geometry');const long=cards(q.long)[0];assert(long.offsetLeft===10&&long.offsetWidth===91*140-20,'Wrong full-window width');assert(long.classList.contains('continues-before')&&long.classList.contains('continues-after'),'Continuation edges missing');`);
  check('weekly durations include the ongoing occurrence and extend through their end days', String.raw`const repeated=cards(q.repeat);assert(repeated.length===4&&repeated[0].dataset.date==='2026-11-02','Missing ongoing occurrence');assert(repeated[0].offsetWidth===260&&repeated.slice(1).every(c=>c.offsetWidth===400),'Repeat duration not drawn');assert(repeated.every(c=>c.dataset.path===q.repeat),'Series duplicated on disk');`);
  check('invalid ends warn and additional dates remain individual one-day appearances', String.raw`assert(cards(q.invalid)[0].offsetWidth===120&&cards(q.invalid)[0].classList.contains('has-schedule-warning'),'Invalid end not guarded');assert(cards(q.extra).length===2&&cards(q.extra).every(c=>c.offsetWidth===120),'Additional days joined into a range');`);
  check('connections begin at the actual end of the spanning card', String.raw`surface.drawEdges();const edge=[...surface.contentEl.querySelectorAll('.jsp-connection')].find(e=>e.dataset.source===q.course);assert(edge,'Connection missing');const xy=edge.querySelector('path').getAttribute('d').match(/^M ([\d.-]+) ([\d.-]+)/);const c=cards(q.course)[0].getBoundingClientRect(),board=surface.stage.getBoundingClientRect();assert(Math.abs(Number(xy[1])-(c.right-board.left))<1&&Math.abs(Number(xy[2])-(c.top+c.height/2-board.top))<1,'Arrow uses single-day geometry');`);
  check('dragging from the second day moves both ends by one day and supports exact undo/redo', String.raw`const before=await app.vault.read(p.file(q.course));await q.drag(q.course,1,1);let fm=app.metadataCache.getFileCache(p.file(q.course)).frontmatter;assert(fm.date==='2026-11-04T09:30:00+01:00'&&fm.end_date==='2026-11-05T20:00:00+01:00','Grab offset or duration lost');assert(cards(q.course)[0].offsetWidth===260,'Width changed on move');await s.history.undo();await wait(()=>s.entries.get(q.course)?.snapshot===before);await s.history.redo();await wait(()=>s.entries.get(q.course)?.date==='2026-11-04');await s.history.undo();await wait(()=>s.entries.get(q.course)?.snapshot===before);`);
  check('dragging a clipped ongoing note preserves the grabbed-day offset', String.raw`const before=await app.vault.read(p.file(q.ongoing));await q.drag(q.ongoing,0,1);const fm=app.metadataCache.getFileCache(p.file(q.ongoing)).frontmatter;assert(fm.date==='2026-10-21'&&fm.end_date==='2026-11-05','Clipped drag reset the anchor');await s.history.undo();await wait(()=>s.entries.get(q.ongoing)?.snapshot===before);`);
  check('moving a connected flow preserves span durations and both original notes on undo', String.raw`const a=await app.vault.read(p.file(q.course)),b=await app.vault.read(p.file(q.next));await q.drag(q.course,1,1,true);await wait(()=>s.entries.get(q.next)?.date==='2026-11-05');assert(app.metadataCache.getFileCache(p.file(q.course)).frontmatter.end_date==='2026-11-05T20:00:00+01:00','Flow lost duration');await s.history.undo();await wait(()=>s.entries.get(q.course)?.snapshot===a&&s.entries.get(q.next)?.snapshot===b);`);
  check('folded rows retain the span widths and compact heights without overlaps', String.raw`surface.collapsed.add(q.thread);surface.render();assert(cards(q.course)[0].offsetWidth===260,'Folded span shrank');const all=[...surface.contentEl.querySelectorAll('.jsp-card')];assert(all.every(c=>c.offsetHeight===24),'Wrong compact height');for(const [i,a]of all.entries())for(const b of all.slice(i+1))if(a.offsetLeft<b.offsetLeft+b.offsetWidth&&b.offsetLeft<a.offsetLeft+a.offsetWidth)assert(a.offsetTop+24<=b.offsetTop||b.offsetTop+24<=a.offsetTop,'Folded overlap');surface.collapsed.clear();surface.render();`);
  check('Notebook shows complete date ranges while tasks remain one set per source note', String.raw`surface.contentEl.querySelector('[aria-label="Switch to notebook"]').click();assert(cards(q.course)[0].querySelector('.jsp-card-date-range')?.textContent==='2026-11-03 through 2026-11-04','Notebook lost duration');assert(cards(q.ongoing)[0].querySelector('.jsp-card-date-range')?.textContent==='2026-10-20 through 2026-11-04','Notebook clipped source date');surface.contentEl.querySelector('[aria-label="Tasks"]').click();assert(surface.contentEl.querySelectorAll('.jsp-task').length===1,'Tasks duplicated');surface.contentEl.querySelector('[aria-label="Switch to board"]').click();`);
  check('clearing or remapping End date changes geometry without rewriting source notes', String.raw`const before=await app.vault.read(p.file(q.course));v.config.set('endDateProperty',null);await wait(()=>cards(q.course)[0]?.offsetWidth===120);assert(await app.vault.read(p.file(q.course))===before,'Clearing end rewrote note');v.config.set('endDateProperty','note.finish');await wait(()=>cards(q.course)[0]?.offsetWidth===540);assert(await app.vault.read(p.file(q.course))===before,'Remapping end rewrote note');v.config.set('endDateProperty','note.end_date');await wait(()=>cards(q.course)[0]?.offsetWidth===260);`);
} finally {
  try {
    const clean = evaluate(String.raw`const q=window.__jspSpansQA;if(!q)return 'CLEAN';const {p,assert}=q;if(q.leaf)await q.leaf.detach();for(const [path,text]of q.fixtures){const file=app.vault.getAbstractFileByPath(path);if(file)await app.vault.modify(file,text.replace(/\nplanner_type: (entry|thread)\n/,'\nplanner_type: qa-archived\n'))}for(const [path,text]of q.before)assert(await app.vault.read(p.file(path))===text,'Original changed: '+path);assert(await app.vault.adapter.read(q.settingsPath)===q.settings,'Classic settings changed');if(q.active)await app.workspace.revealLeaf(q.active);return 'CLEAN';`);
    if (!clean.includes('CLEAN')) throw Error(clean);
  } finally { run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":false}'); }
}
const errors = run('dev:errors'); if (!errors.includes('No errors captured.')) throw Error(errors);
console.log(JSON.stringify({ vault: canonical, checks: passed.length, passed }, null, 2));
