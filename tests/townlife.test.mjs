// 町の人と会話（2026-11-24 作者「イベントや会話、適当に沢山作っといて」）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tap, run, pos, loadAll } from './helpers.mjs';
import { createField } from '../src/core/field.js';
import { createRecord } from '../src/core/record.js';
import { InputState } from '../src/core/input.js';

const dialogue = JSON.parse(readFileSync(new URL('../data/dialogue.json', import.meta.url), 'utf8'));

test('町の人：立っているマスは通れない。向かいあって調べると話し、話した相手はこちらを向く。2回目は別の言葉', () => {
  const d = loadAll(), record = createRecord();
  const field = createField({ maps: d.maps, collision: d.collision, world: d.world, party: d.ledger.party, record });
  const input = new InputState({ buffer: d.world.inputBuffer });
  tap(field, input, 'right', 21); tap(field, input, 'down', 8); // 銀鹿亭前の通り (8,6) → (29,14)
  assert.deepEqual(pos(field), { x: 29, y: 14, dir: 'down' });
  tap(field, input, 'right'); // (30,14) に年寄りが立っている
  assert.deepEqual(pos(field), { x: 29, y: 14, dir: 'right' }, '町の人のマスへは進めない（向きだけ変わる）');
  assert.equal(field.view().npcs.find((n) => n.id === 'life-st-elder').dir, 'down');
  input.pressAction(); run(field, input, 20);
  assert.equal(field.view().message.event, 'npc:life-st-elder');
  assert.equal(field.view().message.dialogue, 'life.st-elder.first');
  assert.equal(field.view().npcs.find((n) => n.id === 'life-st-elder').dir, 'left', '話すとこちらを向く');
  field.closeMessage();
  input.pressAction(); run(field, input, 20);
  assert.equal(field.view().message.dialogue, 'life.st-elder.again');
});

test('どの地図の出来事・町の人の言葉も、dialogue.json にある（文の並びは {who,text} か文字列）', () => {
  const d = loadAll(), missing = [];
  for (const [id, m] of Object.entries(d.maps)) {
    for (const src of [...(m.events || []), ...(m.npcs || [])]) for (const p of src.pages || []) {
      if (!p.dialogue) continue;
      const v = dialogue.lines[p.dialogue];
      if (v === undefined) missing.push(`${id}:${src.id}:${p.dialogue}`);
      else if (Array.isArray(v)) for (const l of v) assert.ok(typeof l === 'string' || (typeof l.text === 'string' && l.text.length), `${p.dialogue} の行`);
    }
  }
  assert.deepEqual(missing, []);
});

test('町のにぎわい：通り・広場・銀鹿亭・家の中に、町の人と調べる出来事がある（仮）', () => {
  const d = loadAll(), count = (pred) => Object.values(d.maps).reduce((s, m) => s + pred(m), 0);
  assert.ok((d.maps['norn-inn-street'].npcs || []).length >= 5);
  assert.ok((d.maps['norn-plaza'].npcs || []).length >= 8);
  assert.ok(count((m) => (m.events || []).filter((e) => String(e.id).startsWith('life-')).length) >= 60);
  assert.ok(count((m) => (m.npcs || []).filter((n) => /resident$/.test(n.id)).length) >= 6, '家の中の住人');
});

test('町の人の名前と話し方（2026-11-26 STORY-NPC-IDENTITY）：名簿の41人に名前があり、言葉の話し手が名前になっている。物語のあいだは、その人用の言葉を話す', async () => {
  const { readJson } = await import('./helpers.mjs');
  const roster = readJson('data/npc-roster.json'), D = readJson('data/dialogue.json').lines, inn = readJson('data/maps/norn-inn-street.json');
  assert.equal(roster.npcs.length, 41);
  assert.ok(roster.npcs.every((n) => n.name && n.voice));
  const tim = roster.npcs.find((n) => n.id === 'life-st-child'); assert.equal(tim.name, 'ティム');
  const whos = new Set(JSON.stringify(D).match(/"who":"[^"]+"/g)); assert.ok(whos.has('"who":"ティム"') && whos.has('"who":"フーベルト"'));
  const v = inn.storyLock.variants; assert.ok(Object.keys(v).length > 0);
  for (const [, map] of Object.entries(v)) for (const key of Object.values(map)) assert.ok(D[key], key);
});
