// 会話の組み立て（2026-11-24）：話しかけるたびに変わる・仲間の合いの手は隊列にいるときだけ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveTalk, isScene } from '../src/core/talk.js';

test('仲間の行は隊列にいるときだけ、名前が付く', () => {
  const raw = [{ who: '商人', text: 'いらっしゃい' }, { member: 'volt', text: 'よう' }, { member: 'licht', text: 'こんにちは' }];
  assert.deepEqual(resolveTalk(raw, { party: ['nacht', 'volt'] }), [{ who: '商人', text: 'いらっしゃい' }, { who: 'ヴォルト', text: 'よう', member: 'volt' }]);
});

test('pick：前と同じものを続けて出さない', () => {
  const raw = { pick: ['A', 'B', 'C'] }, last = {};
  let prev = '';
  for (let i = 0; i < 30; i++) { const t = resolveTalk(raw, { key: 'k', last, rand: () => 0 })[0].text; assert.notEqual(t, prev); prev = t; }
});

test('町の人の会話：2回目からは何通りもあり、どの仲間の行も知っている名前', () => {
  const D = JSON.parse(readFileSync(new URL('../data/dialogue.json', import.meta.url), 'utf8'));
  const again = Object.entries(D.lines).filter(([k, v]) => /^life\..*\.again$/.test(k) && v?.pick);
  assert.ok(again.length >= 20);
  for (const [k, v] of again) {
    assert.ok(v.pick.length >= 4, `${k} は4通り以上`);
    for (const p of v.pick) for (const x of (Array.isArray(p) ? p : [p])) if (x?.member) assert.ok(['nacht', 'volt', 'flare', 'serena', 'licht'].includes(x.member), `${k} の ${x.member}`);
    // 仲間がだれもいなくても、町の人の言葉は残る
    for (let i = 0; i < v.pick.length; i++) assert.ok(resolveTalk(v, { party: [], rand: () => i / v.pick.length }).length > 0, `${k} の ${i}`);
  }
});

test('need の候補は、その仲間がそろっているときだけ選ばれる（2026-11-25 シナリオ室の監査）', () => {
  const raw = { pick: [['A'], { need: ['serena'], say: [{ who: '子ども', text: 'おねえちゃん' }, { member: 'serena', text: 'はい' }] }] };
  for (let i = 0; i < 20; i++) assert.deepEqual(resolveTalk(raw, { party: ['nacht', 'volt'], rand: () => i / 20 }), [{ text: 'A' }]);
  const seen = new Set();
  for (let i = 0; i < 20; i++) seen.add(resolveTalk(raw, { party: ['serena'], rand: () => i / 20 })[0].text);
  assert.ok(seen.has('おねえちゃん'));
});

test('町の会話：呼びかけられる仲間の行は need の中（いない仲間に話しかけない）', () => {
  const D = JSON.parse(readFileSync(new URL('../data/dialogue.json', import.meta.url), 'utf8'));
  const n = Object.values(D.lines).flatMap((v) => v?.pick || []).filter((p) => p && !Array.isArray(p) && p.need).length;
  assert.ok(n >= 20, `need の候補 ${n}`);
});

test('立ち絵の会話（scene.*）：3本。立ち絵の人の表情は8種のどれか、顔の絵の無い表情は台帳に無くてもよい', () => {
  const D = JSON.parse(readFileSync(new URL('../data/dialogue.json', import.meta.url), 'utf8'));
  const L = JSON.parse(readFileSync(new URL('../data/assets.json', import.meta.url), 'utf8'));
  const FACES = ['normal', 'smile', 'surprise', 'angry', 'troubled', 'sad', 'shy', 'serious'];
  const scenes = Object.entries(D.lines).filter(([k]) => k.startsWith('scene.'));
  assert.equal(scenes.length, 3);
  for (const [k, v] of scenes) {
    assert.equal(v.status, 'provisional');
    const lines = resolveTalk(v, { party: ['nacht', 'volt'] });
    assert.ok(isScene(lines), k);
    for (const l of lines) if (l.actor) {
      assert.ok(FACES.includes(l.face || ''), `${k} ${l.face}`);
      const p = L.assets.find((a) => a.id === 'portrait.' + l.actor);
      assert.ok(p && p.noFlip === true, `${k} ${l.actor} の立ち絵`);
      if (l.face !== 'normal') assert.ok(p.faces[l.face], `${k} ${l.actor} ${l.face} の顔`);
    }
  }
});
