// DEV-BOOK-001 rev4：表紙の「タップしてはじめる」。一押しで音を有効にしてから本がひらく。一押しは省略・歩行に使わない。320〜375px の配置
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INTRO_TIMING as T, createIntro, gateInput, introPose, startWhenReady } from '../src/render/book-intro.js';
import { decideOpenCue } from '../src/audio/sound.js';
import { decideBgm } from '../src/audio/bgm.js';
import { makeField, run, pos, root } from './helpers.mjs';

const PLAY = { play: true, reason: 'default' };
const mk = () => createIntro(PLAY, T, { cover: true });

test('表紙：読込待ち → 表紙 → 一押しで開始待ち → 本がひらく。表紙のあいだは閉じた本のまま', () => {
  const it = mk();
  assert.equal(it.phase, 'waiting');
  it.shown(100);
  assert.equal(it.phase, 'cover', '最初のマップを描けたら表紙（すぐには始めない）');
  assert.equal(it.blocking, true);
  assert.deepEqual(it.pose(5000), introPose(0), '表紙のあいだは閉じた本（t=0）のまま。時間がたっても進まない');
  it.begin(6000);
  assert.equal(it.phase, 'cover', '一押しの前には始まらない');
  assert.equal(it.press('cover-click', 7000), true);
  assert.equal(it.phase, 'starting');
  assert.deepEqual(it.pose(7300), introPose(0), '開始待ちも閉じた本のまま');
  it.begin(7400, 'ready');
  assert.equal(it.phase, 'playing');
  const p = it.pose(7400 + 500); assert.ok(p && Math.abs(p.t - 0.5) < 1e-9, '一押しのあとの begin から数える');
  assert.equal(it.pose(7400 + T.end * 1000), null);
  assert.equal(it.endedBy, 'complete');
  const s = it.snapshot(); assert.equal(s.pressedBy, 'cover-click'); assert.equal(s.startedBy, 'ready'); assert.equal(s.cover, true);
});

test('一押しは一度だけ：二度押し・キーの連打で始め直さない', () => {
  const it = mk(); it.shown(0);
  assert.equal(it.press('cover-click', 10), true);
  assert.equal(it.press('cover-click', 40), false);
  assert.equal(it.press('cover-key', 50), false);
  it.begin(100); it.begin(900);
  const p = it.pose(1100); assert.ok(p && Math.abs(p.t - 1.0) < 1e-9, '2回目の begin で頭に戻らない');
});

test('一押しは省略に使わない：開始待ちと一押し直後のタップ・キー・とばすでは終わらない。少したてば省略できる', () => {
  const it = mk(); it.shown(0); it.press('cover-click', 1000);
  for (const w of ['skip-tap', 'skip-key', 'skip-button']) assert.equal(it.skip(w, 1010), false, `開始待ちの ${w}`);
  it.begin(1100);
  assert.equal(it.skip('skip-tap', 1000 + T.pressGuardMs - 1), false, '二度押し（一押しの直後）');
  assert.equal(it.phase, 'playing');
  assert.equal(it.skip('skip-tap', 1000 + T.pressGuardMs + 1), true, '間を置いたタップでは省略できる');
  assert.equal(it.endedBy, 'skip-tap');
});

test('表紙のあいだ：方向の入力・タブ離脱・タップで終わらず、歩かない。表示切替（平面へ）では終わる', () => {
  const { field, input } = makeField();
  const it = mk(); it.shown(0);
  const start = pos(field);
  const skip = (w) => it.skip(w, 0);
  input.press('left');
  for (let i = 0; i < 120; i++) if (gateInput(it, input, skip)) field.update(1000 / 60, input);
  input.release('left');
  assert.equal(it.phase, 'cover', '方向の入力で表紙は消えない');
  assert.deepEqual(pos(field), start, '表紙のあいだは歩かない');
  assert.equal(input.pending(), 0, '先行入力を残さない');
  for (const w of ['hidden', 'skip-tap', 'skip-key', 'skip-input']) assert.equal(it.skip(w, 0), false, w);
  assert.equal(it.skip('toggle', 0), true);
  assert.equal(it.blocking, false);
});

test('開始待ちのあいだの方向の入力は捨てる（演出を消さない）。タブ離脱では終わる', () => {
  const { field, input } = makeField();
  const it = mk(); it.shown(0); it.press('cover-key', 0);
  input.press('up'); input.release('up');
  assert.equal(gateInput(it, input, (w) => it.skip(w, 10)), false);
  assert.equal(it.phase, 'starting'); assert.equal(input.pending(), 0);
  assert.equal(it.skip('hidden', 20), true, 'タブを離れたら終わる（戻ったとき待たせない）');
  it.begin(30, 'ready');
  assert.equal(it.phase, 'done', '終わったあとに遅れて始まらない');
  void field;
});

test('演出のあとは歩ける（表紙 → 一押し → 演出 → 方向でとばす → 押しつづけて歩く）', () => {
  const { field, input } = makeField();
  const it = mk(); it.shown(0); it.press('cover-click', 0); it.begin(10);
  const start = pos(field);
  const tick = (ms) => { for (let t = 0; t < ms; t += 1000 / 60) if (gateInput(it, input, (w) => it.skip(w, 1000))) field.update(1000 / 60, input); };
  input.press('left');
  tick(field.stepMs * 3);
  input.release('left'); run(field, input, field.stepMs + 20);
  assert.equal(it.endedBy, 'skip-input');
  assert.ok(pos(field).x < start.x, '歩けた');
});

test('cover の無い使い方（従来）は、読込待ちからそのまま始まる', () => {
  const it = createIntro(PLAY);
  it.shown(50);
  assert.equal(it.phase, 'playing');
  assert.equal(it.press('cover-click', 60), false, '表紙が無ければ一押しは無い');
});

test('開始待ち：用意ができたら ready、待ちつづけ・失敗でも上限で進む。呼ぶのは一度だけ', async () => {
  const runCase = async (ready, fireTimer) => {
    const calls = []; let timerFn = null;
    startWhenReady(ready, T.startWaitMs, (w) => calls.push(w), (fn) => { timerFn = fn; });
    await new Promise((r) => setTimeout(r, 5));
    if (fireTimer) timerFn();
    await new Promise((r) => setTimeout(r, 5));
    if (!fireTimer) timerFn();
    return calls;
  };
  assert.deepEqual(await runCase(Promise.resolve(true), false), ['ready']);
  assert.deepEqual(await runCase(new Promise(() => {}), true), ['timeout'], '音の有効化が返ってこなくても待ち続けない');
  assert.deepEqual(await runCase(Promise.reject(Error('x')), false), ['error']);
  assert.ok(T.startWaitMs > 0 && T.startWaitMs <= 1000, '待ちは短い');
});

test('音：表紙で鳴らさず、本がひらく始まりに鳴らす。断られた・読めないときは鳴らさず、あとから遅れて鳴らさない', () => {
  const base = { ctxState: 'running', loaded: true, level: 'mid', already: '' };
  assert.equal(decideOpenCue({ ...base, introPhase: 'cover', introT: 0 }).decided, false, '表紙では決めない（待つ）');
  assert.equal(decideOpenCue({ ...base, introPhase: 'starting', introT: 0 }).decided, false);
  const c = decideOpenCue({ ...base, introPhase: 'playing', introT: 0.016 });
  assert.deepEqual([c.play, c.reason], [true, 'played']);
  assert.equal(decideOpenCue({ ...base, ctxState: 'suspended', introPhase: 'playing', introT: 0.2 }).reason, 'locked');
  assert.equal(decideOpenCue({ ...base, loaded: false, introPhase: 'playing', introT: 0.2 }).reason, 'not-loaded');
  assert.equal(decideOpenCue({ ...base, introPhase: 'playing', introT: 0.5, already: 'locked' }).play, false, '一度決めたら決め直さない');
});

test('曲：表紙・開始待ち・演出のあいだは流さず、演出のあと流す', () => {
  const byMap = { 'norn-plaza': 'bgm.town.celtic.v30' };
  assert.equal(decideBgm({ mapId: 'norn-plaza', byMap, current: null, introBlocking: true }).action, 'none');
  assert.equal(decideBgm({ mapId: 'norn-plaza', byMap, current: null, introBlocking: false }).action, 'start');
});

test('main.js：表紙の一押しで音を有効にしてから始める。Enter/Space/クリックで一度だけ、Esc と押しっぱなしでは始めない', () => {
  const src = readFileSync(join(root, 'src/main.js'), 'utf8');
  assert.match(src, /createIntro\([^\n]*\{ cover: true \}\)/);
  assert.match(src, /coverBtn\.addEventListener\('click', \(\) => startFromCover\('cover-click'\)\)/);
  assert.match(src, /intro\.press\(why, performance\.now\(\)\)/);
  assert.match(src, /sound\.unlock\(why\)[^\n]*bgm\.unlock\(why\)/);
  assert.match(src, /startWhenReady\(ready, INTRO_TIMING\.startWaitMs/);
  assert.match(src, /if \(intro\.phase === 'cover'\) \{ if \(e\.code !== 'Escape'\)/);
  assert.match(src, /if \(!e\.repeat\) skipIntro\('skip-key'\)/);
  assert.match(src, /params\.get\('mute'\) === '1' \? 'off'/);
});

test('index.html：表紙のボタン・十字ボタンを表紙で隠す・幅400px以下の配置', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /id="intro-cover" hidden/);
  assert.match(html, /クリックしてはじめる/);
  assert.match(html, /body\.cover #pad \{ visibility: hidden; \}/);
  assert.match(html, /@media \(max-width: 400px\)/);
  // 表紙は右上のボタンより先に置く（音量ボタンが表紙の上に出て、先に押せる）
  assert.ok(html.indexOf('id="intro-cover"') < html.indexOf('id="topright"'));
  const main = readFileSync(join(root, 'src/main.js'), 'utf8');
  assert.match(main, /'タップしてはじめる'/);
});
