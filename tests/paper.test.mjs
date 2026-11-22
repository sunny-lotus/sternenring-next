// 紙の舞台（P2）の計算：前後の並び・板の向き・左右非反転・カメラ・設定の検証
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { placeBoard, placeActor, boardAxes, boardNormal, frameUV, cameraEye, perspective, lookAt, mul, project, readStyle, DEFAULT_STYLE, snap } from '../src/render/paper-math.js';
import { sheetFrame } from '../src/render/sprites.js';
import { validateMap } from '../src/core/map.js';
import { loadAll, readJson, clone, root } from './helpers.mjs';

const d = loadAll();
const plaza = d.maps['norn-plaza'], inn = d.maps['silver-deer-1f'];
const item = (m, asset) => { for (const l of m.stage.layers) for (const it of l.items) if (it.asset === asset) return { it, band: l.band }; throw Error(asset); };
const zOf = (m, asset) => { const { it, band } = item(m, asset); return placeBoard(it, band, 32, null).z; };

test('前後：露店の板より手前の行のキャラは手前、奥の行のキャラは奥', () => {
  const stall = zOf(plaza, 'placeholder:stall'); // 露店は 8〜9行目
  const actor = (y) => placeActor({ x: 3, y }, d.ledger.assets.find((a) => a.id === 'chara.nacht.walk'), 32).z;
  assert.ok(actor(10) > stall, '10行目のキャラは露店より手前');
  assert.ok(actor(7) < stall, '7行目のキャラは露店より奥');
});

test('前後：宿の正面の板は扉の行より奥（扉の前に立てる）', () => {
  // 2026-11-22 宿の入口は見開き「銀鹿亭前の通り」へ移した（入口は (8,4)）
  const inn = zOf(d.maps['norn-inn-street'], 'placeholder:inn-tall');
  assert.ok(inn <= 4, `正面 z=${inn}`);
  assert.ok(placeActor({ x: 8, y: 5 }, d.ledger.assets[1], 32).z > inn, '宿の前(8,5)のキャラは正面より手前');
});

test('前後：奥の一枚絵 < 奥の帯 < 手前の柱（室内）', () => {
  // 2026-11-22 作者の指示で銀鹿亭の奥の壁の仮の板をはがしたので、同じ形の奥の一枚絵をここで作って確かめる
  const back = placeBoard({ asset: 'placeholder:inn-back-wall', x: 0, y: 0, w: 20, h: 1, standH: 3 }, 'backdrop', 32, null).z;
  const { it, band } = item(inn, 'tiles.pipoya-town');
  const counter = placeBoard(it, band, 32, [224, 32]).z;
  const pillar = zOf(inn, 'placeholder:pillar');
  assert.ok(back < counter && counter < pillar, `${back} ${counter} ${pillar}`);
});

test('zOffset は同じ帯の中で手前へ少しずらす（0〜0.3）', () => {
  const base = { x: 1, y: 1, w: 2, h: 2 };
  assert.ok(Math.abs(placeBoard({ ...base, zOffset: 0.2 }, 'mid', 32, null).z - placeBoard(base, 'mid', 32, null).z - 0.2) < 1e-9);
  const m = clone(plaza); m.stage.layers[2].items[0].zOffset = 0.5;
  assert.ok(validateMap(m, { collision: d.collision, ledger: d.ledger, regions: d.regions }).some((e) => /zOffset/.test(e)));
  const m2 = clone(plaza); m2.stage.layers[1].items[0].standH = 0;
  assert.ok(validateMap(m2, { collision: d.collision, ledger: d.ledger, regions: d.regions }).some((e) => /standH/.test(e)));
});

test('画像のある板は画像のドット数どおりの大きさ（にじませない等倍）', () => {
  const b = placeBoard({ x: 10, y: 7, w: 4, h: 3 }, 'mid', 32, [96, 96]);
  assert.deepEqual([b.w, b.h], [3, 3]);
  assert.equal(b.x, 10.5); // 足もとの footprint の中央へ
  const r = placeBoard({ x: 2, y: 2, w: 7, h: 2, repeat: 'x' }, 'back', 32, [224, 32]);
  assert.equal(r.w, 7);
});

test('左右非反転：全シート・全向き・全コマで UV の u0 < u1、左右は別の行', () => {
  for (const a of d.ledger.assets.filter((x) => x.kind === 'sheet')) {
    for (const dir of ['down', 'left', 'right', 'up']) for (let t = 0; t < 800; t += 50) {
      const uv = frameUV(sheetFrame(a, dir, t), 256, 256);
      assert.ok(uv[2] > uv[0], `${a.id} ${dir}`);
    }
    assert.notDeepEqual(frameUV(sheetFrame(a, 'left', 0), 256, 256), frameUV(sheetFrame(a, 'right', 0), 256, 256));
  }
  assert.throws(() => frameUV({ sx: 64, sy: 0, sw: -64, sh: 64 }, 256, 256), /反転/);
});

test('板の横軸は常に +x（どの向き設定・角度でも）、縦軸は上向き', () => {
  for (const f of ['camera', 'upright']) for (const p of [30, 50, 55, 70, 89]) {
    const { ax, ay } = boardAxes(f, p);
    assert.deepEqual(ax, [1, 0, 0]);
    assert.ok(ay[1] > 0);
  }
  assert.ok(Math.abs(boardAxes('upright', 50).ay[2]) < 1e-12);
});

test('カメラ：注視点の板は等倍（1ドット＝内部の1画素）、左右が入れかわらない', () => {
  const ih = 360, iw = 640, look = { x: 12, y: 10 };
  const { eye, target } = cameraEye(look, 50, 24, ih, 32);
  const vp = mul(perspective(24 * Math.PI / 180, iw / ih, 1, 200), lookAt(eye, target, [0, 1, 0]));
  const { ay } = boardAxes('camera', 50);
  const a = project(vp, [12, 0, 10]), b = project(vp, [12 + ay[0], ay[1], 10 + ay[2]]);
  const px = (b[1] - a[1]) / 2 * ih; // 1マスの高さが何画素になるか
  assert.ok(Math.abs(px - 32) < 0.5, `1マス=${px.toFixed(2)}画素`);
  const l = project(vp, [11, 0, 10]), r = project(vp, [13, 0, 10]);
  assert.ok(r[0] > l[0], '右のものは画面の右');
  const near = project(vp, [12, 0, 12]), far = project(vp, [12, 0, 8]);
  assert.ok(near[1] < far[1], '手前（y大）は画面の下');
});

test('ドットの格子へ丸める', () => {
  assert.equal(snap(1.01, 32), 1); assert.equal(snap(1.5, 32), 1.5); assert.equal(snap(2.0157, 32) * 32 % 1, 0);
});

test('舞台の設定：既定値で補い、不正な値は起動前に止める', () => {
  const ok = readStyle(readJson('data/stage-style.json'));
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.style.boardFacing, 'upright');   // 2026-11-22 作者の決定：建物・キャラは地面に垂直（90度）に立てる
  assert.deepEqual(readStyle(null).style, structuredClone(DEFAULT_STYLE));
  assert.ok(readStyle({ boardFacing: 'mirror' }).errors.length > 0);
  assert.ok(readStyle({ shadow: { alpha: 2 } }).errors.length > 0);
  assert.ok(readStyle({ edge: { dx: -1 } }).errors.length > 0);
  assert.ok(readStyle({ air: { back: 1.5 } }).errors.length > 0);
});

test('重さの目安：1マップの板は150枚以下（設計書 §3.3）', () => {
  for (const m of Object.values(d.maps)) {
    const n = m.stage.layers.reduce((s, l) => s + l.items.length, 0) + d.ledger.party.length;
    assert.ok(n * 3 + 2 <= 150 * 3, `${m.id}: 板 ${n}`);
  }
});

test('紙の舞台のコード：外部の読込なし・ミップマップなし・最近傍', () => {
  const src = readFileSync(join(root, 'src/render/paper-stage.js'), 'utf8');
  assert.ok(!/https?:\/\//.test(src), '外部URLを読まない');
  assert.ok(!/generateMipmap|LINEAR/.test(src), 'にじませる設定を使わない');
  assert.ok(/TEXTURE_MAG_FILTER, gl\.NEAREST/.test(src));
});

test('ふちと影は板の真後ろ（カメラから遠い側）に置かれる（板の手前に出ない）', () => {
  for (const p of [40, 50, 55, 70]) for (const f of ['camera', 'upright']) {
    const { ay } = boardAxes(f, p);
    const n = boardNormal(ay);
    assert.ok(Math.abs(n[0] * ay[0] + n[1] * ay[1] + n[2] * ay[2]) < 1e-12, '板の面に垂直');
    const { eye } = cameraEye({ x: 0, y: 0 }, p, 24, 360, 32);
    const toCam = [eye[0], eye[1], eye[2]];
    assert.ok(n[0] * toCam[0] + n[1] * toCam[1] + n[2] * toCam[2] > 0, `${f} ${p}°: 法線はカメラ側`);
    // 下へ1ドットずらしてから真後ろへ dz 下げた点は、元の板の面より奥
    const down = [-ay[0] / 32, -ay[1] / 32, -ay[2] / 32];
    const pt = [down[0] - n[0] * 0.02, down[1] - n[1] * 0.02, down[2] - n[2] * 0.02];
    assert.ok(pt[0] * n[0] + pt[1] * n[1] + pt[2] * n[2] < 0);
  }
});
