import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const tag = process.env.GITHUB_REF_NAME;
assert.match(tag ?? '', /^\d+\.\d+\.\d+$/);
assert.equal(process.env.GITHUB_REF_TYPE, 'tag');
assert.equal(tag, manifest.version, 'The release tag must exactly match manifest.version');
assert.ok((await stat(new URL(`../.github/release-notes/${tag}.md`, import.meta.url))).size > 0);
console.log(`Release tag and notes verified: ${tag}`);
