// 冒険の記録（src/core/record.js）
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecord, parseRecord, serializeRecord, storeFor, goldOf, giveGold, giveExp, learnSkill, fieldSkills, addIntimacy, intimacyOf, openLink, linkOpenOf, formationOf, applyEffects, pickPage, FIELD_KEYS, BOND_KEY } from '../src/core/record.js';

test('新しい記録：お金0、旗なし、仲間4人の親密度0', () => {
  const r = createRecord();
  assert.equal(goldOf(r), 0);
  assert.deepEqual(r.flags, {});
  assert.deepEqual(intimacyOf(r), { volt: 0, flare: 0, serena: 0, licht: 0 });
  assert.deepEqual(linkOpenOf(r), { volt: false, flare: false, serena: false, licht: false });
});

test('保存した文字列から戻せる。壊れた文字列・形が違うものは新しい記録になる', () => {
  const r = createRecord(); r.flags.q1 = true; addIntimacy(r, 'volt', 3); giveGold(r, 20);
  const back = parseRecord(serializeRecord(r));
  assert.deepEqual(back, r);
  assert.deepEqual(parseRecord('{壊れた'), createRecord());
  assert.deepEqual(parseRecord(JSON.stringify({ format: 'other', version: 1 })), createRecord());
  assert.deepEqual(parseRecord(null), createRecord());
});

test('戦闘に渡す入口：ブラウザの保存と同じ形で読み書きでき、書くたびに知らせる', () => {
  const r = createRecord(); let n = 0;
  const s = storeFor(r, () => n++);
  assert.equal(s.getItem('sr-battle-lv-v1'), null);
  s.setItem('sr-battle-lv-v1', JSON.stringify({ exp: { N: 10 } }));
  assert.equal(JSON.parse(s.getItem('sr-battle-lv-v1')).exp.N, 10);
  s.removeItem('sr-battle-lv-v1');
  assert.equal(s.getItem('sr-battle-lv-v1'), null);
  assert.equal(n, 2);
});

test('お金：戦闘の育ちにあるお金＋まだ受け取っていないお金', () => {
  const r = createRecord();
  r.store['sr-battle-growth-v2'] = JSON.stringify({ gold: 120, exp: {} });
  giveGold(r, 30);
  assert.equal(goldOf(r), 150);
  assert.deepEqual(JSON.parse(r.store[FIELD_KEYS.inbox]), { gold: 30, exp: {} });
});

test('経験値と技：戦闘の名前（1文字）で受け渡す。同じ技は2回覚えない', () => {
  const r = createRecord();
  giveExp(r, 'volt', 15); giveExp(r, 'volt', 5);
  assert.deepEqual(JSON.parse(r.store[FIELD_KEYS.inbox]).exp, { V: 20 });
  assert.equal(learnSkill(r, 'flare', '炎の試し'), true);
  assert.equal(learnSkill(r, 'flare', '炎の試し'), false);
  assert.deepEqual(fieldSkills(r).flare, ['炎の試し']);
  assert.deepEqual(JSON.parse(r.store[FIELD_KEYS.skills]), { F: ['炎の試し'] });
  assert.throws(() => giveExp(r, 'someone', 1));
});

test('親密度：戦闘の親密度（sr-battle-bond-v1）そのもの。0〜120、ナハトは持たない。連携技を開く', () => {
  const r = createRecord();
  assert.equal(addIntimacy(r, 'volt', 2), 2);
  assert.equal(addIntimacy(r, 'volt', -5), 0);
  addIntimacy(r, 'serena', 1); addIntimacy(r, 'licht', 500);
  assert.deepEqual(JSON.parse(r.store[BOND_KEY]), { bond: { V: 0, F: 0, S: 1, L: 120 }, ev: { V: false, F: false, S: false, L: false } });
  assert.equal(openLink(r, 'volt'), true); assert.equal(openLink(r, 'volt'), false);
  assert.equal(linkOpenOf(r).volt, true);
  assert.throws(() => addIntimacy(r, 'nacht', 1));
  // 戦闘が連携技を使って親密度を書いた（+8）分も、そのまま読める
  const b = JSON.parse(r.store[BOND_KEY]); b.bond.V += 8; r.store[BOND_KEY] = JSON.stringify(b);
  assert.equal(intimacyOf(r).volt, 8);
});

test('前の形の記録（intimacy を別に持っていた）は、戦闘の親密度に引きつぐ', () => {
  const old = JSON.stringify({ format: 'sternenring-next-record', version: 1, store: {}, flags: {}, intimacy: { volt: 3, flare: 0, serena: 0, licht: 0 } });
  assert.equal(intimacyOf(parseRecord(old)).volt, 3);
});

test('隊列：決めていなければ null、決めた並びを読める、知らない名前があれば null', () => {
  const r = createRecord();
  assert.equal(formationOf(r), null);
  r.store[FIELD_KEYS.formation] = JSON.stringify(['flare', 'nacht', 'volt', 'serena', 'licht']);
  assert.deepEqual(formationOf(r), ['flare', 'nacht', 'volt', 'serena', 'licht']);
  r.store[FIELD_KEYS.formation] = JSON.stringify(['flare', 'someone']);
  assert.equal(formationOf(r), null);
});

test('出来事の結果をまとめて書き、お知らせを返す。ページは旗で選ぶ', () => {
  const r = createRecord();
  const pages = [{ when: { flags: { herb: true } }, dialogue: 'again' }, { dialogue: 'first', give: { gold: 50, intimacy: { volt: 1 }, openLink: ['volt'], skills: [{ who: 'volt', skill: '試しの技' }] }, set: { flags: { herb: true } } }];
  assert.equal(pickPage(r, pages).dialogue, 'first');
  const notes = applyEffects(r, { ...pages[1].give, flags: pages[1].set.flags });
  assert.deepEqual(notes, ['銅貨を50枚手に入れた', 'ヴォルトは「試しの技」を覚えた', 'ナハトとヴォルトの連携技が開いた', 'ヴォルトとの親密度が上がった']);
  assert.equal(pickPage(r, pages).dialogue, 'again');
  assert.equal(goldOf(r), 50);
});
