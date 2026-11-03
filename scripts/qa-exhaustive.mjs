import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = path.resolve(repo, '../../@Nexus-dev');
const cli = 'C:\\Program Files\\Obsidian\\Obsidian.com';
const outputDir = path.join(repo, 'qa', 'exhaustive-' + Date.now());
mkdirSync(outputDir, { recursive: true });
function run(...args) {
  const out = execFileSync(cli, ['vault=@Nexus-dev', ...args], { encoding: 'utf8', timeout: 30000, windowsHide: true }).trim();
  if (/^Error:/m.test(out)) throw Error(out);
  return out;
}
function evaluate(code) {
  const out = run('eval', 'code=(async()=>{if(app.vault.adapter.getBasePath()!==' + JSON.stringify(canonical) + ')throw Error("Wrong vault");' + code + '})()');
  if (!out.startsWith('=>')) throw Error('No evaluation result: ' + out);
  return out.slice(2).trim();
}
function inventory(folder = canonical, result = new Map()) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const name = path.join(folder, entry.name);
    if (entry.isDirectory()) inventory(name, result);
    else if (/\.(md|base)$/.test(entry.name)) result.set(path.relative(canonical, name), createHash('sha256').update(readFileSync(name)).digest('hex'));
  }
  return result;
}
if (run('vault', 'info=path') !== canonical) throw Error('Wrong vault');
const before = inventory();
const settingsPath = path.join(canonical, '.obsidian/plugins/just-simple-planner/data.json');
const settings = readFileSync(settingsPath);
writeFileSync(path.join(outputDir, 'baseline.json'), JSON.stringify(Object.fromEntries(before), null, 2));
writeFileSync(path.join(outputDir, 'settings-backup.log'), settings);
evaluate('window.__jspExhaustiveQA={layout:app.workspace.getLayout()};return true;');
const suites = process.argv.slice(2);
if (!suites.length) suites.push('migration-button', 'bases', 'scheduling', 'spans', 'card-sizes', 'classic-ui', 'membership', 'index', 'pan', 'modifier-pan', 'connections', 'visibility');
const results = [];
let failure;
try {
  for (const suite of suites) {
    if (!/^[a-z-]+$/.test(suite)) throw Error('Invalid suite name');
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
    const errors = run('dev:errors');
    if (!errors.includes('No errors captured.')) throw Error(errors);
    results.push({ suite, checks: Number(count), durationMs: Date.now() - start });
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
  const after = inventory();
  const changed = [...before].filter(([name, hash]) => after.get(name) !== hash).map(([name]) => name);
  const changedMarkdown = changed.filter(name => name.endsWith('.md'));
  const settingsUnchanged = readFileSync(settingsPath).equals(settings);
  const report = { vault: canonical, version: JSON.parse(readFileSync(path.join(repo, 'manifest.json'))).version, results, checks: results.reduce((sum, result) => sum + result.checks, 0), originalMarkdown: [...before.keys()].filter(name => name.endsWith('.md')).length, changedMarkdown, changedBases: changed.filter(name => name.endsWith('.base')), settingsUnchanged, addedFiles: [...after.keys()].filter(name => !before.has(name)).length, failure: failure?.message ?? null };
  writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, outputDir }, null, 2));
  if (changedMarkdown.length || !settingsUnchanged) failure ??= Error('Original notes or settings changed; inspect report without overwriting them');
}
if (failure) throw failure;
