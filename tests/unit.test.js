// Checks that need no browser. Run from the repository root: node --test "tests/*.test.js"
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const VENDOR = ['common.js', 'base.js', 'object.js', 'controller.js', 'observer.js', 'pagememory.js', 'windowsHandle.js', 'fetchqueue.js', 'jellyfin.js', 'search.js'];

test('every script parses, and every vendored dependency is present', () => {
  for (const rel of ['script.js', 'findSimilar.js', 'script_infinity_scroll.js', ...VENDOR.map(f => `js/vendor/${f}`)]) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} is missing`);
    assert.doesNotThrow(() => new vm.Script(read(rel), { filename: rel }), rel);
  }
});

test('index.html loads the vendored copies, not the live sites of the other repositories (CR-05)', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /src="https:\/\/jeffersoncgo\.github\.io\//);
  for (const f of VENDOR) assert.match(html, new RegExp(`src="js/vendor/${f.replace('.', '\\.')}"`), f);
});

const loadFindSimilar = () => {
  const ctx = vm.createContext({ console, Math, JSON, Set, Map, window: {} });
  vm.runInContext(read('findSimilar.js'), ctx, { filename: 'findSimilar.js' });
  return ctx;
};

test('tokenizeName: same tokens as before for ASCII titles, accents and other scripts kept (CR-11)', () => {
  const ctx = loadFindSimilar();
  const tokenize = vm.runInContext('tokenizeName', ctx);
  const old = name => (name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1 && !['the', 'part', 'season', 'episode'].includes(w));
  for (const title of ['The Matrix Reloaded', 'Spider-Man: No Way Home', "Ocean's Eleven (2001)", 'Star Wars: Episode IV']) {
    assert.equal(JSON.stringify(tokenize(title)), JSON.stringify(old(title)), title);
  }
  assert.equal(JSON.stringify(tokenize('Ação Total')), '["acao","total"]');
  assert.equal(tokenize('千と千尋 の神隠し').length, 2);
});

test('selectRandomContents: returns distinct items and every item can come first', () => {
  const ctx = loadFindSimilar();
  const pick = vm.runInContext('selectRandomContents', ctx);
  const items = [1, 2, 3, 4, 5].map(Id => ({ Id }));
  const firsts = new Map();
  for (let i = 0; i < 5000; i++) {
    const out = pick(items, 3);
    assert.equal(new Set(out.map(o => o.Id)).size, 3);
    firsts.set(out[0].Id, (firsts.get(out[0].Id) || 0) + 1);
  }
  for (const [, count] of firsts) assert.ok(Math.abs(count - 1000) < 150, `biased pick: ${JSON.stringify([...firsts])}`);
});

test('vendored copies match their sources (when the repositories are checked out side by side)', (t) => {
  const sources = { 'jellyfin.js': '../CoverMaker/js/jellyfin.js', 'windowsHandle.js': '../CoverMaker/js/windowsHandle.js' };
  for (const f of VENDOR) if (!sources[f]) sources[f] = `../cdn/js/${f}`;
  const available = Object.entries(sources).filter(([, src]) => fs.existsSync(path.join(ROOT, src)));
  if (!available.length) return t.skip('cdn / CoverMaker not checked out next to this repository');
  for (const [f, src] of available) assert.equal(read(`js/vendor/${f}`), read(src), `js/vendor/${f} differs from ${src}`);
});
