// きらきら光る所の隠しアイテム（2026-11-24）：道具・素材は記録の inbox に入り、戦闘の持ち物の名前と同じ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRecord, applyEffects, pendingThings, giveGold, goldOf } from '../src/core/record.js';

test('道具・素材を手に入れると inbox に入り、お金は消えない', () => {
  const rec = createRecord();
  giveGold(rec, 5);
  const notes = applyEffects(rec, { items: { '薬草': 1 }, mats: { '光る苔': 2 } });
  assert.deepEqual(pendingThings(rec), { items: { '薬草': 1 }, mats: { '光る苔': 2 } });
  assert.equal(goldOf(rec), 5);
  assert.deepEqual(notes, ['薬草を1つ手に入れた', '光る苔を2つ手に入れた']);
  applyEffects(rec, { items: { '薬草': 2 } });
  assert.equal(pendingThings(rec).items['薬草'], 3);
});

test('光る所の出来事：旗・拾ったあとのページ・戦闘にある名前', () => {
  const battle = readFileSync(new URL('../battle/js/data.js', import.meta.url), 'utf8');
  const known = (n) => battle.includes(`'${n}':`);
  let count = 0;
  for (const f of readdirSync(new URL('../data/maps/', import.meta.url))) {
    const m = JSON.parse(readFileSync(new URL(`../data/maps/${f}`, import.meta.url), 'utf8'));
    for (const e of m.events || []) {
      if (!e.sparkle) continue; count++;
      assert.ok(e.sparkle.flag, `${e.id} に旗`);
      assert.equal(e.pages[0].when?.flags?.[e.sparkle.flag], true, `${e.id} の最初のページは拾ったあと`);
      assert.ok(e.pages.slice(1).every((p) => p.set?.flags?.[e.sparkle.flag] === true || (e.sparkle.when && !p.set)), `${e.id} は拾うと旗が立つ`); // sparkle.when のある所（まだ光っていない間）は、旗を立てないページがあってよい（2026-11-25 包み布）
      for (const p of e.pages) for (const k of ['items', 'mats']) for (const n of Object.keys(p.give?.[k] || {})) assert.ok(known(n), `${e.id} の ${n} が戦闘の持ち物にない`);
    }
  }
  assert.ok(count >= 10);
});
