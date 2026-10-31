import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = path.resolve(repo, '../../@Nexus-dev');
const cli = 'C:\\Program Files\\Obsidian\\Obsidian.com';
function run(...args) {
  const out = execFileSync(cli, ['vault=@Nexus-dev', ...args], { encoding: 'utf8', timeout: 20000, maxBuffer: 24 * 1024 * 1024, windowsHide: true }).trim();
  if (/^Error:/m.test(out)) throw Error(out);
  return out;
}
if (run('vault', 'info=path') !== canonical) throw Error('Wrong vault.');
const dataPath = path.join(canonical, '.obsidian/plugins/just-simple-planner/data.json');
const before = readFileSync(dataPath);
function evaluate(code) {
  const out = run('eval', `code=(async()=>{if(app.vault.adapter.getBasePath()!==${JSON.stringify(canonical)})throw Error('Wrong vault');${code}})()`);
  if (!out.startsWith('=>')) throw Error(out);
  return out.slice(2).trim();
}
function state(code) { return evaluate(`const q=window.__jspSettingsCapture;${code}`); }
function cdp(method, params = {}) { return JSON.parse(run('dev:cdp', `method=${method}`, `params=${JSON.stringify(params)}`)); }
function capture(name, heading, endHeading) {
  state(`const header=q.heading(${JSON.stringify(heading)});q.scroller.scrollTop+=header.getBoundingClientRect().top-q.scroller.getBoundingClientRect().top-8;await new Promise(r=>setTimeout(r,160));return 'SCROLLED';`);
  const rect = JSON.parse(state(`const r=q.scroller.getBoundingClientRect();const y=Math.max(r.top+2,q.heading(${JSON.stringify(heading)}).getBoundingClientRect().top-8);const end=${endHeading ? `q.heading(${JSON.stringify(endHeading)}).getBoundingClientRect().top-10` : `q.row('Day width').getBoundingClientRect().bottom+12`};return JSON.stringify({x:Math.round(r.left+4),y:Math.round(y),width:Math.round(r.width-20),height:Math.round(Math.min(r.bottom-2,end)-y)});`));
  // Obsidian 1.15 opens Settings in a separate native window. Capture that
  // window's actual webContents instead of the main vault's CDP target.
  const png = state(`return (await q.captureWindow.webContents.capturePage(${JSON.stringify(rect)})).toPNG().toString('base64');`);
  writeFileSync(path.join(repo, 'docs/images', `${name}.png`), Buffer.from(png, 'base64'));
  console.log(`Captured ${name}.png (${Math.round(rect.width)} x ${Math.round(rect.height)})`);
}

try {
  cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  cdp('Emulation.setDeviceMetricsOverride', { width: 1540, height: 1400, deviceScaleFactor: 1, mobile: false });
  evaluate(`const p=app.plugins.getPlugin('just-simple-planner');const original=p.settings;window.__jspSettingsCapture={p,original};p.settings=new p.constructor(app,p.manifest).settings;p.settingsTab.synchronize();app.setting.open();app.setting.openTabById('just-simple-planner');const q=window.__jspSettingsCapture;q.tab=app.setting.pluginTabs.find(tab=>tab.id==='just-simple-planner');q.row=name=>[...q.tab.containerEl.querySelectorAll('.setting-item')].find(row=>row.querySelector('.setting-item-name')?.textContent===name);q.heading=name=>[...q.tab.containerEl.querySelectorAll('*')].find(el=>!el.children.length&&el.textContent===name);let scroller=q.tab.containerEl;while(scroller&&!(scroller.scrollHeight>scroller.clientHeight+5&&/auto|scroll/.test(getComputedStyle(scroller).overflowY)))scroller=scroller.parentElement;q.scroller=scroller??q.tab.containerEl;await new Promise(r=>setTimeout(r,160));return 'READY';`);
  state(`const windows=require('electron').remote.BrowserWindow.getAllWindows().filter(win=>win.getTitle()===q.tab.containerEl.ownerDocument.title);if(windows.length!==1)throw Error('Expected one settings window');q.captureWindow=windows[0];q.captureBounds=q.captureWindow.getBounds();q.captureWindow.setContentSize(1100,1350);await new Promise(r=>setTimeout(r,250));return 'CAPTURE WINDOW READY';`);
  capture('settings-scope', 'Search scope', 'Property mapping');
  capture('settings-properties', 'Property mapping');
} finally {
  console.log(evaluate(`const q=window.__jspSettingsCapture;if(q){q.p.settings=q.original;q.p.settingsTab.synchronize();if(q.captureWindow&&q.captureBounds)q.captureWindow.setBounds(q.captureBounds);app.setting.close();q.p.refresh();delete window.__jspSettingsCapture;}return 'Settings restored without saving';`));
  cdp('Emulation.clearDeviceMetricsOverride');
  cdp('Emulation.setFocusEmulationEnabled', { enabled: false });
  if (!readFileSync(dataPath).equals(before)) throw Error('Settings file changed during capture.');
}
