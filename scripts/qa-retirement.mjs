import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const canonical = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../@Nexus-dev');
const cli = 'C:\\Program Files\\Obsidian\\Obsidian.com';
function run(...args) {
  const out = execFileSync(cli, ['vault=@Nexus-dev', ...args], { encoding: 'utf8', timeout: 60000, windowsHide: true }).trim();
  if (/^Error:/m.test(out)) throw Error(out);
  return out;
}
function state(fn) {
  const out = run('eval', 'code=(async()=>{if(app.vault.adapter.getBasePath()!==' + JSON.stringify(canonical) + ')throw Error("Wrong vault");return await (' + fn.toString() + ')(window.__jspRetirementQA)})()');
  const result = out.lastIndexOf('=>');
  if (result < 0) throw Error(out);
  return out.slice(result + 2).trim();
}
const passed = [];
function check(name, fn) { console.log('CHECK ' + name); const result = state(fn); if (result !== 'PASS') throw Error(name + ': ' + result); passed.push(name); console.log('PASS ' + name); }
if (run('vault', 'info=path') !== canonical) throw Error('Wrong vault');
run('dev:debug', 'on'); run('dev:errors', 'clear');
run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":true}');
try {
  state(async () => {
    const p = app.plugins.getPlugin('just-simple-planner');
    if (p?.manifest.version !== '0.6.0') throw Error('Install and reload 0.6.0 before testing');
    const q = window.__jspRetirementQA = { p, layout: app.workspace.getLayout(), settings: p.settings, folder: 'Pruebas/Just Simple Planner/Retirada legacy QA/' + Date.now(), notes: [], leaves: [] };
    q.assert = (ok, message) => { if (!ok) throw Error(message); };
    q.wait = async fn => { for (let i = 0; i < 240; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 25)); } throw Error('Timed out'); };
    q.settingsPath = app.vault.configDir + '/plugins/just-simple-planner/data.json';
    q.settingsText = await app.vault.adapter.read(q.settingsPath);
    let parent = ''; for (const part of q.folder.split('/')) { parent = parent ? parent + '/' + part : part; if (!app.vault.getAbstractFileByPath(parent)) await app.vault.createFolder(parent); }
    q.thread = q.folder + '/Proyecto Aurora QA.md'; q.empty = q.folder + '/Hilo vacío QA.md';
    q.a = q.folder + '/Preparar propuesta QA.md'; q.b = q.folder + '/Revisar propuesta QA.md'; q.ordinary = q.folder + '/Nota ordinaria QA.md';
    q.notes = [
      [q.thread, '---\nplanner_type: thread\ncolor: cyan\nstatus: active\norder: -100\n---\n'],
      [q.empty, '---\nplanner_type: thread\ncolor: pink\nstatus: parked\norder: -99\n---\n'],
      [q.a, '---\nplanner_type: entry\nheadline: Preparar propuesta QA\nfecha: 2026-11-18\nproject: "[[' + q.thread.slice(0, -3) + ']]"\nfollowing: []\nextra: conservar\n---\nContenido de prueba.\n\n- [ ] Revisar presupuesto.\n'],
      [q.b, '---\nplanner_type: entry\nheadline: Revisar propuesta QA\nfecha: 2026-11-19\nproject: "[[' + q.thread.slice(0, -3) + ']]"\nfollowing: []\n---\n'],
      [q.ordinary, '---\nfecha: 2026-11-20\n---\nNota sin marcador de Planner.\n']
    ];
    for (const [name, text] of q.notes) { q.assert(!app.vault.getAbstractFileByPath(name), 'Fixture exists'); await app.vault.create(name, text); }
    await q.wait(() => q.notes.every(([name]) => app.metadataCache.getFileCache(p.file(name))));
    p.settings = { ...p.settings, dayWidth: 140, propertyNames: { date: 'fecha', title: 'headline', thread: 'project', next: 'following' } };
    q.basePath = q.folder + '/Planner migrado QA.base';
    q.button = (label, modal = p.migrationModal) => [...modal.contentEl.querySelectorAll('button')].find(b => b.textContent === label);
    q.setPath = name => { const input = p.migrationModal.contentEl.querySelector('input'); input.value = name; input.dispatchEvent(new Event('input', { bubbles: true })); };
    q.openReview = async () => { p.openMigration(); await q.wait(() => p.migrationModal?.snapshot || p.migrationModal?.error.textContent); q.assert(p.migrationModal.snapshot, p.migrationModal.error.textContent); };
    return 'READY';
  });
  check('old workspace tabs restore a migration page without a classic board', async q => {
    q.legacy = app.workspace.getLeaf('tab'); q.leaves.push(q.legacy);
    q.legacyState = { mode: 'board', firstDay: '2026-10-21', scrollLeft: 3920, scrollTop: 0, collapsed: [q.empty], search: '', status: 'all' };
    await q.legacy.setViewState({ type: 'just-simple-planner', state: q.legacyState, active: true });
    q.assert(q.legacy.view.contentEl.textContent.includes('has been retired'), 'Missing retirement page');
    q.assert(!q.legacy.view.contentEl.querySelector('.jsp-view'), 'Classic board retained');
    q.assert(JSON.stringify(q.legacy.view.getState()) === JSON.stringify(q.legacyState), 'Saved view state lost');
    return 'PASS';
  });
  check('classic note discovery is read-only and uses retained custom settings', async q => {
    app.commands.executeCommandById('just-simple-planner:create-bases-planner');
    await q.wait(() => q.p.migrationModal?.snapshot);
    const snapshot = q.p.migrationModal.snapshot;
    q.assert(snapshot.entries.has(q.a) && snapshot.entries.has(q.b) && !snapshot.entries.has(q.ordinary), 'Classic membership changed');
    q.assert(snapshot.threads.has(q.empty) && snapshot.entries.get(q.a).thread === q.thread, 'Thread lost');
    q.assert(snapshot.settings.propertyNames.date === 'fecha' && snapshot.settings.dayWidth === 140, 'Mapping lost');
    q.setPath(q.basePath); q.button('Create Base').click();
    await q.wait(() => app.workspace.getLeavesOfType('bases').some(l => l.view.file?.path === q.basePath && l.view.controller?.view?.config.get('migrationVerified') === true));
    q.leaf = app.workspace.getLeavesOfType('bases').find(l => l.view.file?.path === q.basePath); q.leaves.push(q.leaf);
    q.view = q.leaf.view.controller.view; q.s = q.view.session;
    q.p.settings = q.settings;
    return 'PASS';
  });
  check('migration preserves note bytes, empty threads, custom properties and saved tab state', async q => {
    for (const [name, text] of q.notes) q.assert(await app.vault.read(q.p.file(name)) === text, 'Migration rewrote ' + name);
    q.assert(q.s.settings.propertyNames.date === 'fecha' && q.s.threads.has(q.empty), 'Per-Base configuration lost');
    q.assert(q.view.surface.getState().collapsed.includes(q.empty), 'Old collapsed rows lost');
    q.assert(await app.vault.adapter.read(q.settingsPath) === q.settingsText, 'Settings file changed');
    q.assert(!('entries' in q.p) && !('history' in q.p) && typeof q.p.reloadIndex === 'undefined', 'Global classic controller retained');
    return 'PASS';
  });
  check('the retained open command opens Bases and never recreates a classic timeline', async q => {
    await app.workspace.revealLeaf(q.leaf);
    const count = app.workspace.getLeavesOfType('just-simple-planner').length;
    app.commands.executeCommandById('just-simple-planner:open-planner');
    await new Promise(r => setTimeout(r, 100));
    q.assert(app.workspace.getLeavesOfType('just-simple-planner').length === count, 'Created a classic tab');
    q.assert(q.p.activePlanner() === q.view, 'Did not retain the active planner');
    return 'PASS';
  });
  check('retained new-entry and new-thread commands use the active Base editors', async q => {
    for (const [command, selector] of [['new-entry', '.jsp-entry-modal'], ['new-thread', '.modal']]) {
      app.commands.executeCommandById('just-simple-planner:' + command);
      await q.wait(() => document.querySelector(selector));
      const modal = [...document.querySelectorAll('.modal')].at(-1);
      q.assert(modal.textContent.includes(command === 'new-entry' ? 'New entry' : 'New thread'), 'Wrong editor');
      [...modal.querySelectorAll('button')].find(b => b.textContent === 'Cancel').click();
      await q.wait(() => !modal.isConnected);
    }
    return 'PASS';
  });
  check('retained membership commands choose a Base and use its mapping without a global writer', async q => {
    for (const [command, source] of [['add-active-note', q.ordinary], ['remove-active-note', q.a]]) {
      const leaf = app.workspace.getLeaf('tab'); q.leaves.push(leaf); await leaf.openFile(q.p.file(source));
      app.commands.executeCommandById('just-simple-planner:' + command);
      await q.wait(() => document.querySelector('.prompt-input'));
      const input = document.querySelector('.prompt-input'); input.value = q.basePath; input.dispatchEvent(new Event('input', { bubbles: true }));
      await q.wait(() => [...document.querySelectorAll('.suggestion-item')].some(item => item.textContent === q.basePath));
      [...document.querySelectorAll('.suggestion-item')].find(item => item.textContent === q.basePath).click();
      await q.wait(() => document.querySelector('.jsp-membership-modal'));
      const modal = document.querySelector('.jsp-membership-modal');
      q.assert(modal.textContent.includes(source), 'Review targeted another note');
      if (command === 'add-active-note') q.assert(modal.textContent.includes('fecha'), 'Selected Base mapping lost');
      [...modal.querySelectorAll('button')].find(button => button.textContent === 'Cancel').click();
      await q.wait(() => !modal.isConnected);
    }
    return 'PASS';
  });
  check('footer uses one compact line with no native Bases bottom padding', async q => {
    const footer = q.view.parentEl.querySelector('.jsp-footer'), frame = q.view.parentEl.getBoundingClientRect(), rect = footer.getBoundingClientRect();
    q.assert(getComputedStyle(q.view.parentEl).paddingBottom === '0px', 'Native 60px bottom padding retained');
    q.assert(rect.height > 0 && rect.height <= 20, 'Footer too tall: ' + rect.height);
    q.assert(Math.abs(frame.bottom - rect.bottom) < 2, 'Blank area below footer: ' + (frame.bottom - rect.bottom));
    q.assert(footer.textContent.includes('entries') && footer.title.includes('entries'), 'Summary lost');
    q.metrics = { footerHeight: rect.height, bottomGap: frame.bottom - rect.bottom };
    return 'PASS';
  });
  check('compact footer remains one line in a narrow planner and in Notebook', async q => {
    const parent = q.view.parentEl, previous = parent.style.width;
    try {
      parent.style.width = '380px';
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      q.assert(parent.querySelector('.jsp-footer').getBoundingClientRect().height <= 20, 'Narrow footer wrapped');
      await q.view.surface.setState({ ...q.view.surface.getState(), mode: 'notebook', activeThread: q.thread });
      q.assert(parent.querySelector('.jsp-footer').getBoundingClientRect().height <= 20, 'Notebook footer expanded');
    } finally { parent.style.width = previous; await q.view.surface.setState({ ...q.view.surface.getState(), mode: 'board', collapsed: [] }); }
    return 'PASS';
  });
  check('editing a custom-mapped entry and undo preserve all original bytes', async q => {
    const before = await app.vault.read(q.p.file(q.a));
    await q.s.patch([{ path: q.a, fields: { title: 'Propuesta revisada QA' }, expectedText: before }]);
    await q.wait(() => q.s.entries.get(q.a)?.title === 'Propuesta revisada QA');
    q.assert((await app.vault.read(q.p.file(q.a))).includes('extra: conservar'), 'Unrelated property lost');
    await q.s.history.undo(); await q.wait(() => q.s.entries.get(q.a)?.title === 'Preparar propuesta QA');
    q.assert(await app.vault.read(q.p.file(q.a)) === before, 'Undo changed bytes');
    return 'PASS';
  });
  check('connections and task completion still support exact undo in Bases', async q => {
    const before = await app.vault.read(q.p.file(q.a));
    await q.s.connect(q.a, q.b); await q.wait(() => q.s.entries.get(q.a)?.next.includes(q.b));
    await q.s.history.undo(); await q.wait(() => !q.s.entries.get(q.a)?.next.includes(q.b));
    const entry = q.s.entries.get(q.a), line = entry.body.split(/\r?\n/).findIndex(s => s.includes('- [ ]'));
    await q.s.toggleEntryTask(entry, line, true); await q.wait(() => q.s.entries.get(q.a)?.body.includes('- [x]'));
    await q.s.history.undo(); await q.wait(() => q.s.entries.get(q.a)?.body.includes('- [ ]'));
    q.assert(await app.vault.read(q.p.file(q.a)) === before, 'Undo changed note');
    return 'PASS';
  });
  check('migration rejects stale source edits and stale mappings until review is refreshed', async q => {
    q.p.settings = { ...q.settings, propertyNames: { date: 'fecha', title: 'headline', thread: 'project', next: 'following' } };
    await q.openReview(); const target = q.folder + '/Revisión actualizada QA.base'; q.setPath(target);
    await app.vault.modify(q.p.file(q.a), (await app.vault.read(q.p.file(q.a))) + '\nRevisión externa de prueba.\n');
    q.button('Create Base').click();
    await q.wait(() => q.p.migrationModal.error.textContent.includes('changed'));
    q.assert(!app.vault.getAbstractFileByPath(target), 'Created from a stale snapshot');
    q.button('Refresh review').click(); await q.wait(() => q.p.migrationModal.snapshot && !q.button('Create Base').disabled);
    q.p.settings = { ...q.p.settings, dayWidth: q.p.settings.dayWidth === 250 ? 140 : 250 };
    q.button('Create Base').click(); await q.wait(() => q.p.migrationModal.error.textContent.includes('changed'));
    q.assert(!app.vault.getAbstractFileByPath(target), 'Created from stale settings');
    q.button('Refresh review').click(); await q.wait(() => q.p.migrationModal.snapshot && !q.button('Create Base').disabled);
    q.button('Create Base').click();
    await q.wait(() => app.vault.getAbstractFileByPath(target) && !document.querySelector('.jsp-migration-modal'));
    q.p.settings = q.settings;
    return 'PASS';
  });
  check('existing paths and traversal fail safely and the migration control recovers', async q => {
    await q.openReview();
    const before = await app.vault.read(q.p.file(q.basePath));
    for (const destination of [q.basePath, '../Fuera QA.base']) {
      q.setPath(destination); q.button('Create Base').click();
      await q.wait(() => q.p.migrationModal.error.textContent && !q.button('Create Base').disabled);
    }
    q.assert(await app.vault.read(q.p.file(q.basePath)) === before, 'Existing Base overwritten');
    q.button('Cancel').click(); await q.wait(() => !document.querySelector('.jsp-migration-modal'));
    return 'PASS';
  });
  check('a new review rediscovers a note whose classic marker was removed', async q => {
    const before = await app.vault.read(q.p.file(q.b));
    await app.vault.modify(q.p.file(q.b), before.replace('planner_type: entry', 'planner_type: qa-archived'));
    await q.wait(() => app.metadataCache.getFileCache(q.p.file(q.b))?.frontmatter?.planner_type === 'qa-archived');
    q.p.settings = { ...q.settings, propertyNames: { date: 'fecha', title: 'headline', thread: 'project', next: 'following' } };
    await q.openReview();
    q.assert(!q.p.migrationModal.snapshot.entries.has(q.b), 'Removed marker retained in discovery');
    q.button('Cancel').click(); q.p.settings = q.settings;
    return 'PASS';
  });
  check('disabled Bases prevents creation without altering saved notes or settings', async q => {
    q.p.basesAvailable = false;
    try {
      q.p.openMigration();
      await q.wait(() => q.p.migrationModal.error.textContent.includes('Enable'));
      q.assert(q.button('Create Base').disabled, 'Creation enabled without Bases');
      q.button('Cancel').click();
    } finally { q.p.basesAvailable = true; }
    q.assert(await app.vault.adapter.read(q.settingsPath) === q.settingsText, 'Saved settings changed');
    return 'PASS';
  });
} catch (error) {
  console.error('Retirement scenario failed:', error);
  throw error;
} finally {
  try { state(async q => {
    if (!q) return 'CLEAN';
    q.p.migrationModal?.close(); q.p.settings = q.settings; q.p.basesAvailable = true;
    for (const [name] of q.notes) {
      const file = app.vault.getAbstractFileByPath(name); if (!file) continue;
      const text = await app.vault.read(file);
      const archived = text.includes('planner_type:') ? text.replace(/planner_type: (entry|thread)/, 'planner_type: qa-archived') : text.replace('---\n', '---\nplanner_type: qa-archived\n');
      if (archived !== text) await app.vault.modify(file, archived);
    }
    await app.workspace.changeLayout(q.layout);
    q.assert(await app.vault.adapter.read(q.settingsPath) === q.settingsText, 'Settings changed');
    return 'CLEAN';
  }); } finally {
    run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":false}');
  }
}
const errors = run('dev:errors');
if (!errors.includes('No errors captured.')) throw Error(errors);
console.log(JSON.stringify({ vault: canonical, checks: passed.length, passed, metrics: JSON.parse(state(q => JSON.stringify(q.metrics))) }, null, 2));
