import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = path.resolve(repo, '../../@Nexus-dev');
const images = path.join(repo, 'docs/images');
mkdirSync(images, { recursive: true });
const cli = 'C:\\Program Files\\Obsidian\\Obsidian.com';
function run(...args) {
  const output = execFileSync(cli, ['vault=@Nexus-dev', ...args], { encoding: 'utf8', timeout: 20000, maxBuffer: 24 * 1024 * 1024, windowsHide: true }).trim();
  if (/^Error:/m.test(output)) throw Error(output);
  return output;
}
if (run('vault', 'info=path') !== canonical) throw Error('Wrong vault.');
const guard = `if(app.vault.adapter.getBasePath()!==${JSON.stringify(canonical)})throw Error('Wrong vault');`;
function evaluate(code) { const output = run('eval', `code=(async()=>{${guard}${code}})()`); if (!output.startsWith('=>')) throw Error(output); return output.slice(2).trim(); }
function state(code) { return evaluate(`const q=window.__jspDocs;const {p,view}=q;${code}`); }
function cdp(method, params = {}) { return JSON.parse(run('dev:cdp', `method=${method}`, `params=${JSON.stringify(params)}`)); }
function capture(name) {
  if (name !== 'connect') {
    const blank = JSON.parse(state(`const r=view.contentEl.getBoundingClientRect();return JSON.stringify({x:r.left+5,y:r.top+5});`));
    mouse('mouseMoved', blank);
  }
  const rect = JSON.parse(state(`const r=view.contentEl.getBoundingClientRect();const rows=[...view.contentEl.querySelectorAll('.jsp-row')];const last=rows[rows.length-1];const height=view.mode==='board'&&last&&!document.querySelector('.jsp-entry-modal')?Math.min(r.height,last.getBoundingClientRect().bottom-r.top+6):r.height;return JSON.stringify({x:r.x,y:r.y,width:r.width,height,scale:1});`));
  const result = cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: rect });
  writeFileSync(path.join(images, `${name}.png`), Buffer.from(result.data, 'base64'));
  console.log(`Captured ${name}.png`);
}
function mouse(type, point, pressed = false) { cdp('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, ...(type === 'mouseMoved' && !pressed ? {} : { button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }) }); }

try {
  cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  cdp('Emulation.setDeviceMetricsOverride', { width: 1540, height: 1120, deviceScaleFactor: 1, mobile: false });
  evaluate(`const p=app.plugins.getPlugin('just-simple-planner');await p.openPlanner();const view=app.workspace.getLeavesOfType('just-simple-planner')[0].view;window.__jspDocs={p,view,original:{state:view.getState(),search:view.search,status:view.status,tasks:view.showTasks,width:p.settings.dayWidth,left:view.scroll.scrollLeft,top:view.scroll.scrollTop},count:p.entries.size};p.settings.dayWidth=140;view.mode='board';view.collapsed=new Set();view.search='';view.status='all';view.showTasks=false;view.focusPath=null;view.firstDay='2026-10-01';view.initialScroll=false;view.render();view.scroll.scrollLeft=25*140;view.scroll.scrollTop=0;return 'READY';`);
  capture('board');

  state(`q.thread=[...p.threads.values()].find(t=>t.title==='Publicaciones y contenidos');view.collapsed.add(q.thread.path);view.render();const row=[...view.contentEl.querySelectorAll('.jsp-row')].find(r=>r.dataset.thread===q.thread.path);if(row.querySelectorAll('.jsp-card.is-compact').length!==5||row.querySelector('.jsp-card-body')||row.style.height!=='46px')throw Error('Collapsed preview validation failed');if(row.querySelectorAll('.jsp-card-menu').length!==5||row.querySelectorAll('.jsp-connection-handle').length!==5)throw Error('Compact entry actions missing');return 'Compact previews verified';`);
  capture('folded-thread');
  state(`view.collapsed.clear();view.render();if(view.contentEl.querySelectorAll('.jsp-card.is-compact').length)throw Error('Expanded previews not restored');view.focusPath=[...p.entries.values()].find(e=>e.title==='Probar conexiones entre entradas').path;view.render();return 'READY';`);
  capture('spotlight');

  state(`view.focusPath=null;view.render();q.source=[...p.entries.values()].find(e=>e.title==='Preparar los ejemplos del taller');q.target=[...p.entries.values()].find(e=>e.title==='Preparar la estructura del artículo');return 'READY';`);
  const points = JSON.parse(state(`const source=view.renderedCards.get(q.source.path),target=view.renderedCards.get(q.target.path);const a=source.getBoundingClientRect(),h=source.querySelector('.jsp-connection-handle').getBoundingClientRect(),b=target.getBoundingClientRect();return JSON.stringify({hover:{x:a.left+a.width/2,y:a.top+a.height/2},start:{x:h.left+h.width/2,y:h.top+h.height/2},target:{x:b.left+b.width/2,y:b.top+b.height/2}});`));
  mouse('mouseMoved', points.hover); mouse('mousePressed', points.start); mouse('mouseMoved', points.target, true);
  state(`if(view.linking?.target!==q.target.path)throw Error('Connection preview target not detected');return 'READY';`);
  capture('connect');
  state(`view.finishConnection(false);return 'CANCELLED';`); mouse('mouseReleased', points.target);

  state(`view.mode='notebook';view.activeThread=q.source.thread;view.showTasks=true;view.render();view.scroll.scrollTop=0;return 'READY';`);
  capture('notebook-tasks');
  state(`view.mode='board';view.showTasks=false;view.render();view.scroll.scrollLeft=25*140;p.editEntry([...p.entries.values()].find(e=>e.title==='Redactar el primer borrador'));return 'READY';`);
  capture('edit-entry');
  state(`const cancel=[...document.querySelectorAll('.jsp-entry-modal button')].find(b=>b.textContent==='Cancel');if(cancel)cancel.click();if(p.entries.size!==q.count)throw Error('Screenshot session changed entry count');return 'Screenshots and collapsed preview checks passed';`);
} finally {
  evaluate(`const q=window.__jspDocs;if(q){const v=q.view;v.finishConnection(false);q.p.settings.dayWidth=q.original.width;v.mode=q.original.state.mode;v.firstDay=q.original.state.firstDay;v.collapsed=new Set(q.original.state.collapsed);v.activeThread=q.original.state.activeThread;v.search=q.original.search;v.status=q.original.status;v.showTasks=q.original.tasks;v.focusPath=null;v.initialScroll=false;v.render();v.scroll.scrollLeft=q.original.left;v.scroll.scrollTop=q.original.top;delete window.__jspDocs;}return 'Original layout restored';`);
  cdp('Emulation.clearDeviceMetricsOverride');
  cdp('Emulation.setFocusEmulationEnabled', { enabled: false });
}
