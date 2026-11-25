// 歩行・衝突・先行入力・押しっぱなし・追従・転送・往復
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeField, run, tap, pos } from './helpers.mjs';
import { placeFollower } from '../src/core/party.js';
import { mapQuery } from '../src/core/map.js';
import { InputState } from '../src/core/input.js';

/** 迷路の森・迷宮（2026-11-25）：いまのマップで (tx,ty) まで、通れるマスをたどって歩く（見えている敵・町の人・高さの差が2以上のマスは避ける）。着いたマスを返す */
function walkTo(field, input, d, tx, ty) {
  const m = d.maps[field.state.mapId], C = m.collision, L = m.legend, h = (x, y) => Number(m.heights?.[y]?.[x] ?? 0);
  const foes = new Set((m.encounters || []).filter((e) => !(field.view().defeated || []).includes(`${m.id}:${e.id}`)).map((e) => e.x + ',' + e.y));
  const npcs = new Set((m.npcs || []).map((n) => n.x + ',' + n.y));
  const ok = (x, y) => y >= 0 && y < C.length && x >= 0 && x < C[y].length && L[C[y][x]] === 'floor' && !foes.has(x + ',' + y) && !npcs.has(x + ',' + y);
  const s0 = pos(field), prev = { [s0.x + ',' + s0.y]: null }, q = [[s0.x, s0.y]];
  while (q.length) { const [x, y] = q.shift(); if (x === tx && y === ty) break;
    for (const [dx, dy, k] of [[1, 0, 'right'], [-1, 0, 'left'], [0, 1, 'down'], [0, -1, 'up']]) { const nx = x + dx, ny = y + dy, key = nx + ',' + ny; if (key in prev || !ok(nx, ny) || Math.abs(h(nx, ny) - h(x, y)) > 1) continue; prev[key] = [x + ',' + y, k]; q.push([nx, ny]); } }
  const key0 = tx + ',' + ty; if (!(key0 in prev)) throw new Error(`${m.id}：(${tx},${ty}) へ行けない`);
  const path = []; for (let c = key0; prev[c]; c = prev[c][0]) path.unshift(prev[c][1]);
  for (const k of path) tap(field, input, k);
  return pos(field);
}

// 2026-11-22 景観案で、始まりと宿の入口を見開き「銀鹿亭前の通り」(norn-inn-street) へ移した。歩きの基本の確かめは広い広場で行う
const PLAZA = { map: 'norn-plaza', spawn: 'default' };
const STREET_TO_DOOR = [['up', 2]]; // (8,6)→(8,5)→宿の入口(8,4)
const walk = (f, i, route) => { for (const [dir, n] of route) tap(f, i, dir, n); };

test('開始位置：銀鹿亭前の通り(8,6)で下向き（宿から出て通りへ向かう）、ヴォルトは後ろ(8,5)', () => {
  const { field } = makeField();
  assert.equal(field.state.mapId, 'norn-inn-street');
  assert.deepEqual(pos(field), { x: 8, y: 6, dir: 'down' });
  assert.deepEqual([field.state.actors[1].x, field.state.actors[1].y], [8, 5]);
});

test('1歩＝1マス、歩く途中は補間される', () => {
  const { field, input } = makeField(PLAZA);
  input.press('left'); input.release('left');
  run(field, input, 80);
  const v = field.view().actors[0];
  assert.ok(v.x < 12 && v.x > 11, `途中の x=${v.x}`);
  assert.equal(v.motion, 'walk');
  run(field, input, 120);
  assert.deepEqual(pos(field), { x: 11, y: 11, dir: 'left' });
});

test('壁で止まる（向きだけ変わる）', () => {
  const { field, input } = makeField({ map: 'norn-plaza', spawn: 'default' });
  tap(field, input, 'down', 30); // 下の外壁(y=39)の手前で止まる（2026-11-22 ノルンを56×40に広げた）
  assert.deepEqual(pos(field), { x: 12, y: 38, dir: 'down' });
  tap(field, input, 'down');
  assert.deepEqual(pos(field), { x: 12, y: 38, dir: 'down' });
});

test('家具（植えこみ・机・カウンター）で止まる', () => {
  // 2026-11-22 作者の決定で広場の噴水を外したので、広場は植えこみで確かめる。2026-11-23 作者「花壇後ろ直後は歩けるように」で、ぶつかるのは手前の1列(3〜5,15)だけ
  const a = makeField(PLAZA);
  tap(a.field, a.input, 'left', 7); // (12,11)→(5,11)
  tap(a.field, a.input, 'down', 5); // 植えこみのすぐ後ろ(5,13)(5,14)は歩ける。(5,15)が植えこみ
  assert.deepEqual(pos(a.field), { x: 5, y: 14, dir: 'down' });
  const b = makeField({ map: 'silver-deer-1f', spawn: 'default' }); // (10,11)
  tap(b.field, b.input, 'up', 12); // 奥の列(y=1)は吹き抜けの2階の通路（高さ5）なので、1階からは y=2 で止まる（2026-11-22）
  assert.deepEqual(pos(b.field), { x: 10, y: 2, dir: 'up' });
  tap(b.field, b.input, 'left', 2); // (8,2) はカウンター
  assert.deepEqual(pos(b.field), { x: 9, y: 2, dir: 'left' });
  const c = makeField({ map: 'silver-deer-1f', spawn: 'default' });
  tap(c.field, c.input, 'down', 1); tap(c.field, c.input, 'left', 9); // (10,12)→(1,12)
  tap(c.field, c.input, 'up', 1); tap(c.field, c.input, 'right', 3); // (1,11)→(2,11) で机(3,11)に当たる
  assert.deepEqual(pos(c.field), { x: 2, y: 11, dir: 'right' });
});

test('先行入力：70ms 間隔で4回押すと4歩（旧版は3歩）', () => {
  const { field, input } = makeField(PLAZA);
  for (let k = 0; k < 4; k++) { input.press('left'); input.release('left'); run(field, input, 70); }
  run(field, input, 800);
  assert.equal(pos(field).x, 8);
  assert.equal(field.state.steps, 4);
});

test('先行入力は2回分まで（5回連打しても途中のあふれは捨てる）', () => {
  const { field, input } = makeField(PLAZA);
  for (let k = 0; k < 5; k++) { input.press('left'); input.release('left'); run(field, input, 10); }
  run(field, input, 1000);
  assert.equal(field.state.steps, 3); // 1歩目＋たまった2回
});

test('押しっぱなしで歩き続け、離すと止まる', () => {
  const { field, input } = makeField(PLAZA);
  input.press('left');
  run(field, input, 160 * 4 + 10);
  input.release('left');
  run(field, input, 400);
  assert.ok(field.state.steps >= 4 && field.state.steps <= 5, `steps=${field.state.steps}`);
  assert.equal(pos(field).x, 12 - field.state.steps);
});

test('ヴォルトは足あと列をたどる（プレイヤーの1歩前の位置へ）', () => {
  const { field, input } = makeField(PLAZA);
  const before = pos(field);
  tap(field, input, 'left');
  assert.deepEqual([field.state.actors[1].x, field.state.actors[1].y], [before.x, before.y]);
  const p1 = pos(field);
  tap(field, input, 'up');
  assert.deepEqual([field.state.actors[1].x, field.state.actors[1].y], [p1.x, p1.y]);
  assert.equal(field.state.actors[1].dir, 'left'); // 自分が進んだ向き
  // 上の外壁にぶつかって進めないときは、ヴォルトも動かない（2026-11-22 噴水を外したので、外壁で確かめる）
  assert.deepEqual(pos(field), { x: 11, y: 10, dir: 'up' });
  tap(field, input, 'up', 9); // (11,10)→(11,1)
  assert.deepEqual(pos(field), { x: 11, y: 1, dir: 'up' });
  tap(field, input, 'up');
  const v = field.state.actors[1];
  assert.deepEqual(pos(field), { x: 11, y: 1, dir: 'up' });
  assert.deepEqual([v.x, v.y], [11, 2]);
  // 3歩続けると、ヴォルトは常に1歩前のプレイヤー位置にいる
  const trail = [];
  for (const dir of ['left', 'left', 'down']) { trail.push({ x: pos(field).x, y: pos(field).y }); tap(field, input, dir); assert.deepEqual({ x: field.state.actors[1].x, y: field.state.actors[1].y }, trail.at(-1)); }
});

test('並び直し：広場に下向きで着くと、後ろ(5,5)は扉なので横(6,6)', () => {
  const { d } = makeField();
  const q = mapQuery(d.maps['norn-plaza'], d.collision);
  assert.deepEqual(placeFollower(q, { x: 5, y: 6, dir: 'down' }), { x: 6, y: 6 });
  const q2 = mapQuery(d.maps['silver-deer-1f'], d.collision);
  assert.deepEqual(placeFollower(q2, { x: 10, y: 12, dir: 'up' }), { x: 9, y: 12 });
  // 後ろも横も通れないときは重ねる
  const tiny = { width: 3, height: 3, legend: { '.': 'floor', '#': 'wall' }, collision: ['###', '#.#', '###'], exits: [] };
  assert.deepEqual(placeFollower(mapQuery(tiny, d.collision), { x: 1, y: 1, dir: 'up' }), { x: 1, y: 1 });
});

test('銀鹿亭前の通り → 銀鹿亭一階：宿の入口で転送、上向きで(10,11)、ヴォルトは外と同じ並びで真後ろ(10,12)（2026-11-23 作者「同じ並び、同じ向きでそのまま」「主人公も奥へ進む」）', () => {
  const { field, input } = makeField();
  walk(field, input, STREET_TO_DOOR);
  assert.equal(field.state.mapId, 'silver-deer-1f');
  assert.deepEqual(pos(field), { x: 10, y: 11, dir: 'up' });
  assert.deepEqual([field.state.actors[1].x, field.state.actors[1].y, field.state.actors[1].dir], [10, 12, 'up']);
  assert.equal(field.state.transfers, 1);
});

test('銀鹿亭一階 → 銀鹿亭前の通り：出入口で転送、下向きで(8,5)、ヴォルトは中と同じ並びで真後ろ(8,4)（2026-11-23 作者「同じ並び、同じ向きでそのまま」）', () => {
  const { field, input } = makeField({ map: 'silver-deer-1f', spawn: 'default' });
  tap(field, input, 'down', 2); // (10,11)→(10,12)→扉(10,13)
  assert.equal(field.state.mapId, 'norn-inn-street');
  assert.deepEqual(pos(field), { x: 8, y: 5, dir: 'down' });
  assert.deepEqual([field.state.actors[1].x, field.state.actors[1].y, field.state.actors[1].dir], [8, 4, 'down']);
});

test('往復ループしない：扉へ向かうキーを押し続けても転送は1回だけ', () => {
  const { field, input } = makeField({ map: 'silver-deer-1f', spawn: 'default' });
  input.press('down');
  run(field, input, 4500); // 押しっぱなし4.5秒（出る演出 1.3秒＋着く 2.0秒のあと。2026-11-23 出る演出を長くした）
  assert.equal(field.state.transfers, 1);
  assert.equal(field.state.mapId, 'norn-inn-street');
  assert.equal(pos(field).dir, 'down');
  assert.ok(pos(field).y > 5, '扉から離れる方向へ歩いている');
});

test('往復ループしない：転送直後の暗転中の連打は捨てる', () => {
  const { field, input, d } = makeField();
  walk(field, input, [['up', 1]]);
  input.press('up'); input.release('up');
  run(field, input, 170 + (d.world.effects?.['nook-in']?.leaveMs ?? 0) + 20); // 扉に着いて、入る演出の「離れる」時間のあと転送
  assert.equal(field.state.mapId, 'silver-deer-1f');
  for (let k = 0; k < 4; k++) { input.press('down'); input.release('down'); run(field, input, 40); } // 暗転中の連打
  run(field, input, 1000);
  assert.equal(field.state.mapId, 'silver-deer-1f');
  assert.equal(field.state.transfers, 1);
});

test('2往復：銀鹿亭前 → 一階 → 銀鹿亭前 → 一階 → 銀鹿亭前', () => {
  const { field, input } = makeField();
  for (let k = 0; k < 2; k++) {
    if (k === 0) walk(field, input, STREET_TO_DOOR); else tap(field, input, 'up');
    assert.equal(field.state.mapId, 'silver-deer-1f');
    tap(field, input, 'down', 2); // 着く所は入口から1マス奥（2026-11-23）なので、出るまで2歩
    assert.equal(field.state.mapId, 'norn-inn-street');
    assert.deepEqual(pos(field), { x: 8, y: 5, dir: 'down' });
  }
  assert.equal(field.state.transfers, 4);
  assert.deepEqual(field.state.transferLog.map((l) => l.to), ['silver-deer-1f', 'norn-inn-street', 'silver-deer-1f', 'norn-inn-street']);
});

test('入力：離すと押しっぱなしが解け、最後に押した方向が優先', () => {
  const i = new InputState({ buffer: 2 });
  i.press('left'); i.press('up');
  assert.equal(i.held(), 'up');
  i.release('up');
  assert.equal(i.held(), 'left');
  i.releaseAll();
  assert.equal(i.held(), null);
});

// ---- 出入口の演出（2026-11-22 作者の決定：外どうしはページをめくる、建物・ダンジョンはブックヌックに入る／出る） ----
test('演出：広場の東の道 → 森（page）。離れるあいだは入力を受けず、view.effect が leave → arrive と進む', () => {
  const { field, input, d } = makeField({ map: 'norn-plaza', spawn: 'default' }); // (12,11)
  tap(field, input, 'right', 41); // (53,11)（東の道は、広げた町の東の端 x=55）
  input.press('right'); input.release('right');
  run(field, input, field.stepMs + 20); // (54,11)
  input.press('right'); input.release('right');
  run(field, input, field.stepMs + 20); // 東の扉(23,11)を踏む → 離れるあいだ
  assert.equal(field.state.mapId, 'norn-plaza');
  const v = field.view().effect;
  assert.equal(v.kind, 'page'); assert.equal(v.phase, 'leave'); assert.deepEqual(v.at, { x: 55, y: 11 });
  for (let k = 0; k < 3; k++) { input.press('left'); input.release('left'); run(field, input, 40); } // 離れるあいだの連打は捨てる
  run(field, input, d.world.effects.page.leaveMs);
  assert.equal(field.state.mapId, 'test-forest');
  assert.deepEqual(pos(field), { x: 1, y: 7, dir: 'right' });
  assert.equal(field.view().effect.phase, 'arrive');
  assert.equal(field.view().transition, 0); // 演出のある転送は、ふつうの暗転を使わない
  run(field, input, d.world.effects.page.arriveMs + 20);
  assert.equal(field.view().effect, null);
  assert.deepEqual(pos(field), { x: 1, y: 7, dir: 'right' }); // 演出中の連打で動いていない
});

test('演出：迷路の森 → 迷宮（nook-in）→ 森（nook-out）→ 広場（page）。森（64×30）は入口から奥まで歩いて行ける。ダンジョン（25×35）は石の扉の前まで歩ける（2026-11-25）', () => {
  const { field, input, d } = makeField({ map: 'test-forest', spawn: 'default' }); // (8,7)
  field.dev.setNoRandom(true); // 迷路は街道の外を歩くので、ランダムの戦闘を止めて道だけ確かめる
  assert.deepEqual(walkTo(field, input, d, 58, 4), { x: 58, y: 4, dir: pos(field).dir }); // 迷路を抜けて門の前へ
  tap(field, input, 'up'); // 入口(58,3)
  assert.equal(field.state.mapId, 'test-dungeon');
  const dg = d.maps['test-dungeon'], gate = dg.exits[0];
  assert.deepEqual(pos(field), { x: gate.x, y: gate.y - 2, dir: 'up' });
  const g0 = dg.gates[0];
  walkTo(field, input, d, g0.x + 1, g0.y + 1); tap(field, input, 'up'); // 中央の広間の、石の扉の前まで歩ける
  assert.deepEqual([pos(field).x, pos(field).y], [g0.x + 1, g0.y + 1]); // 閉じた石の扉は通れない（記録が無いので旗は立たない）
  walkTo(field, input, d, gate.x, gate.y - 1); tap(field, input, 'down'); // 出口
  assert.equal(field.state.mapId, 'test-forest');
  assert.deepEqual(pos(field), { x: 58, y: 4, dir: 'down' });
  walkTo(field, input, d, 1, 7);
  tap(field, input, 'left', 1); // 西の道(0,7)
  assert.equal(field.state.mapId, 'norn-plaza');
  assert.deepEqual(pos(field), { x: 54, y: 11, dir: 'left' });
  assert.deepEqual(field.state.transferLog.map((l) => l.to), ['test-dungeon', 'test-forest', 'norn-plaza']);
});

test('ダンジョンの謎解き（2026-11-25 サニー「大きなイベントを作ってみて」）：石の扉は西と東のレバーを2つ倒すと開き、番人に勝つと奥の宝の台まで行ける', async () => {
  const { createRecord } = await import('../src/core/record.js');
  const { loadAll } = await import('./helpers.mjs');
  const { createField } = await import('../src/core/field.js');
  const d = loadAll(), record = createRecord();
  const field = createField({ maps: d.maps, collision: d.collision, world: { ...d.world, start: { map: 'test-dungeon', spawn: 'default' } }, party: d.ledger.party, record });
  const input = new InputState({ buffer: d.world.inputBuffer });
  field.dev.setNoRandom(true);
  const dg = d.maps['test-dungeon'], g0 = dg.gates[0], altar = dg.events.find((e) => e.id === 'dungeon-altar');
  walkTo(field, input, d, g0.x + 1, g0.y + 1); tap(field, input, 'up');
  assert.deepEqual([pos(field).x, pos(field).y], [g0.x + 1, g0.y + 1]); // 閉じた扉は通れない
  input.pressAction(); run(field, input, 20); assert.equal(field.state.message?.dialogue, 'du.gate.closed'); field.closeMessage(); // 扉を調べると手がかり
  const texts = [];
  for (const id of ['du-lever-w', 'du-lever-e']) {
    const lv = dg.events.find((e) => e.id === id); walkTo(field, input, d, lv.x, lv.y + 1); tap(field, input, 'up');
    assert.ok(field.view().sparkles.some((sp) => sp.id === id)); // 倒すまでは光っている
    input.pressAction(); run(field, input, 20); texts.push(field.state.message?.dialogue); field.closeMessage();
    assert.ok(!field.view().sparkles.some((sp) => sp.id === id));
  }
  assert.deepEqual(texts, ['du.lever.first', 'du.lever.last']);
  assert.ok(field.view().openGates.includes(g0.id)); // 2つ倒すと開く
  const foe = dg.encounters[0]; walkTo(field, input, d, foe.x, foe.y + 1); tap(field, input, 'up');
  assert.equal(field.state.battle?.id, foe.id); field.endBattle('win'); run(field, input, 20); // 番人
  walkTo(field, input, d, altar.x, altar.y + 1); tap(field, input, 'up');
  input.pressAction(); run(field, input, 20); assert.equal(field.state.message?.dialogue, 'dungeon.altar.first');
});

test('ノルン導入の試作（2026-11-25 シナリオ室）：オットー→祭りの異変→荷車の救助→オットー→目撃→包み布→オットーで追跡へ。店の手伝いは異変のあといなくなる', async () => {
  const { createRecord } = await import('../src/core/record.js');
  const { loadAll } = await import('./helpers.mjs');
  const { createField } = await import('../src/core/field.js');
  const d = loadAll(), record = createRecord();
  const field = createField({ maps: d.maps, collision: d.collision, world: d.world, party: d.ledger.party, record });
  const input = new InputState({ buffer: d.world.inputBuffer });
  const m = d.maps['norn-inn-street'], otto = m.npcs.find((n) => n.id === 'story-otto');
  const talk = (x, y, face) => { walkTo(field, input, d, x, y); tap(field, input, face); input.pressAction(); run(field, input, 20); const k = field.state.message?.dialogue; field.closeMessage(); return k; };
  const atOtto = () => talk(otto.x + 1, otto.y, 'left');
  assert.ok(field.view().npcs.some((n) => n.id === 'story-helper'));
  const marked = () => field.view().marks.map((mk) => mk.id);
  assert.ok(marked().includes('story-otto') && marked().includes('life-st-crates')); // しるし：オットーと、まだ見ていない立ち絵の会話（2026-11-25 サニー「イベントが始まるところにはしるしを」）
  assert.equal(atOtto(), 'story.norn.1-3');
  assert.equal(atOtto(), 'story.norn.4');
  assert.ok(!field.view().npcs.some((n) => n.id === 'story-helper')); // 異変のあと、店の手伝いはいない
  assert.ok(marked().includes('life-st-cart') && !marked().includes('story-otto')); // しるしは荷車へ移る
  const cart = m.events.find((e) => e.id === 'life-st-cart'); assert.equal(talk(cart.x, cart.y + 1, 'up'), 'story.norn.5');
  assert.equal(atOtto(), 'story.norn.6a');
  const woman = m.npcs.find((n) => n.id === 'life-st-woman'); assert.equal(talk(woman.x, woman.y + 1, 'up'), 'story.norn.6b');
  const clothEv = m.events.find((e) => e.id === 'story-cloth'); assert.ok(field.view().sparkles.some((sp) => sp.id === clothEv.id)); // 目撃を聞くと、包み布の所が光る
  const cloth = m.events.find((e) => e.id === 'story-cloth'); assert.equal(talk(cloth.x, cloth.y + 1, 'up'), 'story.norn.6c-cloth');
  assert.equal(atOtto(), 'story.norn.6c-7');
  const end = m.events.find((e) => e.id === 'story-end'); assert.equal(talk(end.x, end.y + 1, 'up'), 'story.norn.end');
  assert.equal(record.flags['story.norn.chase'], true);
  assert.ok(!marked().some((id) => /^story-|life-st-(cart|woman)/.test(id))); // 見終わると、物語のしるしは残らない
});

test('銀鹿亭：右の階段で吹き抜けの2階の通路へ上がり、奥の扉から客室へ入って戻る（2026-11-22）', () => {
  const { field, input } = makeField({ map: 'silver-deer-1f', spawn: 'default' }); // (10,11)
  tap(field, input, 'up', 6); tap(field, input, 'right', 8); // (10,5) → 階段のいちばん下の段(18,5)（高さ1：1階から1段は上がれる）
  assert.deepEqual(pos(field), { x: 18, y: 5, dir: 'right' });
  tap(field, input, 'up', 4); // 階段(18,4〜2) → 2階の通路(18,1)
  assert.deepEqual(pos(field), { x: 18, y: 1, dir: 'up' });
  tap(field, input, 'left', 6); // 通路を(12,1)へ
  assert.deepEqual(pos(field), { x: 12, y: 1, dir: 'left' });
  tap(field, input, 'down', 1); // 通路から1階へは飛び降りられない（高さ5→0）
  assert.deepEqual(pos(field), { x: 12, y: 1, dir: 'down' });
  tap(field, input, 'up', 1); // 奥の扉(12,0) → 客室B
  assert.equal(field.state.mapId, 'silver-deer-room-b');
  assert.deepEqual(pos(field), { x: 4, y: 5, dir: 'up' });
  tap(field, input, 'down', 1); // 客室の出口(4,6) → 通路の扉の前(12,1)
  assert.equal(field.state.mapId, 'silver-deer-1f');
  assert.deepEqual(pos(field), { x: 12, y: 1, dir: 'down' });
  // 1階から通路へ、横からは上がれない
  const b = makeField({ map: 'silver-deer-1f', spawn: 'default' });
  tap(b.field, b.input, 'up', 7); tap(b.field, b.input, 'right', 7); // (10,4) → (17,4)
  tap(b.field, b.input, 'right', 1); // 階段(18,4)は高さ2：1階(0)から横には上がれない
  assert.deepEqual(pos(b.field), { x: 17, y: 4, dir: 'right' });
});

test('銀鹿亭：2階の通路は左の壁ぞいに曲がってのびる（L字の回廊）。下の1階からは上がれない', () => {
  const { field, input } = makeField({ map: 'silver-deer-1f', spawn: 'default' }); // (10,11)
  tap(field, input, 'up', 6); tap(field, input, 'right', 8); tap(field, input, 'up', 4); // 階段で通路(18,1)へ
  tap(field, input, 'left', 17); // 通路を左の端(1,1)まで
  assert.deepEqual(pos(field), { x: 1, y: 1, dir: 'left' });
  tap(field, input, 'down', 10); // 左の壁ぞいの回廊を手前へ。端(1,9)で止まる（(1,10)は1階の床で高さがちがう）
  assert.deepEqual(pos(field), { x: 1, y: 9, dir: 'down' });
  const b = makeField({ map: 'silver-deer-1f', spawn: 'default' });
  tap(b.field, b.input, 'down', 1); tap(b.field, b.input, 'left', 9); tap(b.field, b.input, 'up', 3); // (1,12)→(1,10)、回廊(1,9)へは上がれない
  assert.deepEqual(pos(b.field), { x: 1, y: 10, dir: 'up' });
});

test('銀鹿亭：左の壁ぞいの回廊の扉から客室C・Dへ入って戻る（2026-11-22）', () => {
  const { field, input } = makeField({ map: 'silver-deer-1f', spawn: 'default' });
  tap(field, input, 'up', 6); tap(field, input, 'right', 8); tap(field, input, 'up', 4); tap(field, input, 'left', 17); // 通路の左端(1,1)
  tap(field, input, 'down', 3); // 回廊(1,4)
  tap(field, input, 'left', 1); // 扉(0,4) → 客室C
  assert.equal(field.state.mapId, 'silver-deer-room-c');
  tap(field, input, 'down', 1); // 出口 → 扉の前(1,4)
  assert.equal(field.state.mapId, 'silver-deer-1f');
  assert.deepEqual(pos(field), { x: 1, y: 4, dir: 'right' });
  tap(field, input, 'down', 3); tap(field, input, 'left', 1); // (1,7) → 扉(0,7) → 客室D
  assert.equal(field.state.mapId, 'silver-deer-room-d');
});

// ---- 見えている敵（2026-11-22 作者「森に敵が見えていて、ぶつかると戦闘」） ----
test('見えている敵：ぶつかると戦闘になり、戦闘中は歩けない。負けると敵は残り、勝つと消えて通れる', () => {
  const { field, input, d } = makeField({ map: 'test-forest', spawn: 'default' }); // (8,7)
  field.dev.setNoRandom(true);
  walkTo(field, input, d, 14, 8); tap(field, input, 'down'); // (14,9) で下を向く。敵は (14,10)
  assert.deepEqual(pos(field), { x: 14, y: 9, dir: 'down' });
  tap(field, input, 'down');
  assert.deepEqual(field.view().battle, { id: 'forest-beasts', battle: 'normal', mapId: 'test-forest' });
  assert.deepEqual(pos(field), { x: 14, y: 9, dir: 'down' }, '敵のマスへは入らない');
  tap(field, input, 'left', 3);
  assert.deepEqual(pos(field), { x: 14, y: 9, dir: 'down' }, '戦闘中は歩けない');
  field.endBattle('lose');
  assert.equal(field.view().battle, null);
  tap(field, input, 'down');
  assert.equal(field.view().battle, null, '負けた・逃げたすぐあとは、ぶつかっても戦闘にならない（2026-11-22 作者「またバトルになるのはどうして？」）');
  tap(field, input, 'up'); tap(field, input, 'down');
  assert.deepEqual(pos(field), { x: 14, y: 9, dir: 'down' }, '1歩動いて戻る');
  tap(field, input, 'down');
  assert.ok(field.view().battle, '負けたら敵は残っていて、1歩動いたあとにまたぶつかると戦闘');
  field.endBattle('win');
  assert.deepEqual(field.view().defeated, ['test-forest:forest-beasts']);
  tap(field, input, 'down');
  assert.deepEqual(pos(field), { x: 14, y: 10, dir: 'down' }, '勝ったあとは敵のいたマスを通れる');
  assert.equal(field.view().battle, null);
  assert.deepEqual(field.state.battles.map((b) => b.outcome), ['lose', 'win']);
});

test('ランダムの戦闘：街道の上では起きず、街道の外では歩くと起きる。勝っても何も残らない', () => {
  const { field, input, d } = makeField({ map: 'test-forest', spawn: 'default' }); // (8,7)＝街道の上
  for (let k = 0; k < 20; k++) { tap(field, input, k % 2 ? 'left' : 'right'); assert.equal(field.view().battle, null, '街道の上ではランダムの戦闘は起きない'); }
  // 街道の外へ（2026-11-25 迷路の森：入口の広場と小道の上が街道）。右どなりも街道の外のマスを探して、そこで左右に歩く
  const m = d.maps['test-forest'], on = (x, y) => m.roads.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  let spot = null; for (let y = 1; y < m.height - 1 && !spot; y++) for (let x = 1; x < m.width - 2 && !spot; x++) if (m.collision[y][x] === '.' && m.collision[y][x + 1] === '.' && !on(x, y) && !on(x + 1, y) && !(m.encounters || []).some((e) => Math.abs(e.x - x) < 3 && e.y === y)) spot = [x, y];
  field.dev.setNoRandom(true); walkTo(field, input, d, spot[0], spot[1]); field.dev.setNoRandom(false);
  let n = 0; while (!field.view().battle && n < 400) { tap(field, input, n % 2 ? 'left' : 'right'); n++; }
  const b = field.view().battle;
  assert.ok(b && b.random, `街道の外を歩くとランダムの戦闘になる（${n}歩）`);
  assert.ok(['normal', 'swarm', 'elements', 'casters'].includes(b.battle));
  field.endBattle('win');
  assert.deepEqual(field.view().defeated, [], 'ランダムの戦闘は倒しても何も残らない');
  assert.equal(field.state.wildSteps, 0);
});

test('広い出入口（3マス）：出たのと同じ列に着く（銀鹿亭前の東のいちばん下 → 広場の西のいちばん下）', () => {
  const { field, input, d } = makeField(); // 銀鹿亭前 (8,6)
  tap(field, input, 'down', 2); tap(field, input, 'right', 34); // (42,8)（2026-11-23 家を大きくして通りを44マスに）
  assert.deepEqual(pos(field), { x: 42, y: 8, dir: 'right' });
  input.press('right'); input.release('right'); run(field, input, field.stepMs + 20); // 東の出入口の下の段 (43,8)
  assert.deepEqual(field.view().effect.at, { x: 43, y: 8 }, '踏んだマス');
  run(field, input, d.world.effects.page.leaveMs + 20);
  assert.equal(field.state.mapId, 'norn-plaza');
  assert.deepEqual(pos(field), { x: 1, y: 12, dir: 'right' }, '広場の西の出入口の下の段の隣');
});

test('隊列：setParty で並びを変えると、先頭がいまの場所に立ち、後ろはその順に並ぶ', () => {
  const { field, d } = makeField();
  const people = [...d.ledger.party, ...(d.ledger.cast || [])];
  const want = ['flare', 'nacht', 'licht', 'serena', 'volt'];
  const before = pos(field);
  field.setParty(want.map((id) => people.find((p) => p.id === id)));
  assert.deepEqual(field.state.actors.map((a) => a.id), want);
  assert.deepEqual({ x: field.state.actors[0].x, y: field.state.actors[0].y }, { x: before.x, y: before.y });
});

test('調べる：向いている先の出来事を動かし、記録に書く。2回目は旗で別のページ。言葉が出ているあいだは歩けない', async () => {
  const { createRecord, goldOf, fieldSkills } = await import('../src/core/record.js');
  const { loadAll } = await import('./helpers.mjs');
  const { createField } = await import('../src/core/field.js');
  const d = loadAll(), record = createRecord(); let changed = 0;
  const field = createField({ maps: d.maps, collision: d.collision, world: { ...d.world, start: { map: 'test-forest', spawn: 'default' } }, party: d.ledger.party, record, onRecordChange: () => changed++ });
  const input = new InputState({ buffer: d.world.inputBuffer });
  field.dev.setNoRandom(true);
  walkTo(field, input, d, 20, 10); // 薬草の茂み (20,10) の上に立って調べる（足もとの出来事も調べられる。迷路の森では上のマスが茂みの壁）
  const here = pos(field); assert.deepEqual([here.x, here.y], [20, 10]);
  input.pressAction(); run(field, input, 20);
  assert.equal(field.view().message.dialogue, 'forest.herbs.first');
  assert.deepEqual(field.view().message.notes, ['銅貨を30枚手に入れた']);
  assert.equal(goldOf(record), 30); assert.equal(changed, 1);
  tap(field, input, 'left'); assert.deepEqual(pos(field), here, '言葉が出ているあいだは歩けない');
  field.closeMessage();
  input.pressAction(); run(field, input, 20);
  assert.equal(field.view().message.dialogue, 'forest.herbs.again');
  assert.equal(goldOf(record), 30, '2回目はもらえない');
  field.closeMessage();
  walkTo(field, input, d, 28, 10); // 古い石碑の上で調べる
  input.pressAction(); run(field, input, 20);
  assert.deepEqual(fieldSkills(record).volt, ['閃光弾']);
});

test('開発者メニュー：ワープ・すぐ戦う・ランダムの戦闘なし・倒した敵を戻す', () => {
  const { field, input } = makeField();
  assert.equal(field.dev.warp('test-forest'), true);
  assert.equal(field.state.mapId, 'test-forest');
  assert.deepEqual(pos(field), { x: 8, y: 7, dir: 'right' });
  assert.equal(field.dev.warp('no-such-map'), false);
  run(field, input, 400);
  field.dev.setNoRandom(true);
  tap(field, input, 'down', 2); // 街道の外
  for (let k = 0; k < 120; k++) tap(field, input, k % 2 ? 'left' : 'right');
  assert.equal(field.view().battle, null, 'ランダムの戦闘なしなら起きない');
  assert.equal(field.dev.fight('swarm'), true);
  assert.equal(field.view().battle.battle, 'swarm');
  field.endBattle('win');
  field.state.defeated.push('test-forest:forest-beasts');
  field.dev.reviveFoes();
  assert.deepEqual(field.view().defeated, []);
});

test('扉の音のために：宿の入口を通ると、離れるあいだも着いたあとも view.effect.exit が通った出入口の id（2026-11-23）', () => {
  const { field, input, d } = makeField();
  tap(field, input, 'up', 1);
  input.press('up'); input.release('up'); run(field, input, field.stepMs + 20);
  assert.deepEqual([field.view().effect?.phase, field.view().effect?.exit], ['leave', 'inn-door']);
  run(field, input, d.world.effects['nook-in'].leaveMs + 20);
  assert.equal(field.state.mapId, 'silver-deer-1f');
  assert.deepEqual([field.view().effect?.phase, field.view().effect?.exit], ['arrive', 'inn-door']);
  assert.equal(d.maps['silver-deer-1f'].footsteps, 'wood', '銀鹿亭の中は木の床の足音');
});

test('奥へ（試し）：広場の北の道は「背景に入りこむ」演出（dive）で森の南へ。森の南の道から広場の北へ戻れる（2026-11-23）', () => {
  const { field, input, d } = makeField({ map: 'norn-plaza', spawn: 'default' }); // (12,11)
  tap(field, input, 'right', 1); tap(field, input, 'up', 10); // (13,1)
  assert.deepEqual(pos(field), { x: 13, y: 1, dir: 'up' });
  input.press('up'); input.release('up'); run(field, input, field.stepMs + 20);
  assert.deepEqual([field.view().effect?.kind, field.view().effect?.phase], ['dive', 'leave']);
  run(field, input, d.world.effects.dive.leaveMs + 20);
  assert.equal(field.state.mapId, 'test-forest');
  assert.deepEqual(pos(field), { x: 30, y: 28, dir: 'up' }); // 出入口の左の列から入ったので、左の列に着く
  assert.deepEqual([field.view().effect?.kind, field.view().effect?.phase], ['dive', 'arrive']);
  run(field, input, d.world.effects.dive.arriveMs + 20);
  tap(field, input, 'down', 1);
  // 戻りは「背景から出てくる」（tap は離れる・着く演出を待つので、着いた演出の種類で確かめる）
  assert.equal(field.state.mapId, 'norn-plaza');
  assert.equal(field.state.arriveKind, 'emerge');
  assert.deepEqual(pos(field), { x: 13, y: 1, dir: 'down' });
});

test('歩く速さ（開発者の窓）：setStepScale で1マスの時間が変わり、1でもとに戻る（2026-11-23）', () => {
  const { field, d } = makeField();
  const base = d.world.stepMs;
  assert.equal(field.stepMs, base);
  field.setStepScale(2); assert.equal(field.stepMs, base / 2);
  field.setStepScale(1); assert.equal(field.stepMs, base);
});

test('SHIFT で走る：押している間は1マスの時間が短く、同じ時間で遠くへ（2026-11-23 作者「SHIFTで早く動けるようにしてほしい」）', () => {
  const go = (/** @type {boolean} */ runK) => {
    const { field, input } = makeField(PLAZA);
    const x0 = pos(field).x;
    input.run = runK; input.press('left'); run(field, input, 800); input.release('left'); input.run = false; run(field, input, 400);
    return x0 - pos(field).x;
  };
  const walkN = go(false), runN = go(true);
  assert.ok(walkN >= 4 && walkN <= 6, `歩き ${walkN}マス`);
  assert.ok(runN >= walkN * 1.6, `走り ${runN}マス（歩き ${walkN}）`);
});

test('確かめ用のワープ：行けるマスへは移る、行けないマス・ないマップでは何もしない（2026-11-23 作者「テストの時ワープとか使ったら？」）', () => {
  const { field } = makeField();
  assert.equal(field.warp('test-forest', 58, 4, 'up'), true);
  assert.equal(field.state.mapId, 'test-forest');
  assert.deepEqual(pos(field), { x: 58, y: 4, dir: 'up' });
  assert.equal(field.warp('test-forest', 0, 0), false);
  assert.equal(field.warp('no-such-map', 1, 1), false);
  assert.equal(field.state.mapId, 'test-forest');
});

test('立ち絵の会話：銀鹿亭の受付は一度だけ立ち絵の会話、二度目からはいつもの言葉。ナハトとヴォルトがそろわないと出ない', async () => {
  const { createRecord } = await import('../src/core/record.js');
  const { createField } = await import('../src/core/field.js');
  const { loadAll } = await import('./helpers.mjs');
  const d = loadAll();
  const at = (party) => {
    const record = createRecord();
    const field = createField({ maps: d.maps, collision: d.collision, world: { ...d.world, start: { map: 'silver-deer-1f', spawn: 'default' } }, party, record });
    const input = new InputState({ buffer: d.world.inputBuffer });
    walkTo(field, input, d, 5, 4); tap(field, input, 'up'); // 受付 (5,3) に向かう
    assert.equal(pos(field).dir, 'up');
    return { field, input, record };
  };
  const { field, input, record } = at(d.ledger.party);
  input.pressAction(); run(field, input, 20);
  assert.equal(field.view().message.dialogue, 'scene.day01');
  assert.equal(record.flags['scene.day01'], true);
  field.closeMessage(); input.pressAction(); run(field, input, 20);
  assert.equal(field.view().message.dialogue, 'inn.counter', '二度目はいつもの言葉');
  const solo = at(d.ledger.party.filter((p) => p.id === 'nacht'));
  solo.input.pressAction(); run(solo.field, solo.input, 20);
  assert.equal(solo.field.view().message.dialogue, 'inn.counter', 'ヴォルトがいないと立ち絵の会話は出ない');
});

test('会話の演出（2026-11-25 サニー「モブキャラとか敵とかを出して動かして」）：出した人は時間で動き、会話を閉じると消える。ぶつからない', () => {
  const { field, input } = makeField({ map: 'norn-inn-street', spawn: 'default' });
  field.sceneAct([{ spawn: 'beast', img: 'battle/img/enemies/sr-beast.png', h: 2.6, x: 20, y: 8 }, { move: 'beast', to: [10, 8], ms: 1000 }]);
  const at = () => field.view().npcs.find((n) => n.id === 'cast:beast');
  assert.ok(at() && at().moving && at().dir === 'left');
  run(field, input, 500); assert.ok(Math.abs(at().x - 15) < 0.5, `半分の時間で半分（${at().x}）`);
  run(field, input, 600); assert.equal(at().x, 10); assert.ok(!at().moving);
  field.closeMessage(); assert.ok(!at(), '会話を閉じると消える');
});

test('歩き回る町の人（2026-11-25 星環祭）：道をたどって行き来し、ぶつからない', () => {
  const { field, input, d } = makeField({ map: 'norn-inn-street', spawn: 'default' });
  const w0 = field.view().npcs.filter((n) => n.id.startsWith('walk:'));
  assert.equal(w0.length, d.maps['norn-inn-street'].walkers.length);
  run(field, input, 4000);
  const w1 = field.view().npcs.filter((n) => n.id.startsWith('walk:'));
  assert.ok(w1.some((n, i) => Math.hypot(n.x - w0[i].x, n.y - w0[i].y) > 1), '4秒でだれかが1マス以上動く');
  for (const n of w1) assert.ok(n.x >= 0 && n.y >= 0 && n.x < d.maps['norn-inn-street'].width && n.y < d.maps['norn-inn-street'].height);
});
