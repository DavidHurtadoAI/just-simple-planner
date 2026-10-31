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
const originalData = readFileSync(dataPath);
function evaluate(code) {
  const out = run('eval', `code=(async()=>{if(app.vault.adapter.getBasePath()!==${JSON.stringify(canonical)})throw Error('Wrong vault');${code}})()`);
  if (!out.startsWith('=>')) throw Error(out);
  return out.slice(2).trim();
}
function cdp(method, params) { return JSON.parse(run('dev:cdp', `method=${method}`, `params=${JSON.stringify(params)}`)); }
try {
  cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  evaluate(`const p=app.plugins.getPlugin('just-simple-planner');if(document.querySelector('.modal-container'))throw Error('Close the existing modal first');const folder='Pruebas/Just Simple Planner/Ensayos QA/Documentación '+Date.now();const file=await app.vault.create(await p.uniquePath(folder,'Reunión de seguimiento QA'),['---',p.settings.propertyNames.date+': 2026-11-02','calendar: true','---','Nota ficticia para documentar la incorporación al planner.',''].join(String.fromCharCode(10)));await p.reviewNote(file,{thread:[...p.threads.keys()][0],date:'2026-11-03'});await new Promise(r=>setTimeout(r,400));const modal=document.querySelector('.jsp-membership-modal');if(!modal?.textContent.includes('also changes the date'))throw Error('Expected calendar warning');window.__jspMembershipCapture={file,modal};return 'READY';`);
  const clip = JSON.parse(evaluate(`const r=window.__jspMembershipCapture.modal.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),scale:1});`));
  const screenshot = cdp('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
  writeFileSync(path.join(repo, 'docs/images/add-existing-note.png'), Buffer.from(screenshot.data, 'base64'));
  console.log('Captured add-existing-note.png');
} finally {
  console.log(evaluate(`const q=window.__jspMembershipCapture;if(q){[...q.modal.querySelectorAll('button')].find(b=>b.textContent==='Cancel')?.click();delete window.__jspMembershipCapture;}return 'Review cancelled; fictional source note retained without enrollment';`));
  cdp('Emulation.setFocusEmulationEnabled', { enabled: false });
  if (!readFileSync(dataPath).equals(originalData)) throw Error('Settings file changed during capture.');
}
