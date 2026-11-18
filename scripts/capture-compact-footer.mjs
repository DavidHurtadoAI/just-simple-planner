import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = path.resolve(repo, '../../@Nexus-dev');
const cli = 'C:\\Program Files\\Obsidian\\Obsidian.com';
function run(...args) {
  const out = execFileSync(cli, ['vault=@Nexus-dev', ...args], { encoding: 'utf8', timeout: 30000, windowsHide: true }).trim();
  if (/^Error:/m.test(out)) throw Error(out);
  return out;
}
function evaluate(fn) {
  return run('eval', 'code=(async()=>{if(app.vault.adapter.getBasePath()!==' + JSON.stringify(canonical) + ')throw Error("Wrong vault");return await (' + fn.toString() + ')()})()');
}
if (run('vault', 'info=path') !== canonical) throw Error('Wrong vault');
run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":true}');
try {
  console.log(evaluate(async () => {
    const q = window.__jspFooterCapture = { layout: app.workspace.getLayout(), notes: [] };
    const folder = 'Pruebas/Just Simple Planner/Pie compacto QA/' + Date.now();
    let parent = ''; for (const part of folder.split('/')) { parent = parent ? parent + '/' + part : part; if (!app.vault.getAbstractFileByPath(parent)) await app.vault.createFolder(parent); }
    const sources = [
      ['Proyecto Aurora', 'planner_type: thread\ncolor: cyan\norder: 1\n'],
      ['Publicaciones', 'planner_type: thread\ncolor: pink\norder: 2\n'],
      ['Definir el objetivo', 'planner_type: entry\ndate: 2026-11-18\nthread: "[[' + folder + '/Proyecto Aurora]]"\n'],
      ['Redactar la propuesta', 'planner_type: entry\ndate: 2026-11-19\nthread: "[[' + folder + '/Proyecto Aurora]]"\n'],
      ['Revisar con el equipo', 'planner_type: entry\ndate: 2026-11-20\nthread: "[[' + folder + '/Proyecto Aurora]]"\n'],
      ['Preparar la publicación', 'planner_type: entry\ndate: 2026-11-18\nthread: "[[' + folder + '/Publicaciones]]"\n'],
      ['Publicar el resultado', 'planner_type: entry\ndate: 2026-11-21\nthread: "[[' + folder + '/Publicaciones]]"\n']
    ];
    for (const [title, properties] of sources) {
      const name = folder + '/' + title + '.md'; if (app.vault.getAbstractFileByPath(name)) throw Error('Capture fixture exists');
      await app.vault.create(name, '---\n' + properties + '---\n'); q.notes.push(name);
    }
    const name = folder + '/Planner del ejemplo QA.base';
    const file = await app.vault.create(name, JSON.stringify({ filters: { and: ['file.ext == "md"', 'file.inFolder(' + JSON.stringify(folder) + ')', 'note.planner_type != "qa-archived"'] }, views: [{ type: 'just-simple-planner-bases', name: 'Planner', dayWidth: '190' }] }));
    const leaf = app.workspace.getLeaf('tab'); await leaf.openFile(file);
    for (let i = 0; i < 200; i++) {
      const view = leaf.view.controller?.view;
      if (view?.session.entries.size >= 5) { q.view = view; break; }
      await new Promise(r => setTimeout(r, 25));
    }
    if (!q.view) throw Error('Planner example did not load');
    await q.view.surface.setState({ mode: 'board', firstDay: '2026-10-19', scrollLeft: 5700, scrollTop: 0, collapsed: [], search: '', status: 'all', showTasks: false });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const footer = q.view.parentEl.querySelector('.jsp-footer');
    const height = footer.getBoundingClientRect().height;
    const gap = q.view.parentEl.getBoundingClientRect().bottom - footer.getBoundingClientRect().bottom;
    if (height > 20 || Math.abs(gap) > 1) throw Error('Footer not compact');
    return JSON.stringify({ footerHeight: height, bottomGap: gap, fixture: name });
  }));
  run('dev:cdp', 'method=Input.dispatchMouseEvent', 'params={"type":"mouseMoved","x":40,"y":40,"buttons":0}');
  evaluate(async () => { await new Promise(resolve => setTimeout(resolve, 200)); return 'READY'; });
  console.log(run('dev:screenshot', 'path=' + path.join(repo, 'docs/images/bases-compact-footer.png')));
} finally {
  try { console.log(evaluate(async () => {
    const layout = window.__jspRetirementLayout ?? window.__jspFooterCapture?.layout;
    if (layout) await app.workspace.changeLayout(layout);
    for (const name of window.__jspFooterCapture?.notes ?? []) {
      const file = app.vault.getAbstractFileByPath(name); if (!file) continue;
      const text = await app.vault.read(file); await app.vault.modify(file, text.replace(/planner_type: (entry|thread)/, 'planner_type: qa-archived'));
    }
    return 'Workspace restored; additive capture Base retained';
  })); } finally { run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":false}'); }
}
