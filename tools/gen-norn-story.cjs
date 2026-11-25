// ノルン導入から追跡開始までの試作（2026-11-25）。台本は世界観・シナリオ室「ノルン導入から追跡開始_試作シナリオ_v01.md」
// （STORY-NORN-PROTOTYPE-20261125、status provisional・担当室の内部試作採用）。台詞と地の文は .md からそのまま読む（文は変えない）。
// 今ある仕組み（話しかける・調べる・旗・立ち絵の会話）だけでつなぐ。置き場所・町の人の絵はClaudeの仮。
//   1〜3 串焼き・手伝い・食事 … 銀鹿亭前の通りの屋台（仮にオットーの串焼き屋）で、オットーに話しかける
//   4   祭りの音が変わる     … もう一度オットーに話しかける（店の手伝いは人波で見えなくなる＝いなくなる）
//   5   刀と一瞬の静止       … 東の荷車（倒れた荷台）を調べる
//   6   戻ってこない人       … オットー（6-1）→ 通りの婦人（目撃。6-2）→ 路地の樽のそば（包み布。6-3の地の文）
//   7   自分たちで追う       … オットーに布を見せる（6-3の残り）と、場面7まで続けて
//   そのあと西の路地の奥を調べると「試作はここまで」
// 旗：story.norn.meal → alarm → saved → witness → cloth → chase。何度流しても同じ結果。
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
    { when: flags({ cloth: true }), dialogue: F + '6c-7', set: flags({ chase: true }) },
    { when: flags({ saved: true }), dialogue: F + 'wait' },
    { when: flags({ alarm: true }), dialogue: F + 'wait' },
    { when: flags({ meal: true }), dialogue: F + '4', set: flags({ alarm: true }) },
    { dialogue: F + '1-3', set: flags({ meal: true }) },
  ],
});
// 6a はオットー：助けたあと（saved）で、まだ目撃を聞いていないとき
m.npcs.find((n) => n.id === 'story-otto').pages.splice(2, 1, { when: flags({ saved: true, witness: false }), dialogue: F + '6a', set: flags({ asked: true }) }, { when: flags({ saved: true }), dialogue: F + 'wait' });
m.npcs.push({ id: 'story-helper', sprite: 'mob04', tone: '#5a6a4a', x: 5, y: 12, dir: 'right', status: 'provisional', hideWhen: flags({ alarm: true }), turn: false,
  note: '店の手伝い（名前・年齢・性別・オットーとの関係は付けない仮の人物）。祭りの音が変わったあとは見えなくなる' });
for (const n of m.npcs.filter((n) => n.id.startsWith('story-'))) {
  const row = m.collision[n.y]; if (row[n.x] !== '.') throw new Error(`${n.id} の所 (${n.x},${n.y}) が床でない`);
  if ((m.events || []).some((e) => e.x === n.x && e.y === n.y)) throw new Error(`${n.id} の所に出来事がある`);
}
const front = (id, page) => { const e = (m.events || []).find((x) => x.id === id) || (m.npcs || []).find((x) => x.id === id); if (!e) throw new Error(id + ' が無い'); e.pages = (e.pages || []).filter((p) => !String(p.dialogue || '').startsWith(F)); e.pages.unshift(page); };
front('life-st-cart', { when: flags({ alarm: true, saved: false }), dialogue: F + '5', set: flags({ saved: true }) }); // 倒れた荷台のそばの人
front('life-st-woman', { when: flags({ asked: true, witness: false }), dialogue: F + '6b', set: flags({ witness: true }) }); // 避難を手伝っていた町の人（目撃）
m.events = (m.events || []).filter((e) => !String(e.id).startsWith('story-'));
m.events.push({ id: 'story-cloth', x: 23, y: 1, trigger: 'examine', status: 'provisional', sparkle: { flag: F + 'cloth', when: flags({ witness: true }) }, pages: [
  { when: flags({ cloth: true }), dialogue: 'sparkle.empty' },
  { when: flags({ witness: true }), dialogue: F + '6c-cloth', set: flags({ cloth: true }) },
  { dialogue: F + 'alley' }] }); // 脇の通り（路地の奥の樽のそば）に落ちている包み布
m.events.push({ id: 'story-end', x: 2, y: 1, trigger: 'examine', status: 'provisional', pages: [{ when: flags({ chase: true }), dialogue: F + 'end' }, { dialogue: F + 'alley' }] });
m.storyNote = '2026-11-25 ノルン導入から追跡開始の試作（tools/gen-norn-story.cjs）。オットー（story-otto）・店の手伝い（story-helper）・包み布（story-cloth）・試作の終わり（story-end）';
write('data/maps/norn-inn-street.json', m);
console.log('ノルン導入の試作：場面', Object.keys(D.lines).filter((k) => k.startsWith(F)).length, '本の会話');
