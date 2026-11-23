// 効果音（DEV-BOOK-001 rev2）：台帳とハッシュ・鳴らすかの判断・音量・配信
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import http from 'node:http';
import { decideOpenCue, nextLevel, SOUND_LEVELS, DEFAULT_LEVEL, OPEN_CUE_WINDOW } from '../src/audio/sound.js';
import { readJson, root, srcFiles } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { createServer } = require('../tools/serve.cjs');
const audio = readJson('data/audio.json');

// 作者が採用した5点（production/claude/assets/audio/book-recording-v01/adoption.json の sha256）
const ADOPTED = {
  'book_open_v01_denoise.wav': 'd6bdf8a1d092fd952f4e509b21c2cd9e6daf0e0e92769856b8452cf05bba0265',
  'page_turn_01_v01_denoise.wav': '855cc8e038d5b5267da408982f658a99af87d1f90ac7e6e67f9bd26a92b4a048',
  'page_turn_02_v01_denoise.wav': '95a462fab4b4d56776a808ce8430cdcca0d4df94dbabee9e8f2eb880a5ba091f',
  'page_turn_03_v01_denoise.wav': 'bed3c0528fc0b1f9bd89458b1c3ea9342be5785165ceb2b2d6e4f1d616a7b9bb',
  'book_close_soft_v01_denoise.wav': 'd6612775aaab91aff8dc0f221619316a540a94b17cf74bef63e262a00d0cfd24',
};

const BOOK = audio.sounds.filter((s) => s.path.startsWith('assets/audio/book/'));
const FIELD = audio.sounds.filter((s) => s.path.startsWith('assets/audio/field/'));
test('音の台帳：本の録音の採用5点がそろい、ファイルのハッシュが採用時と同じ', () => {
  assert.equal(BOOK.length, 5);
  assert.deepEqual(BOOK.map((s) => s.sourceFile).sort(), Object.keys(ADOPTED).sort());
  for (const s of BOOK) {
    assert.ok(s.path.startsWith('assets/audio/'), s.id);
    const file = join(root, s.sourcePath || s.path); // 採用の WAV（ゲームが鳴らすのは軽い MP3＝path）
    assert.ok(existsSync(file), s.sourcePath);
    assert.ok(existsSync(join(root, s.path)), s.path);
    if (s.encoded) assert.equal(createHash('sha256').update(readFileSync(join(root, s.path))).digest('hex'), s.encoded.sha256, s.path);
    const h = createHash('sha256').update(readFileSync(file)).digest('hex');
    assert.equal(h, ADOPTED[s.sourceFile], s.id);
    assert.equal(s.sha256, h, s.id);
    assert.equal(s.status, 'adopted', s.id);
  }
});

test('足音と扉の音（2026-11-23 作者の録音）：木の床4・布4・石4・扉2。切り出した WAV と MP3 のハッシュが台帳と同じ、元の録音の出どころと切り出し位置がある、足音は小さめ', () => {
  assert.deepEqual(FIELD.map((s) => s.id).sort(), ['sfx.door.close', 'sfx.door.open', 'sfx.step.soft01', 'sfx.step.soft02', 'sfx.step.soft03', 'sfx.step.soft04', 'sfx.step.stone01', 'sfx.step.stone02', 'sfx.step.stone03', 'sfx.step.stone04', 'sfx.step.wood01', 'sfx.step.wood02', 'sfx.step.wood03', 'sfx.step.wood04']);
  for (const s of FIELD) {
    assert.equal(createHash('sha256').update(readFileSync(join(root, s.sourcePath))).digest('hex'), s.sha256, s.sourcePath);
    assert.equal(createHash('sha256').update(readFileSync(join(root, s.path))).digest('hex'), s.encoded.sha256, s.path);
    assert.ok(s.recording?.sha256?.length === 64 && s.recording.end > s.recording.start, s.id);
    assert.ok(s.gain > 0 && s.gain <= 1, s.id);
    if (s.id.startsWith('sfx.step.')) assert.ok(s.gain <= 0.4, `${s.id} 足音は小さめ`);
  }
});

test('割り当てたのは「本がひらく音」「ページをめくる音」3つ「本を閉じる音」と足音・扉の音。割当待ちの音はコードから鳴らさない', () => {
  const assigned = audio.sounds.filter((s) => s.assignedTo && s.path.startsWith('assets/audio/book/')).map((s) => s.id);
  assert.deepEqual(assigned.sort(), ['sfx.book.close', 'sfx.book.open', 'sfx.page.turn01', 'sfx.page.turn02', 'sfx.page.turn03']); // 本を閉じる音は 2026-11-22 作者「閉じる音使ってよ」でメニューを閉じるときに // ページをめくる音は 2026-11-22 作者「ページめくりの音を入れてほしい」
  const text = srcFiles().map((p) => readFileSync(p, 'utf8')).join('\n');
  for (const s of audio.sounds.filter((x) => !x.assignedTo)) assert.ok(!text.includes(s.id), `${s.id} がコードにある`);
  assert.ok(text.includes("'sfx.book.open'"));
  for (const id of ['sfx.page.turn01', 'sfx.page.turn02', 'sfx.page.turn03', ...FIELD.map((s) => s.id)]) assert.ok(text.includes("'" + id + "'"), id);
});

const base = { introPhase: 'playing', introT: 0, ctxState: 'running', loaded: true, level: 'mid', already: '' };

test('本がひらく音：音が有効なら演出の始まりで鳴らす（少し遅れたら頭を飛ばして合わせる）', () => {
  assert.deepEqual(decideOpenCue(base), { decided: true, play: true, offset: 0, reason: 'played' });
  const late = decideOpenCue({ ...base, introT: 0.1 });
  assert.equal(late.play, true); assert.equal(late.offset, 0.1);
});

test('本がひらく音：鳴らす時刻の前（introT がまだ負）は決めずに待つ（2026-11-23 作者「初めに開くのも音が早い」で OPEN_CUE_DELAY だけ遅らせる）', () => {
  const d = decideOpenCue({ ...base, introT: -0.3 });
  assert.equal(d.decided, false); assert.equal(d.play, false);
});

test('本がひらく音：音が有効でないまま始まったら鳴らさない。あとで有効になっても遅れて鳴らさない', () => {
  const w = decideOpenCue({ ...base, ctxState: 'suspended' });
  assert.equal(w.decided, false); assert.equal(w.play, false);
  const gone = decideOpenCue({ ...base, ctxState: 'suspended', introT: OPEN_CUE_WINDOW + 0.01 });
  assert.deepEqual(gone, { decided: true, play: false, offset: 0, reason: 'locked' });
  // いちど決まったら、そのあと音が有効になっても鳴らさない
  assert.equal(decideOpenCue({ ...base, already: gone.reason }).play, false);
  // 有効でも、時間を過ぎていれば鳴らさない
  assert.equal(decideOpenCue({ ...base, introT: 0.5 }).reason, 'late');
  // 読込が間に合わない
  assert.equal(decideOpenCue({ ...base, loaded: false, introT: 0.5 }).reason, 'not-loaded');
});

test('本がひらく音：音量なし・省略/演出なしでは鳴らさない', () => {
  assert.equal(decideOpenCue({ ...base, level: 'off' }).reason, 'muted');
  const skipped = decideOpenCue({ ...base, introPhase: 'done' });
  assert.equal(skipped.decided, true); assert.equal(skipped.play, false);
  const waiting = decideOpenCue({ ...base, introPhase: 'waiting' });
  assert.equal(waiting.decided, false); assert.equal(waiting.play, false);
});

test('音量：中→大→なし→小→中。増幅しない（gain ≤ 1）。始めは中', () => {
  assert.equal(DEFAULT_LEVEL, 'mid');
  const seq = ['mid']; for (let i = 0; i < 4; i++) seq.push(nextLevel(seq.at(-1)));
  assert.deepEqual(seq, ['mid', 'high', 'off', 'low', 'mid']);
  for (const l of SOUND_LEVELS) assert.ok(l.gain >= 0 && l.gain <= 1, l.id);
  assert.equal(SOUND_LEVELS.find((l) => l.id === 'off').gain, 0);
});

test('サーバー：鳴らす音（mp3）を audio/mpeg で配信する', async () => {
  const server = createServer({ root, log: () => {}, own: new Set(['127.0.0.1']) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const res = await new Promise((resolve, reject) => http.get(`http://127.0.0.1:${server.address().port}/${audio.sounds[0].path}`, (r) => { r.resume(); r.on('end', () => resolve(r)); }).on('error', reject));
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'audio/mpeg');
  } finally { await new Promise((r) => server.close(r)); }
});

test('音の部品は保存領域を使わない', () => {
  const t = readFileSync(join(root, 'src/audio/sound.js'), 'utf8');
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(t));
});
