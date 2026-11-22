// マップ・台帳の検証と、壊したマップを確実に見つけるか（逆テスト）
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMap, validateLinks, validateLedger } from '../src/core/map.js';
import { loadAll, clone } from './helpers.mjs';

const d = loadAll();
const ctx = { collision: d.collision, ledger: d.ledger, regions: d.regions };
const allErrors = (maps = d.maps, ledger = d.ledger) => [
  ...validateLedger(ledger),
  ...Object.values(maps).flatMap((m) => validateMap(m, { ...ctx, ledger })),
  ...validateLinks(maps, d.collision),
];

test('本物のデータはすべて合格', () => {
  assert.deepEqual(allErrors(), []);
});

/** 1か所だけ壊して、狙いの文が出ることを確かめる */
function broken(name, mutate, expect) {
  test(`逆テスト：${name}`, () => {
    const maps = clone(d.maps), ledger = clone(d.ledger);
    mutate(maps, ledger);
    const errs = allErrors(maps, ledger);
    assert.ok(errs.some((e) => expect.test(e)), `期待した失敗が無い: ${expect}\n${errs.join('\n')}`);
  });
}

broken('行の長さが width と違う', (m) => { m['norn-plaza'].collision[3] = m['norn-plaza'].collision[3].slice(1); }, /行の長さ=width/);
broken('height と行数が違う', (m) => { m['silver-deer-1f'].height += 1; }, /行数=height/);
broken('凡例に無い文字', (m) => { const r = m['norn-plaza'].collision; r[10] = '#' + '?' + r[10].slice(2); }, /凡例に無い文字/);
broken('凡例の種類が衝突表に無い', (m) => { m['norn-plaza'].legend['#'] = 'lava'; }, /衝突表に無い/);
broken('到着位置が壁', (m) => { m['norn-inn-street'].exits[0].to.arrive = { x: 0, y: 0, dir: 'up' }; }, /到着位置.*通れない/);
broken('到着位置が相手の出入口の上（往復ループ）', (m) => { m['norn-inn-street'].exits[0].to.arrive = { x: 10, y: 13, dir: 'up' }; }, /出入口の上/);
broken('到着位置がマップの外', (m) => { m['silver-deer-1f'].exits[0].to.arrive = { x: 999, y: 12, dir: 'down' }; }, /到着位置.*通れない/);
broken('到着位置が家具（机）の上', (m) => { m['norn-inn-street'].exits[0].to.arrive = { x: 4, y: 6, dir: 'up' }; }, /到着位置.*通れない/);
broken('双方向でない', (m) => { m['silver-deer-1f'].exits[0].to.exit = 'nowhere'; }, /双方向でない/);
broken('行き先のマップが無い', (m) => { m['norn-inn-street'].exits[0].to.map = 'unknown-map'; }, /行き先.*無い/);
broken('出入口が扉の上に無い', (m) => { m['norn-inn-street'].exits[0].x = 12; m['norn-inn-street'].exits[0].y = 11; }, /扉\(door\)の上に無い/);
broken('扉のマスに出入口が無い', (m) => { m['norn-plaza'].exits = []; }, /exit が無い/);
broken('to.exit の欠落', (m) => { delete m['norn-inn-street'].exits[0].to.exit; }, /to \(map\/exit\/arrive\) が欠けている/);
broken('出現位置が壁', (m) => { m['norn-plaza'].spawns.default = { x: 0, y: 0, dir: 'up' }; }, /spawn default が通れない/);
broken('舞台の板がマップ外', (m) => { m['norn-plaza'].stage.layers[1].items[0].x = 300; }, /がマップ外/);
broken('台帳に無い素材ID', (m) => { m['norn-plaza'].stage.layers[1].items[0].asset = 'art.unknown'; }, /台帳に無い/);
broken('素材の領域名が無い', (m) => { m['silver-deer-1f'].stage.layers[2].items[0].region = 'no-such-region'; }, /領域が無い/);
broken('最後のページに条件', (m) => { m['silver-deer-1f'].events[0].pages.at(-1).when = { flags: { x: true } }; }, /最後のページ/);
broken('format 違い', (m) => { m['norn-plaza'].format = 'other'; }, /format/);
broken('キャラ絵の noFlip 欠落', (_m, l) => { delete l.assets.find((a) => a.id === 'chara.nacht.walk').noFlip; }, /noFlip/);
broken('キャラ絵の noFlip=false', (_m, l) => { l.assets.find((a) => a.id === 'chara.volt.walk').noFlip = false; }, /noFlip/);
broken('向きの行の並びが違う（左右入れ替え）', (_m, l) => { l.assets.find((a) => a.id === 'chara.volt.walk').directions = ['down', 'right', 'left', 'up']; }, /向きの並び/);
broken('台帳の path が上の階層を指す', (_m, l) => { l.assets[0].path = 'assets/../../STERNENRING_RPG_CORE/x.png'; }, /path が不正/);
broken('隠し通路の範囲がマップ外', (m) => { m['norn-inn-street'].stage.hiddenPaths = [{ x: 40, y: 1, w: 9, h: 2 }]; }, /hiddenPaths.*マップ外/);
broken('光の玉の数が多すぎる', (m) => { m['test-forest'].stage.orbs.count = 99; }, /stage.orbs の値が不正/);
broken('床の種類が不正', (m) => { m['test-forest'].stage.floor = 'lava'; }, /stage.floor/);
broken('石畳の範囲がマップ外', (m) => { m['norn-inn-street'].stage.paved = [{ x: 40, y: 5, w: 9, h: 2 }]; }, /stage.paved.*マップ外/);
broken('見えている敵が壁の上', (m) => { m['test-forest'].encounters[0].y = 0; }, /encounters .* は通れる床のマスに置く/);
broken('見えている敵の id が重なる', (m) => { m['test-forest'].encounters.push({ ...m['test-forest'].encounters[0] }); }, /encounters の id .*重なっている/);
broken('街道がマップ外', (m) => { m['test-forest'].roads.push({ x: 60, y: 0, w: 9, h: 1 }); }, /roads .* がマップ外/);
broken('ランダムの戦闘に敵の組が無い', (m) => { m['test-forest'].randomEncounters.battles = []; }, /randomEncounters は/);
broken('出入口の span が大きすぎる', (m) => { m['norn-plaza'].exits[0].span = 12; }, /span は1〜9/);
