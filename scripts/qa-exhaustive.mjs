import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { verifyNativeErrors } from './qa-preview-diagnostics.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = path.resolve(repo, '../../@Nexus-dev');
const cli = 'C:\\Program Files\\Obsidian\\Obsidian.com';
const outputDir = path.join(repo, 'qa', 'exhaustive-' + Date.now());
mkdirSync(outputDir, { recursive: true });
function run(...args) {
  const out = execFileSync(cli, ['vault=@Nexus-dev', ...args], { encoding: 'utf8', timeout: 60000, windowsHide: true }).trim();
  if (/^Error:/m.test(out)) throw Error(out);
  return out;
}
function evaluate(code) {
  const out = run('eval', 'code=(async()=>{if(app.vault.adapter.getBasePath()!==' + JSON.stringify(canonical) + ')throw Error("Wrong vault");' + code + '})()');
  if (!out.startsWith('=>')) throw Error('No evaluation result: ' + out);
  return out.slice(2).trim();
}
async function inventory() {
  // Read through the running vault: it already owns the synchronized file cache.
  // Bounded concurrency avoids serial cloud hydration from an external process.
  const pairs = JSON.parse(evaluate(`const files=app.vault.getFiles().filter(file=>/\\.(md|base)$/.test(file.path)),result=[];
    for(let i=0;i<files.length;i+=32)await Promise.all(files.slice(i,i+32).map(async file=>{
      const text=await app.vault.cachedRead(file);
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
      result.push([file.path,Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('')]);
    }));return JSON.stringify(result);`));
  console.log('Snapshot: ' + pairs.length + ' Markdown/Base files');
  return new Map(pairs);
}
if (run('vault', 'info=path') !== canonical) throw Error('Wrong vault');
const before = await inventory();
const settingsPath = path.join(canonical, '.obsidian/plugins/just-simple-planner/data.json');
const settings = readFileSync(settingsPath);
writeFileSync(path.join(outputDir, 'baseline.json'), JSON.stringify(Object.fromEntries(before), null, 2));
writeFileSync(path.join(outputDir, 'settings-backup.log'), settings);
evaluate('window.__jspExhaustiveQA={layout:app.workspace.getLayout()};return true;');
const suites = process.argv.slice(2);
if (!suites.length) suites.push('retirement', 'bases', 'scheduling', 'spans', 'visibility', 'removal', 'hover');
const results = [];
let failure;
try {
  for (const suite of suites) {
    if (!/^[a-z-]+$/.test(suite)) throw Error('Invalid suite name');
    if (['migration-button', 'classic-ui', 'membership', 'index', 'pan', 'modifier-pan', 'connections', 'card-sizes'].includes(suite)) throw Error('Historical classic-view driver. Use retirement or the default Bases suites for 0.6.0.');
    run('dev:debug', 'on'); run('dev:errors', 'clear');
    run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":true}');
    console.log('\nRUN ' + suite);
    const start = Date.now();
    const output = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/qa-' + suite + '.mjs'], { cwd: repo, windowsHide: true });
      let text = '';
      const capture = chunk => { text += chunk; process.stdout.write(chunk); };
      child.stdout.on('data', capture); child.stderr.on('data', capture);
      child.on('error', reject);
      child.on('close', code => {
        writeFileSync(path.join(outputDir, suite + '.log'), text);
        if (code) reject(Error(suite + ' exited with ' + code)); else resolve(text);
      });
    });
    const count = [...output.matchAll(/"checks":\s*(\d+)/g)].at(-1)?.[1];
    if (!count) throw Error('Missing suite result: ' + suite);
    const hostWarnings = verifyNativeErrors(run, evaluate, suite === 'hover' || suite === 'connections');
    results.push({ suite, checks: Number(count), durationMs: Date.now() - start, hostWarnings });
    // Close the previous suite's views before testing the next one. Restoring the
    // saved layout also prevents geometry checks from inheriting split panes.
    evaluate('await app.workspace.changeLayout(window.__jspExhaustiveQA.layout);return true;');
  }
} catch (error) { failure = error; }
finally {
  try { evaluate('await app.workspace.changeLayout(window.__jspExhaustiveQA.layout);return true;'); }
  catch (error) { failure ??= error; }
  try { run('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":false}'); }
  catch (error) { failure ??= error; }
  const after = await inventory();
  const changed = [...before].filter(([name, hash]) => after.get(name) !== hash).map(([name]) => name);
  const changedMarkdown = changed.filter(name => name.endsWith('.md'));
  const settingsUnchanged = readFileSync(settingsPath).equals(settings);
  const report = { vault: canonical, version: JSON.parse(readFileSync(path.join(repo, 'manifest.json'))).version, results, checks: results.reduce((sum, result) => sum + result.checks, 0), originalMarkdown: [...before.keys()].filter(name => name.endsWith('.md')).length, changedMarkdown, changedBases: changed.filter(name => name.endsWith('.base')), settingsUnchanged, addedFiles: [...after.keys()].filter(name => !before.has(name)).length, failure: failure?.message ?? null };
  writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, outputDir }, null, 2));
  if (changedMarkdown.length || !settingsUnchanged) failure ??= Error('Original notes or settings changed; inspect report without overwriting them');
}
if (failure) throw failure;
