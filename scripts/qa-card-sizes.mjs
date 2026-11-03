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
const guard = `if(app.vault.adapter.getBasePath()!==${JSON.stringify(canonical)})throw Error('Wrong vault');const p=app.plugins.getPlugin('just-simple-planner');if(!p)throw Error('Plugin not loaded');`;
function evaluate(code) { return run('eval', `code=(async()=>{${guard}${code}})()`); }
function state(code) { return evaluate(`const q=window.__jspCardSizesQA;const {view,root,assert,card,wait}=q;${code}`); }
const passed = [];
function check(name, code) {
  const output = state(`${code}return 'PASS';`);
  if (!output.includes('PASS')) throw Error(`${name}: ${output}`);
  passed.push(name); console.log(`PASS ${name}`);
}

function cleanup() {
  const output=evaluate(`const q=window.__jspCardSizesQA;if(!q)return 'CLEAN';if(q.prepared)for(const fixture of q.fixtures){const file=app.vault.getAbstractFileByPath(fixture.path);if(file)await app.vault.modify(file,fixture.archived)}await p.reloadIndex();q.view.render();for(const [file,text]of q.before)q.assert(await app.vault.read(p.file(file))===text,'Changed existing note: '+file);return 'CLEAN';`);
  if(!output.includes('CLEAN'))throw Error(output);
}
if (process.argv.includes('--cleanup')) { cleanup(); console.log('QA fixtures archived; original notes unchanged.'); process.exit(0); }
let completed = false;
run('dev:debug', 'on');
run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":true}');
try {
  const setup = evaluate(String.raw`
    await p.reloadIndex();await p.openPlanner();
    const view=app.workspace.getLeavesOfType('just-simple-planner')[0].view.surface;
    const root=view.contentEl;
    const assert=(value,message)=>{if(!value)throw Error(message)};
    const wait=async(predicate)=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,25))}throw Error('Timed out')};
    const card=name=>[...root.querySelectorAll('.jsp-card')].find(c=>c.dataset.path===q.folder+'/'+name+'.md');
    const q=window.__jspCardSizesQA={view,root,assert,card,wait,folder:'Pruebas/Just Simple Planner/Tamaños QA/'+Date.now(),fixtures:[],before:new Map()};
    for(const item of [...p.entries.values(),...p.threads.values()])q.before.set(item.path,await app.vault.read(p.file(item.path)));
    const day=new Date();const date=day.getFullYear()+'-'+String(day.getMonth()+1).padStart(2,'0')+'-'+String(day.getDate()).padStart(2,'0');
    q.date=date;
    q.names=['Solo título QA','Con contenido QA','Espacios QA',date+' - Nombre de fichero QA','Título vacío QA'];
    const fm=(type,title,body='',extra='')=>'---\nplanner_type: '+type+'\n'+(title===null?'':'title: '+JSON.stringify(title)+'\n')+'date: '+date+'\nthread: Tamaños QA\n'+extra+'---\n'+body;
    q.fixtures=[
      {path:q.folder+'/Tamaños QA.md',text:'---\nplanner_type: thread\ncolor: pink\norder: -100\n---\n',archived:'---\nplanner_type: qa-archived\ncolor: pink\norder: -100\n---\n'},
      ...q.names.map((name,i)=>({path:q.folder+'/'+name+'.md',text:fm('entry',[ 'Preparar PPT de Raona','Proyecto Contexto Propio','Sin contenido',null,''][i],['\n','[[Proyecto Contexto Propio - Especificación]]\n','\r\n  \t\n','',''][i],i===0?'next: ['+JSON.stringify('[['+q.folder+'/'+q.names[1]+']]')+']\n':'')}))
    ];
    // Use a real thread link; the test changes only its own named fixtures.
    for(const fixture of q.fixtures.slice(1))fixture.text=fixture.text.replace('thread: Tamaños QA','thread: "[['+q.folder+'/Tamaños QA]]"');
    for(const fixture of q.fixtures)fixture.archived??=fixture.text.replace('planner_type: entry','planner_type: qa-archived');
    let folder='';for(const part of q.folder.split('/')){folder=folder?folder+'/'+part:part;if(!app.vault.getAbstractFileByPath(folder))await app.vault.createFolder(folder)}
    for(const fixture of q.fixtures){const file=app.vault.getAbstractFileByPath(fixture.path);if(file)assert(await app.vault.read(file)===fixture.archived,'Differing QA fixture: '+fixture.path)}
    q.prepared=true;
    for(const fixture of q.fixtures){const file=app.vault.getAbstractFileByPath(fixture.path);if(file)await app.vault.modify(file,fixture.text);else await app.vault.create(fixture.path,fixture.text)}
    await wait(()=>q.fixtures.every(f=>app.metadataCache.getFileCache(p.file(f.path))?.frontmatter?.planner_type===(f===q.fixtures[0]?'thread':'entry')));
    await p.reloadIndex();q.thread=q.fixtures[0].path;
    view.revealEntry(p.entries.get(q.fixtures[1].path));view.scroll.scrollTop=0;
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    return 'READY';
  `);
  if (!setup.includes('READY')) throw Error(setup);

  check('frontmatter-only and blank bodies are short; content keeps its preview', `for(const [i,name]of q.names.entries()){const c=card(name);assert(c,'Missing card: '+name);assert(c.offsetHeight===(i===1?116:68),'Wrong height: '+name);assert(Boolean(c.querySelector('.jsp-card-body'))===(i===1),'Wrong preview: '+name);assert(c.querySelector('.jsp-card-menu')&&c.querySelector('.jsp-card-bottom button')&&c.querySelector('.jsp-connection-handle'),'Missing card controls')}assert(card(q.names[0]).querySelector('strong').getBoundingClientRect().height>20,'Long title lost its second line');`);
  check('title property wins and missing or blank titles use the complete filename', `assert(card(q.names[0]).querySelector('strong').textContent==='Preparar PPT de Raona','Title property ignored');assert(card(q.names[3]).querySelector('strong').textContent===q.names[3],'Filename/date prefix was hidden');assert(card(q.names[4]).querySelector('strong').textContent==='Título vacío QA','Empty title fallback changed');`);
  check('mixed same-day cards and the row do not overlap or reserve full-height gaps', `const cards=q.names.map(card).sort((a,b)=>a.offsetTop-b.offsetTop);for(let i=1;i<cards.length;i++)assert(cards[i].offsetTop-cards[i-1].offsetTop-cards[i-1].offsetHeight===16,'Wrong vertical spacing');const row=cards[0].closest('.jsp-row');assert(cards.at(-1).offsetTop+cards.at(-1).offsetHeight<row.offsetHeight,'Row clips the final card');`);
  check('arrows use the actual centers of short and normal cards', `view.drawEdges();const edge=[...root.querySelectorAll('.jsp-connection')].find(e=>e.dataset.source===q.fixtures[1].path);assert(edge,'Connection missing');const source=card(q.names[0]).getBoundingClientRect();const board=view.stage.getBoundingClientRect();const start=edge.querySelector('path').getAttribute('d').match(/^M ([\\d.-]+) ([\\d.-]+)/);assert(Math.abs(Number(start[2])-(source.top+source.height/2-board.top))<1,'Arrow is not centered');`);
  check('editing body content grows the card and undo shrinks it again', `const fixture=q.fixtures[1];const entry=p.entries.get(fixture.path);await p.patch([{path:entry.path,body:'Contenido añadido en la prueba.\\n',expectedBody:entry.body}]);await wait(()=>card(q.names[0])?.offsetHeight===116);await p.history.undo();await wait(()=>card(q.names[0])?.offsetHeight===68);assert(await app.vault.read(p.file(fixture.path))===fixture.text,'Undo changed the note');`);
  check('folding keeps all cards compact and expanding restores both sizes', `view.collapsed.add(q.thread);view.render();for(const name of q.names)assert(card(name).offsetHeight===24,'Folded height changed');view.collapsed.delete(q.thread);view.render();assert(card(q.names[0]).offsetHeight===68&&card(q.names[1]).offsetHeight===116,'Expanded sizes changed');`);
  check('notebook title-only cards also omit the blank preview', `view.mode='notebook';view.activeThread=q.thread;view.render();const short=card(q.names[0]),full=card(q.names[1]);assert(!short.querySelector('.jsp-card-body')&&full.querySelector('.jsp-card-body'),'Wrong notebook body');assert(short.offsetHeight<full.offsetHeight,'Notebook did not shrink');view.mode='board';view.render();`);

  if (process.argv.includes('--preview')) {
    console.log('Preview fixtures remain active for visual inspection; rerun with --cleanup afterward.');
  }
  completed = true;
} finally {
  if (!completed || !process.argv.includes('--preview')) cleanup();
  run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":false}');
}
console.log(JSON.stringify({vault:canonical,checks:passed.length,passed},null,2));
