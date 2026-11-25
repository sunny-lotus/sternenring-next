// @ts-check
// 会話の組み立て（2026-11-24 作者「会話をもっと弾ませてほしい、受け答えや仲間の発言をしっかり出して欲しい」「めっちゃパターンを用意して」）。
// 描画にも DOM にも依存しない（Node のテストで動く）。
//
// dialogue.lines の値：
// - 1行の文（文字列）／行の並び（文字列か {who, text}）
// - { pick: [言葉, 言葉, …] }：話しかけるたびに、どれか1つ（前と同じものは続けない）
//   候補を { need: ['serena'], say: [行…] } にすると、その仲間が隊列にいるときだけ選ばれる（呼びかけられる人がいないと会話にならないもの。2026-11-25 シナリオ室の監査）
// - { scene: 'EVT-DAY-01', lines: [行…] }：立ち絵の出る会話（サウンドノベルの形。2026-11-24 作者「立ち絵がでてサウンドノベル的な会話形式のイベントがあってもいいな」）
// 行の {member: 'volt', text}：仲間の言葉。その仲間が隊列にいるときだけ出る（名前は自動で付く）
// 行の {actor: 'nacht', face: 'troubled'}：立ち絵の人と表情（会話の画面が使う。顔の絵が無ければ normal）

export const MEMBER_NAME = Object.freeze({ nacht: 'ナハト', volt: 'ヴォルト', flare: 'フレア', serena: 'セレナ', licht: 'リヒト' });

/** @typedef {{ who?: string, text: string, member?: string, actor?: string, face?: string, act?: any[] }} TalkLine */

/**
 * @param {any} raw dialogue.lines の値
 * @param {{ party?: string[], key?: string, last?: Record<string, number>, rand?: () => number }} [o]
 *   party＝いま隊列にいる仲間の名前、key と last＝前にどれを選んだか（同じものを続けない）、rand＝0〜1 の乱数
 * @returns {TalkLine[]}
 */
export function resolveTalk(raw, o = {}) {
  const rand = o.rand || Math.random, party = new Set(o.party || []);
  let v = raw;
  if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.pick) && v.pick.length) {
    // 選べる候補（need の仲間がそろっているもの）だけから選ぶ。番号は pick の中の番号で覚える
    const ok = v.pick.map((/** @type {any} */ p, /** @type {number} */ i) => ({ p, i })).filter(({ p }) => !(p && !Array.isArray(p) && typeof p === 'object' && Array.isArray(p.need)) || p.need.every((/** @type {string} */ m) => party.has(m)));
    const pool = ok.length ? ok : [{ p: v.pick[0], i: 0 }];
    const n = pool.length, prev = o.key && o.last ? o.last[o.key] : undefined;
    let j = Math.floor(rand() * n) % n;
    if (n > 1 && pool[j].i === prev) j = (j + 1 + Math.floor(rand() * (n - 1))) % n;
    if (o.key && o.last) o.last[o.key] = pool[j].i;
    v = pool[j].p;
    if (v && !Array.isArray(v) && typeof v === 'object' && Array.isArray(v.need)) v = v.say;
  }
  if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.lines)) v = v.lines; // 立ち絵の会話
  const list = Array.isArray(v) ? v : v ? [v] : [];
  /** @type {TalkLine[]} */ const out = [];
  for (const x of list) {
    if (typeof x === 'string') { out.push({ text: x }); continue; }
    if (!x || typeof x.text !== 'string') continue;
    /** @type {TalkLine} */ let line;
    if (x.member) { if (!party.has(x.member)) continue; line = { who: x.who || MEMBER_NAME[/** @type {keyof typeof MEMBER_NAME} */ (x.member)] || x.member, text: x.text, member: x.member }; }
    else line = x.who ? { who: x.who, text: x.text } : { text: x.text };
    if (x.actor) line.actor = x.actor;
    if (x.face) line.face = x.face;
    if (Array.isArray(x.act)) line.act = x.act; // 演出：この行を出すときに、人や敵を出して動かす（field.sceneAct）
    out.push(line);
  }
  return out;
}

/** 立ち絵の会話か（どれかの行に actor がある） */
export const isScene = (/** @type {TalkLine[]} */ lines) => lines.some((l) => !!l.actor);
