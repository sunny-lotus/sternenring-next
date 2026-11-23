// 開始演出「飛び出す絵本」（DEV-BOOK-001）：時間割・演出中の入力・終わったあとのカメラと板・オーブ・本の形
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INTRO_TIMING as T, introPose, riseK, overshoot, riseDelayFn, shouldPlayIntro, createIntro, gateInput, orbPositions } from '../src/render/book-intro.js';
import { bookWideEye, bookHalf, risingAy, boardAxes, readStyle, perspective, lookAt, mul, project, cameraEye } from '../src/render/paper-math.js';
import { makeField, run, pos, root, readJson } from './helpers.mjs';

const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

test('流れ：本がひらく → 板が起き上がる → カメラが寄る（作者の決定 14:00ごろの順）', () => {
  const p0 = introPose(0);
  assert.ok(p0.coverRad > 1.5, 'はじめは閉じている（ページが立っている）');
  assert.equal(p0.zoom, 0, 'はじめは本全体');
  const pOpen = introPose(T.open);
  assert.equal(pOpen.coverRad, 0, 'open 秒でひらき終わる');
  assert.ok(T.riseStart >= T.open, '板はひらき終わってから起き上がる');
  assert.ok(T.zoomStart > T.riseStart && T.zoomStart < T.riseStart + T.riseSpread + T.riseDur, 'カメラは板が立ちはじめたころから寄る');
  assert.equal(introPose(T.end).zoom, 1, '終わりでカメラはふだんの位置');
  assert.equal(introPose(T.end).done, true);
  assert.ok(T.end <= 5, '長すぎない（歩行へ自然に移る。2026-11-23 作者「本が開く演出はやすぎるかも」で 3.5→5 秒まで）');
  assert.ok(T.riseStart + T.riseSpread + T.actorsAfter + T.riseDur <= T.end, '終わる前にすべての板が立つ');
});

test('板の起き上がり：寝ている → 少し行きすぎる → ちょうど立つ', () => {
  assert.equal(riseK(T.riseStart, 0), 0);
  assert.equal(overshoot(1), 1);
  let max = 0;
  for (let x = 0; x <= 1; x += 0.01) max = Math.max(max, overshoot(x));
  assert.ok(max > 1.02 && max < 1.25, `行きすぎは少し（最大 ${max.toFixed(3)}）`);
  assert.equal(riseK(T.riseStart + T.riseDur + 0.01, 0), 1);
  assert.equal(riseK(99, T.riseSpread), 1);
});

test('時間差：奥の板から順に、キャラはすべての板のあと', () => {
  const f = riseDelayFn([3, 5, 9, 12]);
  assert.equal(f(3), 0);
  assert.ok(f(5) < f(9) && f(9) < f(12));
  assert.equal(f(12), T.riseSpread);
  assert.ok(f(10, true) > f(12));
  assert.equal(riseDelayFn([])(4), 0, '板が無くても動く');
});

test('板の向き：k=0 は奥へ寝る、k=1 はふだんと同じ向き、行きすぎは手前へ少し', () => {
  const up = boardAxes('upright', 10);
  assert.deepEqual(risingAy(up.lean, 1).map((v) => Math.round(v * 1e9) / 1e9), up.ay.map((v) => Math.round(v * 1e9) / 1e9));
  const flat = risingAy(up.lean, 0);
  assert.ok(near(flat[1], 0, 1e-9) && near(flat[2], -1, 1e-9), '奥へ寝ている（ページの上）');
  assert.ok(risingAy(up.lean, 1.08)[2] > 0, '行きすぎると手前へ');
  const cam = boardAxes('camera', 10);
  assert.ok(near(risingAy(cam.lean, 1)[1], cam.ay[1]) && near(risingAy(cam.lean, 1)[2], cam.ay[2]), 'camera 向きの設定でも k=1 で同じ');
});

test('見せるかどうか：?intro・動きを抑える設定・平面表示', () => {
  assert.deepEqual(shouldPlayIntro({ param: null, reducedMotion: false, mode: 'paper' }), { play: true, reason: 'default' });
  assert.equal(shouldPlayIntro({ param: '0', reducedMotion: false, mode: 'paper' }).play, false);
  assert.equal(shouldPlayIntro({ param: null, reducedMotion: true, mode: 'paper' }).play, false);
  assert.equal(shouldPlayIntro({ param: '1', reducedMotion: true, mode: 'paper' }).play, true);
  assert.equal(shouldPlayIntro({ param: '1', reducedMotion: false, mode: 'flat2d' }).play, false, '平面では見せない');
});

test('状態：読込待ち → 再生 → 完了。完了後は二度と再生しない', () => {
  const it = createIntro({ play: true, reason: 'default' });
  assert.equal(it.phase, 'waiting'); assert.equal(it.blocking, true);
  assert.equal(it.pose(1000), null, '読込前は描かない');
  it.begin(1000);
  assert.equal(it.phase, 'playing');
  const p = it.pose(1000 + 500); assert.ok(p && near(p.t, 0.5));
  assert.equal(it.pose(1000 + T.end * 1000), null, '時間が来たら終わる');
  assert.equal(it.phase, 'done'); assert.equal(it.endedBy, 'complete'); assert.equal(it.blocking, false);
  it.begin(5000); assert.equal(it.phase, 'done', 'マップ移動・タブ復帰で再生しない');
  const off = createIntro({ play: false, reason: 'reduced-motion' });
  assert.equal(off.blocking, false); assert.equal(off.endedBy, 'not-played:reduced-motion');
});

test('タブを離れて長く戻らなくても、戻ったときは終わっている（待たせない）', () => {
  const it = createIntro({ play: true, reason: 'default' });
  it.begin(0); it.pose(300);
  it.skip('hidden');
  assert.equal(it.blocking, false); assert.equal(it.endedBy, 'hidden');
  assert.equal(it.pose(600000), null);
  it.skip('skip-button'); assert.equal(it.endedBy, 'hidden', '終わったあとの省略は理由を書きかえない');
});

test('演出中の入力：歩かない・先行入力を残さない。方向で終わり、押しつづければそのまま歩く', () => {
  const { field, input } = makeField();
  const it = createIntro({ play: true, reason: 'default' });
  it.begin(0);
  const start = pos(field);
  const tick = (ms) => { for (let t = 0; t < ms; t += 1000 / 60) if (gateInput(it, input, (w) => it.skip(w))) field.update(1000 / 60, input); };
  tick(500);
  assert.deepEqual(pos(field), start, '演出中はそのまま');
  input.press('left'); input.release('left');     // 1回押して離す（とばすだけ）
  tick(400);
  assert.equal(it.endedBy, 'skip-input');
  assert.deepEqual({ x: pos(field).x, y: pos(field).y }, { x: start.x, y: start.y }, 'とばした入力では歩かない');
  assert.equal(input.pending(), 0, '先行入力が残らない');
  input.press('left');                              // 押しつづける → 歩く
  tick(field.stepMs * 2 + 40);
  input.release('left');
  run(field, input, field.stepMs + 20);
  assert.ok(pos(field).x < start.x, '演出のあとは歩ける');
});

test('演出中に押しつづけた方向は、演出のあとそのまま歩きはじめる（誤操作の先行分は捨てる）', () => {
  const { field, input } = makeField();
  const it = createIntro({ play: true, reason: 'default' });
  it.begin(0);
  const start = pos(field);
  input.press('left');   // 押したまま
  for (let i = 0; i < 6; i++) if (gateInput(it, input, (w) => it.skip(w))) field.update(1000 / 60, input);
  assert.equal(it.blocking, false);
  run(field, input, field.stepMs * 3);
  input.release('left'); run(field, input, field.stepMs + 20);
  assert.ok(pos(field).x <= start.x - 2, '押したままなら続けて歩く');
});

test('終わったあとのカメラは、ふだん（マップの10度・60度・追従）と同じ。演出中は本全体から寄る', () => {
  const m = readJson('data/maps/norn-plaza.json'), cam = m.stage.camera;
  const game = cameraEye({ x: 12.5, y: 11.5 }, cam.pitchDeg, cam.fovDeg, 360, 32);
  const wide = bookWideEye(m, 0.6, cam.fovDeg, 16 / 9);
  const lerp = (a, b, z) => a.map((v, i) => v + (b[i] - v) * z);
  const z = introPose(T.end - 1e-6).zoom;
  const e = lerp(wide.eye, game.eye, z);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(e[i] - game.eye[i]) < 1e-3, '終わりの直前でほぼふだんの位置（つなぎ目で跳ばない）');
  assert.ok(wide.D > game.D, '本全体のカメラは、ふだんより遠い');
});

test('本全体のカメラ：PC横長とスマホ縦で、表紙の四隅が画面に入る', () => {
  const m = readJson('data/maps/norn-plaza.json'), mg = 0.6;
  for (const aspect of [16 / 9, 4 / 3, 375 / 812, 812 / 375]) {
    const w = bookWideEye(m, mg, 60, aspect);
    const vp = mul(perspective(60 * Math.PI / 180, aspect, 0.5, w.D * 4 + 40), lookAt(w.eye, w.target, [0, 1, 0]));
    for (const [x, zz] of [[-mg, -mg], [m.width + mg, -mg], [-mg, m.height + mg], [m.width + mg, m.height + mg]]) {
      const [px, py] = project(vp, [x, 0, zz]);
      assert.ok(Math.abs(px) <= 1 && Math.abs(py) <= 1, `aspect ${aspect.toFixed(2)} の隅 (${x},${zz}) → ${px.toFixed(2)},${py.toFixed(2)}`);
    }
  }
});

test('本の形：ひらくと平らな1枚にもどる。左右のページは背でつながり、横軸は常に +x（反転しない）', () => {
  const W = 24;
  for (const rad of [0, 0.3, 1.0, 1.5]) for (const side of [-1, 1]) {
    const h = bookHalf(side, W, rad);
    assert.ok(h.ax[0] > 0, '横軸は +x');
    const end = side > 0 ? h.o : [h.o[0] + h.ax[0] * h.len, h.o[1] + h.ax[1] * h.len];
    assert.ok(near(end[0], W / 2, 1e-9) && near(end[1], 0, 1e-9), '背 (幅/2, 0) でつながる');
    assert.ok(h.n[1] > 0, 'ページの面は上を向く');
  }
  const L = bookHalf(-1, W, 0), R = bookHalf(1, W, 0);
  assert.deepEqual([L.o[0], L.o[1], R.o[0], R.o[1]], [0, 0, W / 2, 0], '平らにひらくと、床と同じ位置');
});

test('オーブ：時刻だけで決まる・舞台の中・動きを抑えるときは止まる', () => {
  const a = orbPositions(18, 3.2, { w: 24, h: 19 }), b = orbPositions(18, 3.2, { w: 24, h: 19 });
  assert.deepEqual(a, b);
  for (const o of a) assert.ok(o.x >= 0 && o.x <= 24 && o.z >= 0 && o.z <= 19 && o.y >= 0.3 && o.y <= 4.2 && o.alpha >= 0 && o.alpha <= 1);
  assert.notDeepEqual(orbPositions(18, 0, { w: 24, h: 19 }), orbPositions(18, 10, { w: 24, h: 19 }), '時間がたてば動く');
  assert.equal(orbPositions(0, 1, { w: 24, h: 19 }).length, 0);
});

test('見た目の設定：book と orbs を読む・不正は理由を返す（data/stage-style.json は問題なし）', () => {
  const ok = readStyle(readJson('data/stage-style.json'));
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.style.boardFacing, 'upright', '作者の決定 upright のまま');
  assert.ok(ok.style.orbs.count > 0 && ok.style.book.margin > 0);
  assert.ok(readStyle({ orbs: { count: -1 } }).errors.some((e) => e.includes('orbs')));
  assert.ok(readStyle({ book: { margin: 1, edge: 2 } }).errors.some((e) => e.includes('book')));
});

test('main.js：演出は最初のマップの紙の舞台だけで始め、タブ離脱・表示切替・とばすで終える', () => {
  const src = readFileSync(join(root, 'src/main.js'), 'utf8');
  assert.match(src, /if \(mode === 'paper'\) \{ intro\.shown\(/);
  assert.match(src, /visibilitychange[^\n]*skipIntro\('hidden'\)/);
  assert.match(src, /render-toggle'\)\.addEventListener\('click', \(\) => skipIntro\('toggle'\)\)/);
  assert.match(src, /gateInput\(intro, input, skipIntro, dt\)\) field\.update/);
  assert.match(src, /prefers-reduced-motion: reduce/);
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /id="intro-skip" hidden/);
  assert.ok(!/introAt|holdAt/.test(src), '検証用の分岐を本編に入れない（AGENTS.md）');
});

test('本の世界は見た目だけ：演出のコードとデータに、物語・世界設定の意味を持ちこまない', () => {
  for (const p of ['src/render/book-intro.js', 'data/stage-style.json']) {
    const t = readFileSync(join(root, p), 'utf8');
    for (const w of ['星律', '原初', '本の中の世界', '世界は本']) assert.ok(!t.includes(w), `${p} に「${w}」`);
  }
});

test('方向を短く押して（40ms）とばしたときは、1歩も進まない（実ブラウザで見つけた誤操作の回帰）', () => {
  const { field, input } = makeField();
  const it = createIntro({ play: true, reason: 'default' });
  it.begin(0);
  const start = pos(field);
  const tick = (ms) => { for (let t = 0; t < ms; t += 1000 / 60) if (gateInput(it, input, (w) => it.skip(w), 1000 / 60)) field.update(1000 / 60, input); };
  input.press('left'); tick(40); input.release('left'); tick(600);
  assert.equal(it.endedBy, 'skip-input');
  assert.deepEqual({ x: pos(field).x, y: pos(field).y }, { x: start.x, y: start.y });
  assert.equal(field.state.steps, 0);
});
