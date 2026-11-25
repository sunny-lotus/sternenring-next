// ノルン導入から追跡開始までの試作（2026-11-25）。台本は世界観・シナリオ室「ノルン導入から追跡開始_試作シナリオ_v01.md」
// （STORY-NORN-PROTOTYPE-20261125、status provisional・担当室の内部試作採用）。台詞と地の文は .md からそのまま読む（文は変えない）。
// 今ある仕組み（話しかける・調べる・旗・立ち絵の会話）だけでつなぐ。置き場所・町の人の絵はClaudeの仮。
//   1〜3 串焼き・手伝い・食事 … 銀鹿亭前の通りの屋台（仮にオットーの串焼き屋）で、オットーに話しかける
//   4   祭りの音が変わる     … もう一度オットーに話しかける（店の手伝いは人波で見えなくなる＝いなくなる）
//   5   刀と一瞬の静止       … 東の荷車（倒れた荷台）を調べる
//   6   戻ってこない人       … オットー（6-1）→ 通りの婦人（目撃。6-2）→ 路地の樽のそば（包み布。6-3の地の文）
//   7   自分たちで追う       … オットーに布を見せる（6-3の残り）と、場面7まで続けて
//   そのあと西の路地の奥を調べると「試作はここまで」
// 旗：story.norn.meal → alarm → saved → witness → cloth → chase → ended。何度流しても同じ結果。
// mark: true のページ＝次に見るイベントの始まり。フィールドでしるしが出る（2026-11-25 サニー「イベントが始まるところにはしるしを」）
// 使い方：<node> tools/gen-norn-story.cjs（gen-town-life.cjs・gen-novel-scenes.cjs のあとに流す）
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const write = (f, d) => fs.writeFileSync(path.join(root, f), JSON.stringify(d, null, 2) + '\n');
const SRC = path.join(process.env.USERPROFILE || 'C:/Users/takhy', 'OneDrive/ドキュメント/ChatGPT/物語/production/claude/scenario/ノルン導入から追跡開始_試作シナリオ_v01.md');
const md = fs.readFileSync(SRC, 'utf8');
const ACTOR = { ナハト: 'nacht', ヴォルト: 'volt' };
const META = /(見せる|映さない|説明しない|扱わない|この試作|置かない|作らない)/;
const SKIP = /^(操作案|見せるもの|伏せるもの|「私」は|#)/;

/** 場面 n の本文を、台詞（話者｜表情｜文）と地の文の並びにする */
function sceneLines(n) {
  const sec = md.split(/^## /m).find((x) => x.startsWith(`場面${n} `)); if (!sec) throw new Error(`場面${n} が無い`);
  const out = [];
  for (const raw of sec.split('\n').slice(1)) {
    const l = raw.trim(); if (!l || SKIP.test(l)) continue;
    const m = l.match(/^(.+?)｜([a-z]+)｜(.+)$/);
    if (m) { const who = m[1].trim(), text = m[3].trim(); out.push(ACTOR[who] ? { who, actor: ACTOR[who], face: m[2], text } : { who, text }); }
    else if (/ところまで見せる/.test(l)) continue; // 段落ぜんぶが作り手向けの指示（店の手伝いの見せ方）
    else { const t = l.split(/(?<=。)/).filter((x) => !META.test(x)).join('').trim(); if (t) out.push(t); } // 地の文。作り手向けの注意（見せる・映さない・説明しない…）の文は画面に出さない
  }
  return out;
}
/** 台詞の並びを、ある文の前で分ける */
const cut = (lines, startsWith) => { const i = lines.findIndex((x) => (typeof x === 'string' ? x : x.text).startsWith(startsWith)); if (i < 0) throw new Error(`「${startsWith}」が無い`); return [lines.slice(0, i), lines.slice(i)]; };

const s1 = sceneLines(1), s2 = sceneLines(2), s3 = sceneLines(3), s4 = sceneLines(4), s5 = sceneLines(5), s6 = sceneLines(6), s7 = sceneLines(7);
const [s6a, s6rest] = cut(s6, '近くで避難を手伝っていた');
const [s6b, s6c] = cut(s6rest, '脇の通りに、店で使っていた包み布');
const title = (t) => `――${t}――`; // 場面の見出し（画面の表示用）
// 演出（2026-11-25 サニー「イベントが会話だけで見た目が何も変わらない、モブキャラとか敵とかを出して動かして」。Claudeの仮の動き。文は変えない）：
// ある文を出すときに、人や敵を出して動かす（act。field.sceneAct）。位置は銀鹿亭前の通りのマス。会話が終わると消える
const BEAST = 'battle/img/enemies/sr-beast.png';
const act = (lines, startsWith, acts) => { const i = lines.findIndex((x) => (typeof x === 'string' ? x : x.text).startsWith(startsWith)); if (i < 0) throw new Error('演出の文が無い：' + startsWith); const x = lines[i]; lines[i] = typeof x === 'string' ? { text: x, act: acts } : { ...x, act: acts }; };
const run = (id, sprite, x, y, to, ms, dir) => [{ spawn: id, sprite, x, y, dir: dir || 'left' }, { move: id, to, ms }];
// 場面2：客が重なる → 客が3人やって来て、屋台（6〜8,11〜12）の前に並ぶ。場面3：客足が落ち着く → 帰っていく
// カメラは主人公（オットーの右、10,11）のうしろから奥を見るので、演出の人や敵は奥（北、10段より上）に出す
act(s2, '客が重なる', [...run('c1', 'mob01', 17, 9, [6, 10], 2600), ...run('c2', 'mob02', 19, 8, [7, 10], 2900), ...run('c3', 'mob03', 21, 9, [8, 10], 3200)]);
act(s3, '客足が一度落ち着く', [{ move: 'c1', to: [24, 7], ms: 3200 }, { move: 'c2', to: [26, 6], ms: 3400 }, { move: 'c3', to: [22, 8], ms: 3000 }]);
// 場面4：通りの奥に星獣が現れ、町の人が西へ逃げる。最後に星獣は東へ
act(s4, '通りの向こうで、何かが倒れる音', [{ spawn: 'beast', img: BEAST, h: 2.6, x: 20, y: 8, dir: 'left' }, { move: 'beast', to: [14, 9], ms: 2600 },
  ...run('r1', 'mob01', 15, 8, [1, 8], 2600), ...run('r2', 'mob02', 16, 10, [1, 10], 2900), ...run('r3', 'mob04', 14, 9, [2, 9], 2400), ...run('r4', 'mob03', 17, 8, [3, 8], 3100)]);
act(s4, '分かった。走れる人は壁際へ', [{ move: 'beast', to: [24, 7], ms: 2600 }]); // ヴォルトが人を逃がすあいだに、星獣は東の奥へ
// 場面5：荷車（39〜41,11〜12）のそばに取り残された人と星獣。人を逃がしたあと、星獣は北東へ抜ける
act(s5, '倒れた荷台のそばに人がいる', [{ spawn: 'p', sprite: 'mob02', x: 40, y: 10, dir: 'left' }, { spawn: 'beast', img: BEAST, h: 2.6, x: 33, y: 7, dir: 'right' }, { move: 'beast', to: [37, 9], ms: 1800 }]); // 主人公は荷車の下（40,13）から上を見る。荷車の奥に取り残された人
act(s5, 'ナハトは突進を正面から受けず', [{ move: 'p', to: [42, 7], ms: 2000 }, { move: 'beast', to: [36, 8], ms: 600 }]);
act(s5, '目前の人を逃がす', [{ move: 'beast', to: [28, 6], ms: 2200 }, { move: 'p', to: [42, 5], ms: 1500 }]);
// 物語の一連のあいだの町の人の言葉と地の文（2026-11-25 STORY-NORN-LOCK-20261125：世界観・シナリオ室「ノルン導入_町の人の言葉_v01.md」の19項目。provisional・夜の試作用の担当採用、正式採用は作者）。
// 表（段・種類・文）を .md からそのまま読む。町の人は who: 町の人、地の文は括弧で囲む。saved・chase の調べる文は busy-saved・busy-chase に分けた
const LOCK_SRC = path.join(process.env.USERPROFILE || 'C:/Users/takhy', 'OneDrive/ドキュメント/ChatGPT/物語/production/claude/scenario/ノルン導入_町の人の言葉_v01.md');
const P = (lines) => ({ lines, status: 'provisional', source: 'production/claude/scenario/ノルン導入_町の人の言葉_v01.md' });
const LOCK_LINES = (() => {
  const body = fs.readFileSync(LOCK_SRC, 'utf8').split(/^## /m).find((x) => x.startsWith('差替え本文')); if (!body) throw new Error('差替え本文が無い');
  const rows = body.split('\n').filter((l) => /^\| *(meal|alarm|saved|chase) *\|/.test(l)).map((l) => l.split('|').slice(1, -1).map((x) => x.trim()));
  const KEY = { meal: 'calm', alarm: 'alarm', saved: 'saved', chase: 'chase' }, BUSY = { meal: 'busy-calm', alarm: 'busy', saved: 'busy-saved', chase: 'busy-chase' }, STAY = { meal: 'stay-calm', alarm: 'stay-alarm', saved: 'stay-saved', chase: 'stay-chase' };
  const F = 'story.norn.', out = {};
  for (const [st, kind, text] of rows) {
    const m = kind.match(/^町の人(\d)$/);
    if (m) out[`${F}mob.${KEY[st]}-${m[1]}`] = P([{ who: '町の人', text }]);
    else if (kind.startsWith('調べる')) out[F + BUSY[st]] = P([`（${text}）`]);
    else if (kind.startsWith('出口')) out[F + STAY[st]] = P([`（${text}）`]);
  }
  if (Object.keys(out).length !== 19) throw new Error('町の人の言葉が19項目でない：' + Object.keys(out).length);
  return out;
})();
const SC = (scene, ttl, lines) => ({ scene, title: ttl, lines, status: 'provisional', source: 'production/claude/scenario/ノルン導入から追跡開始_試作シナリオ_v01.md' });
const D = read('data/dialogue.json');
for (const k of Object.keys(D.lines)) if (k.startsWith('story.norn.')) delete D.lines[k];
Object.assign(D.lines, {
  'story.norn.1-3': SC('NORN-1-3', '串焼きの前で／少しだけ働く／働いた分の食事', [title('串焼きの前で'), ...s1, title('少しだけ働く'), ...s2, title('働いた分の食事'), ...s3]),
  'story.norn.4': SC('NORN-4', '祭りの音が変わる', [title('祭りの音が変わる'), ...s4]),
  'story.norn.5': SC('NORN-5', '刀と 一瞬の静止', [title('刀と 一瞬の静止'), ...s5]),
  'story.norn.6a': SC('NORN-6a', '戻ってこない人', [title('戻ってこない人'), ...s6a]),
  'story.norn.6b': SC('NORN-6b', '戻ってこない人（目撃）', s6b),
  'story.norn.6c-cloth': SC('NORN-6c', '戻ってこない人（包み布）', [s6c[0]]),
  'story.norn.6c-7': SC('NORN-6c-7', '戻ってこない人／自分たちで追う', [...s6c.slice(1), title('自分たちで追う'), ...s7]),
  // 試作の区切り（物語の文ではなく、画面のお知らせ）
  'story.norn.end': ['（ノルン導入の試作は、ここまでです。脇の通りの先は、まだ作っていません。）'],
  'story.norn.wait': ['（オットーが、行き交う人を何度も見ている。）'],
  'story.norn.alley': ['（細い路地の奥。荷が置いてある。）'],
  // 物語の一連のあいだの、町の人の言葉と画面のお知らせ（2026-11-25 サニー「ストーリーが始まったらほかのモブたちのセリフも変わり…ストーリーの流れを断ち切らないように」）。
  // 世界観・シナリオ室「ノルン導入_町の人の言葉_v01.md」（STORY-NORN-LOCK-20261125）
  ...LOCK_LINES,
});
D.storyNote = '2026-11-25：story.norn.* は世界観・シナリオ室「ノルン導入から追跡開始_試作シナリオ_v01」（provisional・担当室の内部試作採用）を tools/gen-norn-story.cjs が写したもの。story.norn.end・wait・alley はClaudeの画面のお知らせ';
write('data/dialogue.json', D);

const F = 'story.norn.';
const flags = (o) => ({ flags: Object.fromEntries(Object.entries(o).map(([k, v]) => [F + k, v])) });
const m = read('data/maps/norn-inn-street.json');
m.npcs = (m.npcs || []).filter((n) => !String(n.id).startsWith('story-'));
m.npcs.push({
  id: 'story-otto', sprite: 'mob01', tone: '#7a4a2a', x: 9, y: 11, dir: 'left', status: 'provisional', wantSprite: 'otto',
  note: 'オットー（串焼き屋）。絵はまだ無いので町の人①の絵を借りる。屋台（6,11）は仮にオットーの店',
  pages: [
    { when: flags({ chase: true }), dialogue: F + 'wait' },
    { when: flags({ cloth: true }), dialogue: F + '6c-7', set: flags({ chase: true }), mark: true },
    { when: flags({ saved: true }), dialogue: F + 'wait' },
    { when: flags({ alarm: true }), dialogue: F + 'wait' },
    { when: flags({ meal: true }), dialogue: F + '4', set: flags({ alarm: true }), mark: true },
    { dialogue: F + '1-3', set: flags({ meal: true }), mark: true },
  ],
});
// 6a はオットー：助けたあと（saved）で、まだ目撃を聞いていないとき
m.npcs.find((n) => n.id === 'story-otto').pages.splice(2, 1, { when: flags({ saved: true, witness: false }), dialogue: F + '6a', set: flags({ asked: true }), mark: true }, { when: flags({ saved: true }), dialogue: F + 'wait' });
m.npcs.push({ id: 'story-helper', sprite: 'mob04', tone: '#5a6a4a', x: 5, y: 12, dir: 'right', status: 'provisional', hideWhen: flags({ alarm: true }), turn: false,
  note: '店の手伝い（名前・年齢・性別・オットーとの関係は付けない仮の人物）。祭りの音が変わったあとは見えなくなる' });
for (const n of m.npcs.filter((n) => n.id.startsWith('story-'))) {
  const row = m.collision[n.y]; if (row[n.x] !== '.') throw new Error(`${n.id} の所 (${n.x},${n.y}) が床でない`);
  if ((m.events || []).some((e) => e.x === n.x && e.y === n.y)) throw new Error(`${n.id} の所に出来事がある`);
}
const front = (id, page) => { const e = (m.events || []).find((x) => x.id === id) || (m.npcs || []).find((x) => x.id === id); if (!e) throw new Error(id + ' が無い'); e.pages = (e.pages || []).filter((p) => !String(p.dialogue || '').startsWith(F)); e.pages.unshift(page); };
front('life-st-cart', { when: flags({ alarm: true, saved: false }), dialogue: F + '5', set: flags({ saved: true }), mark: true }); // 倒れた荷台のそばの人
front('life-st-woman', { when: flags({ asked: true, witness: false }), dialogue: F + '6b', set: flags({ witness: true }), mark: true }); // 避難を手伝っていた町の人（目撃）
m.events = (m.events || []).filter((e) => !String(e.id).startsWith('story-'));
m.events.push({ id: 'story-cloth', x: 23, y: 1, trigger: 'examine', status: 'provisional', sparkle: { flag: F + 'cloth', when: flags({ witness: true }) }, pages: [
  { when: flags({ cloth: true }), dialogue: 'sparkle.empty' },
  { when: flags({ witness: true }), dialogue: F + '6c-cloth', set: flags({ cloth: true }) },
  { dialogue: F + 'alley' }] }); // 脇の通り（路地の奥の樽のそば）に落ちている包み布
m.events.push({ id: 'story-end', x: 2, y: 1, trigger: 'examine', status: 'provisional', pages: [{ when: flags({ chase: true, ended: false }), dialogue: F + 'end', set: flags({ ended: true }), mark: true }, { when: flags({ chase: true }), dialogue: F + 'end' }, { dialogue: F + 'alley' }] });
// 物語の一連（field の storyLock）：串焼きの場面を見てから（meal）試作の終わり（ended）まで、ほかの出来事・戦闘・隣のマップへの移動は起きず、町の人は段ごとの言葉を話す
const mob = (k, n) => Array.from({ length: n }, (_, i) => `${F}mob.${k}-${i + 1}`);
m.storyLock = {
  id: 'norn-intro', status: 'provisional', prefix: F, idPrefix: 'story-', active: flags({ meal: true }), until: flags({ ended: true }),
  phases: [
    { when: flags({ chase: true }), talk: mob('chase', 2), examine: F + 'busy-chase', exit: F + 'stay-chase', walkers: false },
    { when: flags({ saved: true }), talk: mob('saved', 3), examine: F + 'busy-saved', exit: F + 'stay-saved', walkers: false },
    { when: flags({ alarm: true }), talk: mob('alarm', 3), examine: F + 'busy', exit: F + 'stay-alarm', walkers: false },
    { talk: mob('calm', 3), examine: F + 'busy-calm', exit: F + 'stay-calm' },
  ],
};
m.storyNote = '2026-11-25 ノルン導入から追跡開始の試作（tools/gen-norn-story.cjs）。オットー（story-otto）・店の手伝い（story-helper）・包み布（story-cloth）・試作の終わり（story-end）';
write('data/maps/norn-inn-street.json', m);
console.log('ノルン導入の試作：場面', Object.keys(D.lines).filter((k) => k.startsWith(F)).length, '本の会話');
