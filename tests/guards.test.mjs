// 守りごと：左右非反転・旧保存キーに触れない・P1 は永続保存なし・core は描画/DOM に依存しない
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { sheetFrame, integerScale } from '../src/render/sprites.js';
import { loadAll, srcFiles, root } from './helpers.mjs';

const d = loadAll();
const src = srcFiles().map((p) => ({ p: relative(root, p).replaceAll('\\', '/'), text: readFileSync(p, 'utf8') }));

test('キャラ絵：左と右は別の行（反転で作らない）、scaleX は常に 1', () => {
  for (const a of d.ledger.assets.filter((x) => x.kind === 'sheet')) {
    const L = sheetFrame(a, 'left', 0), R = sheetFrame(a, 'right', 0);
    assert.notEqual(L.sy, R.sy, a.id);
    for (const dir of ['down', 'left', 'right', 'up']) for (const t of [0, 100, 250, 399]) assert.equal(sheetFrame(a, dir, t).scaleX, 1);
  }
});

test('noFlip:true でない絵は描画が拒む', () => {
  const a = { ...d.ledger.assets.find((x) => x.id === 'chara.nacht.walk'), noFlip: false };
  assert.throws(() => sheetFrame(a, 'left', 0), /noFlip/);
});

test('描画コードに負の拡大・左右反転の書き方が無い', () => {
  const bad = /scale\(\s*-|setTransform\(\s*-|scaleX\s*[:=]\s*-|scale\.x\s*=\s*-|\bflip(X|H)?\s*[:=]\s*true/;
  for (const f of src) assert.ok(!bad.test(f.text), `${f.p} に反転の疑い`);
});

test('旧保存キー sternenring-core-save-v1 を読み書きしない／ブラウザの保存にさわるのは src/save.js だけ（2026-11-22 作者「NEXTが冒険の記録を持つ」）', () => {
  for (const f of src) {
    assert.ok(!f.text.includes('sternenring-core-save'), f.p);
    if (f.p === 'src/save.js') { assert.ok(f.text.includes("'sternenring-next-save-v1:slot1'"), '保存の名前'); assert.ok(!/sessionStorage|indexedDB/.test(f.text)); continue; }
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(f.text), f.p);
  }
});

test('src/core は描画・DOM に依存しない', () => {
  for (const f of src.filter((x) => x.p.startsWith('src/core/') && x.p !== 'src/core/loop.js')) {
    assert.ok(!/\b(document|window|canvas|CanvasRenderingContext2D|Image\()/.test(f.text.replace(/\/\/.*$/gm, '')), f.p);
    assert.ok(!/from '\.\.\/(render|ui)\//.test(f.text), f.p);
  }
});

test('描画は状態を書きかえない（render は core の field を import しない）', () => {
  for (const f of src.filter((x) => x.p.startsWith('src/render/'))) assert.ok(!/from '\.\.\/core\/field\.js'/.test(f.text), f.p);
});

test('旧版のフォルダーを参照しない', () => {
  for (const f of src) assert.ok(!/STERNENRING_RPG_CORE/.test(f.text), f.p);
  for (const a of d.ledger.assets) assert.ok(a.path === null || a.path.startsWith('assets/'), a.id);
});

test('整数倍の拡大（ドットをにじませない）', () => {
  assert.equal(integerScale(1920, 1080, 32), 3);
  assert.equal(integerScale(1125, 2000, 32), 3); // スマホ縦（375×667 CSS × 3）
  assert.equal(integerScale(200, 200, 32), 1);
  for (const [w, h] of [[1366, 768], [390 * 3, 844 * 3], [412 * 2.6, 915 * 2.6]]) assert.ok(Number.isInteger(integerScale(w, h, 32)));
});

test('仮の素材と正式採用の区別：マップは provisional、素材は adopted でない', () => {
  for (const m of Object.values(d.maps)) assert.equal(m.status, 'provisional');
  for (const a of d.ledger.assets) assert.notEqual(a.status, 'adopted', a.id);
});
