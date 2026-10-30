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
  const output = evaluate(`const q=window.__jspIndexQA;const {p,assert,wait}=q;${code}`);
  if (!output.startsWith('=>')) throw Error(`No evaluation result: ${output}`);
  return output;
}
const passed = [];
function check(name, code) {
  if (!state(`${code}return 'PASS';`).includes('PASS')) throw Error(name);
  passed.push(name); console.log(`PASS ${name}`);
}

try {
  const setup = evaluate(`const p=app.plugins.getPlugin('just-simple-planner');if(!p||p.entries.size!==20||p.threads.size!==4)throw Error('Expected canonical demo');const q={p,vault:app.vault,before:new Map(),indexed:[],reads:[],enumerations:0,changed:new Map(),folder:'Pruebas/Just Simple Planner/Ensayos QA/Privacidad del índice QA'};q.assert=(ok,msg)=>{if(!ok)throw Error(msg)};q.wait=async(fn)=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,25))}throw Error('Timed out waiting for metadata')};for(const file of [...p.entries.keys(),...p.threads.keys()])q.before.set(file,await app.vault.read(p.file(file)));q.indexText=p.indexText;q.cachedRead=app.vault.cachedRead;q.markdownFiles=app.vault.getMarkdownFiles;window.__jspIndexQA=q;p.indexText=function(file,text){q.indexed.push(file.path);return q.indexText.call(p,file,text)};app.vault.cachedRead=function(file){q.reads.push(file.path);return q.cachedRead.call(app.vault,file)};app.vault.getMarkdownFiles=function(){q.enumerations++;return q.markdownFiles.call(app.vault)};q.events=app.metadataCache.on('changed',(file,text)=>q.changed.set(file.path,text));return 'READY';`);
  if (!setup.includes('READY')) throw Error(setup);

  state(String.raw`q.unrelatedText='---\nplanner_type: qa-archived\n---\n# Nota ajena al planificador\n\nDocumento ficticio de la prueba de privacidad.\n';q.entryText='---\nplanner_type: qa-archived\ntitle: Entrada de privacidad QA\ndate: 2026-10-30\nthread: Privacidad QA\nnext: []\n---\nNota ficticia para comprobar el índice.\n';q.unrelatedPath=q.folder+'/Nota ajena QA.md';q.entryPath=q.folder+'/Entrada de privacidad QA.md';assert(!app.vault.getAbstractFileByPath(q.folder+' - movida'),'Moved folder exists');let folder='';for(const part of q.folder.split('/')){folder=folder?folder+'/'+part:part;if(!app.vault.getAbstractFileByPath(folder))await app.vault.createFolder(folder)}for(const [name,text]of [[q.unrelatedPath,q.unrelatedText],[q.entryPath,q.entryText]]){let file=app.vault.getAbstractFileByPath(name);if(file)assert(await app.vault.read(file)===text,'Differing QA fixture: '+name);else file=await app.vault.create(name,text);if(name===q.unrelatedPath)q.unrelated=file;else q.entry=file}assert(app.vault.getAbstractFileByPath(q.folder).children.every(file=>[q.unrelatedPath,q.entryPath].includes(file.path)),'Foreign files in QA folder');await wait(()=>q.changed.has(q.unrelatedPath)||app.metadataCache.getFileCache(q.unrelated)?.frontmatter?.planner_type==='qa-archived');await wait(()=>q.changed.has(q.entryPath)||app.metadataCache.getFileCache(q.entry)?.frontmatter?.planner_type==='qa-archived');return 'FIXTURES READY';`);

  check('one discovery pass reads only marked planner notes', `await wait(()=>!p.indexRefresh);q.enumerations=0;q.reads=[];p.indexDiscovered=false;await p.reloadIndex();assert(q.enumerations===1,'Discovery was not a single enumeration');assert(q.reads.every(file=>q.before.has(file)),'Discovery read an unrelated note');assert(!q.indexed.includes(q.unrelatedPath)&&!q.indexed.includes(q.entryPath),'Archived notes were parsed');`);
  check('later and overlapping refreshes do not enumerate the vault', `q.enumerations=0;q.reads=[];await Promise.all([p.reloadIndex(),p.reloadIndex()]);assert(q.enumerations===0,'Refresh enumerated the vault');assert(q.reads.every(file=>q.before.has(file)),'Refresh read an unrelated note');`);
  check('editing and renaming an unrelated note never indexes it', String.raw`const edited=q.unrelatedText+'\nEdición ficticia para el ensayo.\n';await app.vault.process(q.unrelated,()=>edited);await wait(()=>q.changed.get(q.unrelated.path)===edited);const renamed=q.folder+'/Nota ajena renombrada QA.md';assert(!app.vault.getAbstractFileByPath(renamed),'Rename destination exists');await app.fileManager.renameFile(q.unrelated,renamed);await p.reloadIndex();assert(!q.indexed.some(file=>file.includes('Nota ajena')),'Unrelated note was parsed');await app.fileManager.renameFile(q.unrelated,q.unrelatedPath);await app.vault.process(q.unrelated,()=>q.unrelatedText);await wait(()=>q.changed.get(q.unrelatedPath)===q.unrelatedText);`);
  check('metadata events discover a newly opted-in note', `q.optedIn=q.entryText.replace('planner_type: qa-archived','planner_type: entry');await app.vault.process(q.entry,()=>q.optedIn);await wait(()=>p.entries.has(q.entryPath));assert(p.entries.size===21,'Opt-in was not discovered');assert(p.entries.get(q.entryPath).body.includes('Nota ficticia'),'Body missing');assert(q.enumerations===0,'Opt-in triggered full discovery');`);
  check('metadata events update a planner note without rescanning', `q.updated=q.optedIn.replace('Nota ficticia','Entrada actualizada');await app.vault.process(q.entry,()=>q.updated);await wait(()=>p.entries.get(q.entryPath)?.snapshot===q.updated);assert(q.enumerations===0,'Edit triggered enumeration');`);
  check('moving a folder preserves its planner entry and ignores unrelated children', `try{await app.fileManager.renameFile(app.vault.getAbstractFileByPath(q.folder),q.folder+' - movida');const moved=q.folder+' - movida/Entrada de privacidad QA.md';await wait(()=>p.entries.has(moved)&&!p.entries.has(q.entryPath));assert(p.entries.get(moved).thread==='text:Privacidad QA','Folder move changed membership');assert(!q.indexed.some(file=>file.includes('Nota ajena')),'Folder move parsed unrelated note')}finally{const moved=app.vault.getAbstractFileByPath(q.folder+' - movida');if(moved)await app.fileManager.renameFile(moved,q.folder)}await wait(()=>p.entries.has(q.entryPath));assert(q.enumerations===0,'Folder move triggered enumeration');`);
  check('opting out removes the card without deleting its file', `await app.vault.process(q.entry,()=>q.entryText);await wait(()=>!p.entries.has(q.entryPath));assert(app.vault.getAbstractFileByPath(q.entryPath),'Opt-out deleted the note');assert(p.entries.size===20,'Opt-out count incorrect');`);
  check('an in-flight cached read cannot replace a newer snapshot', `await wait(()=>!p.indexRefresh);const source=[...p.entries.values()][0],file=p.file(source.path);const before=await app.vault.read(file);let release;let blocked=false;const paused=new Promise(resolve=>{release=resolve});app.vault.cachedRead=async function(note){const text=await q.cachedRead.call(app.vault,note);if(note.path===source.path&&!blocked){blocked=true;await paused}return text};try{const refreshing=p.reloadIndex();await wait(()=>blocked);const newer=before.replace('title:','title: Índice actualizado QA -');p.indexText(file,newer);release();await refreshing;assert(p.entries.get(source.path).snapshot===newer,'Stale read won')}finally{release?.();app.vault.cachedRead=q.cachedRead;p.indexText(file,before);await p.reloadIndex()}`);
  check('scoped CSS keeps zero padding without !important', `await p.openPlanner();const view=app.workspace.getLeavesOfType('just-simple-planner')[0].view;const css=getComputedStyle(view.contentEl);assert([css.paddingTop,css.paddingRight,css.paddingBottom,css.paddingLeft].every(value=>value==='0px'),'Container padding changed');assert(css.overflow==='hidden','Container overflow changed');`);
  check('all original Markdown notes and demo counts are preserved', `for(const [file,text]of q.before)assert(await app.vault.read(p.file(file))===text,'Changed fixture: '+file);assert(p.entries.size===20&&p.threads.size===4,'Demo counts changed');assert(!p.invalid.size,'Invalid note introduced');`);
  const errors=run('dev:errors');
  if (!errors.includes('No errors captured.')) throw Error(errors);
  passed.push('no Obsidian errors');
  console.log(JSON.stringify({vault:canonical,checks:passed.length,passed},null,2));
} finally {
  console.log(evaluate(`const q=window.__jspIndexQA;if(q){const p=q.p;app.vault.cachedRead=q.cachedRead;app.vault.getMarkdownFiles=q.markdownFiles;p.indexText=q.indexText;if(q.events)app.metadataCache.offref(q.events);const moved=app.vault.getAbstractFileByPath(q.folder+' - movida');if(moved)await app.fileManager.renameFile(moved,q.folder);if(q.unrelated&&q.unrelated.path!==q.unrelatedPath)await app.fileManager.renameFile(q.unrelated,q.unrelatedPath);for(const [file,text]of [[q.unrelated,q.unrelatedText],[q.entry,q.entryText]])if(file&&text&&await app.vault.read(file)!==text)await app.vault.process(file,()=>text);await p.reloadIndex();delete window.__jspIndexQA;}return 'Index test state restored; QA notes retained as archived';`));
}
