// 曲（DEV-BOOK-001 rev3）：台帳とハッシュ・WAVの中身（周波数・フレーム数）・マップの割当・曲の切りかえ判断・照合
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { decideBgm, checkBuffer, DEFAULT_BGM_LEVEL } from '../src/audio/bgm.js';
import { readJson, root, srcFiles } from './helpers.mjs';

const audio = readJson('data/audio.json');
const world = readJson('data/world.json');
// production/claude/assets/BGM-TOWN-CELTIC-V30.json の値
const SPEC = { sha256: '5b71fcac158d97e8e8929fc74904ce30792fd8b423193038b2ab948bff9d6d08', sampleRateHz: 44100, channels: 2, sampleWidthBytes: 2, frames: 3024000 };
const ID = 'bgm.town.celtic.v30';

/** RIFF/WAVE を読んで fmt と data の大きさを返す */
function parseWav(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF'); assert.equal(buf.toString('ascii', 8, 12), 'WAVE');
  let p = 12, fmt = null, dataBytes = -1;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4), size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(p + 8), channels: buf.readUInt16LE(p + 10), rate: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) };
    if (id === 'data') dataBytes = size;
    p += 8 + size + (size & 1);
  }
  return { fmt, dataBytes };
}

test('曲の台帳：作者指定の v30、ファイルのハッシュ・周波数・フレーム数が指定と同じ', () => {
  const t = audio.bgm.find((b) => b.id === ID);
  assert.equal(t.id, ID); assert.equal(t.version, 30); assert.equal(t.status, 'adopted');
  assert.equal(t.sha256, SPEC.sha256);
  assert.deepEqual([t.sampleRateHz, t.channels, t.sampleWidthBytes, t.frames], [SPEC.sampleRateHz, SPEC.channels, SPEC.sampleWidthBytes, SPEC.frames]);
  assert.deepEqual(t.loop, { mode: 'whole_asset_loop', startFrame: 0, endFrameExclusive: SPEC.frames, introRepeats: true });
  const file = join(root, t.sourcePath || t.path); // 採用の WAV（ゲームが鳴らすのは軽い MP3＝path）
  assert.ok(existsSync(file), t.path);
  const buf = readFileSync(file);
  assert.equal(createHash('sha256').update(buf).digest('hex'), SPEC.sha256);
  const w = parseWav(buf);
  assert.deepEqual(w.fmt, { format: 1, channels: 2, rate: 44100, bits: 16 });
  assert.equal(w.dataBytes / (SPEC.channels * SPEC.sampleWidthBytes), SPEC.frames);
  assert.ok(Math.abs(SPEC.frames / SPEC.sampleRateHz - 68.571428571) < 1e-6);
});

test('曲の割当：今の仮の広場・銀鹿亭一階・客室A〜Dは同じ曲（屋内外・客室の出入りで頭に戻さない。2026-11-22 作者「客室も曲変わらないように」）', () => {
  const town = ['norn-inn-street', 'norn-plaza', 'silver-deer-1f', 'silver-deer-room-a', 'silver-deer-room-b', 'silver-deer-room-c', 'silver-deer-room-d', ...world.maps.filter((/** @type {string} */ m) => m.startsWith('norn-house-')), 'norn-square', 'norn-east-street', 'norn-kingsroad', 'norn-north-gate', 'norn-west-street', 'norn-south-street', 'erde-village', 'norn-ne', 'norn-nw', 'norn-se', 'norn-kingsroad-wall-b', 'norn-kingsroad-wall-c']; // 2026-11-25 STORY-NORN-MAP の町・村・四地区も町の曲（森は光のアルペジオ） // 町の家の中も同じ曲（2026-11-24 作者「家の中も同じ曲で」）
  assert.deepEqual(Object.keys(audio.bgmByMap).sort(), [...town, 'test-dungeon', 'test-forest', 'erde-forest-east', 'erde-forest-fork', 'erde-deep'].sort());
  for (const [m, id] of Object.entries(audio.bgmByMap)) { assert.ok(world.maps.includes(m), m); assert.equal(id, town.includes(m) ? ID : 'bgm.field.hikari-no-arpeggio', m); } // 町以外は光のアルペジオ（2026-11-22 作者）
});

test('曲の判断：同じ曲なら続ける、無い所では止める、演出中は流さない', () => {
  const byMap = audio.bgmByMap;
  assert.deepEqual(decideBgm({ mapId: 'norn-plaza', byMap, current: null, introBlocking: false }), { want: ID, action: 'start' });
  assert.deepEqual(decideBgm({ mapId: 'silver-deer-1f', byMap, current: ID, introBlocking: false }), { want: ID, action: 'keep' });
  assert.deepEqual(decideBgm({ mapId: 'norn-plaza', byMap, current: ID, introBlocking: false }), { want: ID, action: 'keep' });
  assert.deepEqual(decideBgm({ mapId: 'norn-plaza', byMap, current: null, introBlocking: true }), { want: null, action: 'none' });
  assert.deepEqual(decideBgm({ mapId: 'other', byMap, current: ID, introBlocking: false }), { want: null, action: 'stop' });
  assert.deepEqual(decideBgm({ mapId: 'x', byMap: { x: 'b' }, current: ID, introBlocking: false }), { want: 'b', action: 'switch' });
});

test('曲の照合：周波数が変わった（再標本化）・フレーム数が違うものは exact にしない', () => {
  assert.deepEqual(checkBuffer({ sampleRate: 44100, length: 3024000, numberOfChannels: 2 }, SPEC), { exact: true, reason: 'ok' });
  assert.equal(checkBuffer({ sampleRate: 48000, length: 3291429, numberOfChannels: 2 }, SPEC).exact, false);
  assert.equal(checkBuffer({ sampleRate: 44100, length: 3023999, numberOfChannels: 2 }, SPEC).exact, false);
  assert.equal(checkBuffer({ sampleRate: 44100, length: 3024000, numberOfChannels: 1 }, SPEC).exact, false);
  assert.equal(DEFAULT_BGM_LEVEL, 'mid');
});

test('曲のコード：全体ループ（loopStart/loopEnd を動かさない・速度を変えない・重ねない）、保存しない', () => {
  const text = readFileSync(join(root, 'src/audio/bgm.js'), 'utf8');
  assert.ok(text.includes('src.loop = true'));
  assert.ok(!/\.loopStart\s*=[^=]|\.loopEnd\s*=[^=]|playbackRate|detune/.test(text), 'ループ範囲・速度を書きかえない');
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(text));
  // 曲は効果音の stopAll と別経路（sound.js から bgm を触らない）
  assert.ok(!readFileSync(join(root, 'src/audio/sound.js'), 'utf8').includes('bgm'));
  assert.ok(srcFiles().some((p) => readFileSync(p, 'utf8').includes("bgm.setHidden(document.hidden)")));
});

test('光のアルペジオ：町以外の曲。ファイルのハッシュ・フレーム数が台帳と同じ、約24.646秒ごとに重ねるループ', () => {
  const t = audio.bgm.find((b) => b.id === 'bgm.field.hikari-no-arpeggio');
  assert.ok(t);
  const buf = readFileSync(join(root, t.sourcePath || t.path));
  assert.equal(createHash('sha256').update(buf).digest('hex'), t.sha256);
  const w = parseWav(buf);
  assert.deepEqual(w.fmt, { format: 1, channels: 1, rate: 44100, bits: 16 });
  assert.equal(w.dataBytes / 2, t.frames);
  assert.equal(t.loop.mode, 'overlap_period');
  assert.ok(Math.abs(t.loop.periodSeconds - 24.646153846) < 1e-6);
  assert.ok(t.loop.periodSeconds < t.seconds, '音源の終わりより前に次の周を始める（余韻を重ねる）');
});
