// 町のにぎわい（仮）：町の人・会話・調べる出来事を、地図と data/dialogue.json に入れる道具。2026-11-24 作者「イベントや会話、適当に沢山作っといて」。
// 使い方: <node> tools/gen-town-life.cjs
// - 名前・役目・設定の無い町の人だけ。物語の人物・世界の秘密・地名の位置関係には触れない（本文にある言葉：ノルン・銀鹿亭・導機灯・星環祭・星獣 だけ使う）。
// - 文はすべて仮（status: provisional）。正式な台詞は世界観・シナリオ室の確定で差しかえる。
// - 何度流しても同じ結果になる（id が life- で始まる町の人・出来事と、life. で始まる文だけを作りなおす）。
// - 家の中（norn-house-*）は tools/gen-house-interiors.cjs で作りなおすと消えるので、そのあとにこれを流しなおす。
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), MAPS = path.join(ROOT, 'data', 'maps');
const read = (id) => JSON.parse(fs.readFileSync(path.join(MAPS, id + '.json'), 'utf8'));
const write = (id, m) => fs.writeFileSync(path.join(MAPS, id + '.json'), JSON.stringify(m, null, 2) + '\n');
const L = {}; // 文（dialogue.json の lines に入る）
const line = (key, v) => { L['life.' + key] = v; return 'life.' + key; };
/** 1回目と2回目で文が変わる会話（旗 life.<id>） */
const talk = (id, first, again, give) => {
  const f = 'life.' + id;
  return [{ when: { flags: { [f]: true } }, dialogue: line(id + '.again', again) }, { dialogue: line(id + '.first', first), set: { flags: { [f]: true } }, ...(give ? { give } : {}) }];
};
const once = (id, text) => [{ dialogue: line(id, text) }];
const W = (who, text) => ({ who, text });

// ---------------- 宿の通り（norn-inn-street） ----------------
const street = {
  npcs: [
    { id: 'life-st-merchant', sprite: 'mob01', tone: '#7a5a3a', x: 13, y: 13, dir: 'down', pages: talk('st-merchant',
      [W('商人', 'いらっしゃい。今朝、森の近くの村から届いたばかりの干し果物だよ。'), W('商人', '甘いのが好きなら、こっちの小さいほうがいい。歩きながら食べるのにちょうどいいんだ。')],
      [W('商人', '日が落ちる前に店じまいさ。導機灯がともると、通りの顔がすっかり変わるからね。')]) },
    { id: 'life-st-woman', sprite: 'mob02', tone: '#6a5a7a', x: 22, y: 13, dir: 'up', pages: talk('st-woman',
      [W('婦人', 'この花、今日はやけに色がいいの。'), W('婦人', '窓辺に飾ると、部屋が明るくなるのよ。一輪だけでもね。')],
      [W('婦人', 'かごがいっぱい。もう少し買ったら、持って帰れなくなるわ。')]) },
    { id: 'life-st-child', sprite: 'mob03', tone: '#5a7a4a', x: 20, y: 10, dir: 'up', pages: talk('st-child',
      [W('子ども', 'ねえ、知ってる？　この通りの石だたみ、ぜんぶ数えた人はいないんだって。'), W('子ども', 'ぼく、きのう三百まで数えて、わかんなくなった。')],
      [W('子ども', '三百一、三百二……あれ、どこまで数えたっけ。')]) },
    { id: 'life-st-waiter', sprite: 'mob04', tone: '#8a7a5a', x: 11, y: 5, dir: 'down', pages: talk('st-waiter',
      [W('給仕', '銀鹿亭へようこそ……って、まだ中じゃないか。'), W('給仕', '一階は食堂、上は泊まりの部屋。夜は込むから、席を取るなら早めにね。')],
      [W('給仕', '今夜のおすすめ？　煮込みだよ。いつもそう言ってるけど、本当にうまいんだ。')]) },
    { id: 'life-st-elder', sprite: 'mob05', tone: '#5a5a5a', x: 30, y: 14, dir: 'down', pages: talk('st-elder',
      [W('年寄り', 'この通りも、わしが若いころとはずいぶん変わった。'), W('年寄り', '変わらんのは、夕方になると決まってパンの匂いがすることくらいじゃな。')],
      [W('年寄り', '歩くのはゆっくりでいい。急いだって、日は同じように沈む。')]) },
    { id: 'life-st-traveler', sprite: 'mob07', tone: '#4a5a5a', x: 41, y: 7, dir: 'left', pages: talk('st-traveler',
      [W('旅の人', 'ようやく着いた。ノルンは、門をくぐった瞬間に空気が変わるね。'), W('旅の人', '人の声と、焼いた肉の匂い。旅のあいだ、これが恋しかったんだ。')],
      [W('旅の人', '宿はあの鹿の看板のところだろう？　まずは足を休めたい。')]) },
  ],
  events: [
    { id: 'life-st-crates', x: 6, y: 5, trigger: 'examine', pages: [{ when: { flags: { 'life.st-crates': true } }, dialogue: line('st-crates.again', '積まれた木箱。もう何も落ちていない。') }, { dialogue: line('st-crates.first', '積まれた木箱のかげに、銅貨が落ちていた。'), set: { flags: { 'life.st-crates': true } }, give: { gold: 3 } }] },
    { id: 'life-st-lamp1', x: 4, y: 10, trigger: 'examine', pages: once('st-lamp', '導機灯。夜になると、通りをやわらかく照らす。') },
    { id: 'life-st-lamp2', x: 17, y: 10, trigger: 'examine', pages: once('st-lamp2', '導機灯の柱に、子どもの背丈を刻んだ小さな傷がいくつもある。') },
    { id: 'life-st-cart', x: 40, y: 12, trigger: 'examine', pages: once('st-cart', '荷車。麻袋がいくつか積んである。持ち主は近くにいないようだ。') },
    { id: 'life-st-flowerbed', x: 11, y: 15, trigger: 'examine', pages: once('st-flowerbed', '花壇。だれかが毎朝、水をやっているらしい。土がしっとりしている。') },
    { id: 'life-st-crates2', x: 32, y: 15, trigger: 'examine', pages: once('st-crates2', '木箱には、どこかの店の印が焼きつけてある。') },
    { id: 'life-st-tree', x: 1, y: 9, trigger: 'examine', pages: once('st-tree', '通りの木。根もとで猫が丸くなっている。') },
  ],
};

// ---------------- 広場（norn-plaza） ----------------
const plaza = {
  npcs: [
    { id: 'life-pl-merchant', sprite: 'mob01', tone: '#7a5a3a', x: 3, y: 10, dir: 'up', pages: talk('pl-merchant',
      [W('商人', '広場の露店は、朝がいちばんいい品がそろうんだ。'), W('商人', '昼を過ぎたら、残り物を少し安くする。それを待ってる人も多いけどね。')],
      [W('商人', '値切り？　あんたの顔に免じて……いや、やめておこう。')]) },
    { id: 'life-pl-child1', sprite: 'mob03', tone: '#5a7a4a', x: 28, y: 12, dir: 'right', pages: talk('pl-child1',
      [W('子ども', 'いま、かくれんぼしてるの。'), W('子ども', 'しーっ。鬼の子に見つかっちゃう。')],
      [W('子ども', 'まだ見つかってないよ。だから話しかけないで！')]) },
    { id: 'life-pl-child2', sprite: 'mob03', tone: '#7a6a3a', x: 31, y: 12, dir: 'left', pages: talk('pl-child2',
      [W('子ども', 'ねえ、このへんで子どもを見なかった？'), W('子ども', 'ぼくが鬼なんだ。……え、すぐそこ？　ずるい、言っちゃだめだよ。')],
      [W('子ども', '十数えてから探すの。いち、に、さん……')]) },
    { id: 'life-pl-woman', sprite: 'mob02', tone: '#6a5a7a', x: 20, y: 19, dir: 'up', pages: talk('pl-woman',
      [W('婦人', '星環祭の支度が、そろそろ始まるころね。'), W('婦人', '飾りの布を縫わなくちゃ。毎年、気づくと間に合わないのよ。')],
      [W('婦人', '今年は早めに始めるの。……去年もそう言ったけれど。')]) },
    { id: 'life-pl-elder', sprite: 'mob05', tone: '#5a5a5a', x: 9, y: 25, dir: 'right', pages: talk('pl-elder',
      [W('年寄り', '星獣が出た、という話を聞いたことがあるかね。'), W('年寄り', 'めったにあることではない。だが、あったときは町じゅうが大騒ぎになる。'), W('年寄り', 'わしの知っている限り、それは祈るより、戸を閉めるほうが早い出来事じゃよ。')],
      [W('年寄り', '昔話は、聞いてくれる人がいるうちが華じゃな。')]) },
    { id: 'life-pl-craftsman', sprite: 'mob06', tone: '#6a4a3a', x: 35, y: 18, dir: 'down', pages: talk('pl-craftsman',
      [W('職人', '休憩中だ。腕がしびれて、もう金づちが持てん。'), W('職人', 'いい仕事は、いい休みからできる。親方の受け売りだがな。')],
      [W('職人', 'あと少し休んだら戻る。……あと少しだけな。')]) },
    { id: 'life-pl-girl', sprite: 'mob08', tone: '#8a5a6a', x: 45, y: 31, dir: 'down', pages: talk('pl-girl',
      [W('町娘', '花はいかが？　今朝、摘んだばかりなの。'), W('町娘', '買わなくてもいいの。いい香りでしょう？　それだけで、少し得した気分になるわ。')],
      [W('町娘', '明日はちがう花を持ってくるつもり。また来てね。')]) },
    { id: 'life-pl-traveler', sprite: 'mob07', tone: '#4a5a5a', x: 53, y: 8, dir: 'down', pages: talk('pl-traveler',
      [W('旅の人', 'この先の道は、日が高いうちに歩いたほうがいい。'), W('旅の人', '暗くなってからは、道しるべが見えにくくなる。迷うと厄介だよ。')],
      [W('旅の人', '気をつけて。旅は、帰ってくるまでが旅だ。')]) },
    { id: 'life-pl-waiter', sprite: 'mob04', tone: '#8a7a5a', x: 24, y: 7, dir: 'down', pages: talk('pl-waiter',
      [W('若い人', '使いの途中なんだ。パン屋に寄って、それから八百屋。'), W('若い人', '頼まれたものを全部覚えていられたためしがないんだよね。')],
      [W('若い人', 'パン、パン、それから……なんだっけ。')]) },
  ],
  events: [
    { id: 'life-pl-planter1', x: 4, y: 15, trigger: 'examine', pages: once('pl-planter1', '植えこみ。小さな白い花が咲いている。') },
    { id: 'life-pl-planter2', x: 19, y: 15, trigger: 'examine', pages: [{ when: { flags: { 'life.pl-planter2': true } }, dialogue: line('pl-planter2.again', '植えこみ。土の中には、もう何もない。') }, { dialogue: line('pl-planter2.first', '植えこみの土に、銅貨が埋もれていた。だれかの落とし物だろうか。'), set: { flags: { 'life.pl-planter2': true } }, give: { gold: 5 } }] },
    { id: 'life-pl-planter3', x: 15, y: 24, trigger: 'examine', pages: once('pl-planter3', '植えこみのふちに、子どもが並べた小石がある。') },
    { id: 'life-pl-planter4', x: 42, y: 36, trigger: 'examine', pages: once('pl-planter4', '植えこみ。花の上を、小さな虫が行ったり来たりしている。') },
    { id: 'life-pl-planter5', x: 17, y: 36, trigger: 'examine', pages: once('pl-planter5', '植えこみ。手入れが行きとどいている。') },
  ],
};

// ---------------- 銀鹿亭一階（silver-deer-1f） ----------------
// 仮の客（いまは主人公たちの絵を借りている。モブの絵が届いたら替える）の席のマスに、話す出来事を置く
const inn = {
  events: [
    { id: 'life-inn-guest1', x: 2, y: 11, trigger: 'examine', pages: talk('inn-guest1', [W('客', 'この店の煮込みは、ほかでは食べられない味だ。'), W('客', '何が入っているのか聞いても、店の人は笑うだけなんだよ。')], [W('客', 'おかわりを頼もうか、迷っているところだ。')]) },
    { id: 'life-inn-guest2', x: 6, y: 7, trigger: 'examine', pages: talk('inn-guest2', [W('客', 'ここの暖炉の前は、冬になると取り合いになるのよ。'), W('客', '今のうちに、いい席の座り方を覚えておくといいわ。')], [W('客', 'ふう、あったかい。もう少しここにいようかしら。')]) },
    { id: 'life-inn-guest3', x: 17, y: 7, trigger: 'examine', pages: talk('inn-guest3', [W('客', '一人で飲むのも、悪くないもんだ。'), W('客', 'まわりの話し声を聞いているだけで、退屈しないからな。')], [W('客', '……ん？　ああ、気にしないでくれ。独り言だ。')]) },
    { id: 'life-inn-guest4', x: 13, y: 11, trigger: 'examine', pages: talk('inn-guest4', [W('客', '旅の途中かい？'), W('客', 'ここは宿もあるし、腹もふくれる。疲れたら、遠慮なく休んでいくといい。')], [W('客', '明日はどっちへ行くんだい？　……いや、言わなくていい。旅の楽しみだからな。')]) },
    { id: 'life-inn-guest5', x: 4, y: 4, trigger: 'examine', pages: talk('inn-guest5', [W('客', '注文した料理が、まだ来ないんだ。'), W('客', 'いや、怒っちゃいない。待つあいだの匂いも、料理のうちさ。')], [W('客', 'お、来た来た。')]) },
    { id: 'life-inn-guest6', x: 7, y: 4, trigger: 'examine', pages: talk('inn-guest6', [W('客', '上の部屋は、窓から通りが見えるんだ。'), W('客', '夜、導機灯がともっていくところを眺めるのが好きでね。')], [W('客', '今夜も見るつもりさ。')]) },
  ],
  lines: {
    'inn.hearth.first': '暖炉。薪がぱちぱちと音を立てている。手をかざすと、指先まであたたまった。',
    'inn.hearth.again': '暖炉の火が、ゆらゆらと揺れている。',
    'inn.counter': [W('店の人', 'いらっしゃい。食事なら、空いている席へどうぞ。'), W('店の人', '泊まりの部屋は二階だよ。')],
  },
};

// ---------------- 家の中（norn-house-*）：家具を調べる・住んでいる人 ----------------
const BED = ['寝台。きれいに整えてある。勝手に寝るのはやめておこう。', '寝台。毛布が少しくしゃっとしている。さっきまでだれかが休んでいたようだ。', '寝台。枕もとに、読みかけの本が伏せてある。', '寝台。干したばかりの毛布の匂いがする。'];
const TABLE = ['食卓。木の器が並んでいる。そろそろ食事どきだろうか。', '食卓。パンくずが少し落ちている。', '食卓。小さな花が一輪、器に挿してある。', '食卓。使いこんだ木の天板に、細かい傷がたくさんある。'];
const BARREL = ['樽。中は水のようだ。', '樽。ふたの上に、ひしゃくが置いてある。', '樽。中身は空っぽだ。', '樽。漬け物の匂いがする。'];
const HEARTH = ['暖炉。灰がまだ少しあたたかい。', '暖炉。鍋がかけてある。いい匂いがする。', '暖炉。薪がきちんと積んである。'];
const RESIDENTS = [
  { sprite: 'mob02', tone: '#6a5a7a', who: '住人', first: [W('住人', 'あら、お客さん？'), W('住人', '散らかっていて、ごめんなさいね。お茶でもと言いたいところだけれど、今ちょうど切らしているの。')], again: [W('住人', 'また来てくれたの？　次はお茶を用意しておくわ。')] },
  { sprite: 'mob06', tone: '#6a4a3a', who: '住人', first: [W('住人', '仕事から帰ったところだ。'), W('住人', '家に帰ると、やっと肩の力が抜けるよ。')], again: [W('住人', '今日はもう、何もしないと決めた。')] },
  { sprite: 'mob05', tone: '#5a5a5a', who: '住人', first: [W('住人', 'おや、若い人が訪ねてくるとはめずらしい。'), W('住人', 'この家には、もう何十年も住んでおる。床のきしむ場所まで、ぜんぶ覚えておるよ。')], again: [W('住人', 'そこの床板は鳴るから、気をつけて歩きなされ。')] },
  { sprite: 'mob03', tone: '#5a7a4a', who: '子ども', first: [W('子ども', 'お母さんなら、いま買い物に行ってるよ。'), W('子ども', 'ぼく、るすばん。ちゃんとできてるでしょ？')], again: [W('子ども', '知らない人を入れちゃいけないって言われてたんだった……。')] },
  { sprite: 'mob08', tone: '#8a5a6a', who: '住人', first: [W('住人', '窓辺の花、きれいでしょう？'), W('住人', '毎朝、水をやるのが楽しみなの。')], again: [W('住人', '花も、話しかけると元気になる気がするのよ。')] },
  { sprite: 'mob01', tone: '#7a5a3a', who: '住人', first: [W('住人', '今日の売り上げを数えているところでね。'), W('住人', '……うん、昨日より少しいい。悪くない一日だった。')], again: [W('住人', '数え直しても、やっぱり少しいい。')] },
  { sprite: 'mob07', tone: '#4a5a5a', who: '住人', first: [W('住人', '明日から少し旅に出るんだ。荷造りの最中さ。'), W('住人', '持っていくものを減らすほうが、ずっと難しい。')], again: [W('住人', 'やっぱり、この上着は置いていこう。')] },
  { sprite: 'mob04', tone: '#8a7a5a', who: '住人', first: [W('住人', '宿の手伝いから帰ってきたところ。'), W('住人', '一日じゅう皿を運ぶと、家の静けさがありがたく感じるんだ。')], again: [W('住人', '少し眠ろうかな。')] },
];
const houses = {};
{
  const world = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'world.json'), 'utf8'));
  const ids = world.maps.filter((id) => id.startsWith('norn-house-'));
  ids.forEach((id, i) => {
    const m = read(id), events = [], npcs = [], rows = m.collision.map((r) => [...r]), H = m.height, Wd = m.width, door = m.exits[0];
    const free = (x, y) => rows[y]?.[x] === '.' && !(x === door.x && y >= H - 2);
    const front = (it) => { // 家具の手前（下）のマスに立って調べられる、家具のいちばん下の行のマス
      for (let k = 0; k < it.w; k++) { const x = it.x + Math.floor(it.w / 2) + (k % 2 ? -1 : 1) * Math.ceil(k / 2), y = it.y + it.h - 1; if (x >= it.x && x < it.x + it.w && free(x, y + 1)) return { x, y }; }
      return null;
    };
    const items = m.stage.layers.flatMap((l) => l.items);
    const add = (kind, list, it) => { const c = front(it); if (!c) return; const key = `house${String(i + 1).padStart(2, '0')}-${kind}`; events.push({ id: 'life-' + key, x: c.x, y: c.y, trigger: 'examine', pages: once(key, list[(i + kind.length) % list.length]) }); };
    for (const it of items) {
      if (it.asset === 'placeholder:bed') add('bed', BED, it);
      else if (it.region === 'table') add('table', TABLE, it);
      else if (it.asset === 'placeholder:barrels') add('barrel', BARREL, it);
      else if (it.region === 'hearth') add('hearth', HEARTH, it);
    }
    // 3軒に1軒ほど、住んでいる人がいる（家具の調べる場所と、入口からまっすぐの道はふさがない）
    if (i % 3 === 0) {
      const r = RESIDENTS[(i / 3) % RESIDENTS.length], taken = new Set(events.flatMap((e) => [`${e.x},${e.y + 1}`]));
      const cand = [[1, H - 3], [Wd - 2, H - 3], [1, 3], [Wd - 2, 3]].find(([x, y]) => free(x, y) && !taken.has(`${x},${y}`) && Math.abs(x - door.x) > 1);
      if (cand) npcs.push({ id: `life-house${String(i + 1).padStart(2, '0')}-resident`, sprite: r.sprite, tone: r.tone, x: cand[0], y: cand[1], dir: cand[0] < Wd / 2 ? 'right' : 'left', pages: talk(`house${String(i + 1).padStart(2, '0')}-resident`, r.first, r.again) });
    }
    // 食卓に座っている人（2026-11-25 サニー「民家でも座らせて」）：住人のいない家の半分ほど（3軒に1軒）に、食卓の横の椅子に座る人を置く。
    // 銀鹿亭の座る客と同じ stage.npcs（座り姿のドット絵・椅子つき。話しかけない・ぶつからない）。食卓の右か左の空いている側に、食卓のほうを向いて座る
    const seats = [];
    if (i % 3 === 1) {
      const tb = items.find((it) => it.region === 'table');
      // 民家の食卓の絵（table_home）は、食卓の左右に椅子が描いてある：座る人はその椅子の所（食卓のまんなかから 1.13 マス）に、自分の椅子なしで座る（noChair）
      const side = tb && [[tb.x + tb.w, 'left', tb.x + tb.w / 2 + 1.13], [tb.x - 1, 'right', tb.x + tb.w / 2 - 1.13]].find(([cx]) => free(cx, tb.y) && free(cx, tb.y + 1) && !npcs.some((p) => Math.abs(p.x - cx) <= 1 && p.y >= tb.y - 1 && p.y <= tb.y + 2));
      if (side) seats.push({ x: side[2], z: tb.y + tb.h / 2, pose: 'sit', noChair: true, facing: side[1], sprite: ['mob01', 'mob02', 'mob03', 'mob04'][((i - 1) / 3) % 4], life: true, note: '2026-11-25 サニー「民家でも座らせて」：食卓に座る住人（仮・status provisional）' });
    }
    houses[id] = { events, npcs, seats };
  });
}

// ---------------- 絵：歩きのドット絵がまだ無い町の人（⑤〜⑧）は、届くまで①〜④の絵を借りる（wantSprite に本来の番号を残す） ----------------
const CAST = new Set((JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8')).cast || []).map((c) => c.id));
const STAND_IN = { mob05: 'mob01', mob06: 'mob04', mob07: 'mob01', mob08: 'mob02' };
const pickSprite = (n) => { if (CAST.has(n.sprite) || !STAND_IN[n.sprite] || !CAST.has(STAND_IN[n.sprite])) return n; return { ...n, sprite: STAND_IN[n.sprite], wantSprite: n.sprite }; };
for (const g of [street, plaza, ...Object.values(houses)]) g.npcs = (g.npcs || []).map(pickSprite);

// ---------------- 書きこむ ----------------
const apply = (id, add) => {
  const m = read(id);
  m.events = (m.events || []).filter((e) => !String(e.id).startsWith('life-')).concat(add.events || []);
  const keepNpcs = (m.npcs || []).filter((n) => !String(n.id).startsWith('life-')), npcs = keepNpcs.concat(add.npcs || []);
  if (npcs.length) m.npcs = npcs; else delete m.npcs;
  if (add.seats) { m.stage.npcs = (m.stage.npcs || []).filter((p) => !p.life).concat(add.seats); if (!m.stage.npcs.length) delete m.stage.npcs; }
  write(id, m);
  return (add.events || []).length + (add.npcs || []).length;
};
let n = 0;
n += apply('norn-inn-street', street);
n += apply('norn-plaza', plaza);
n += apply('silver-deer-1f', inn);
{ // 銀鹿亭の仮の客：主人公たちの絵を借りていたのを、町の人の絵に替える（2026-11-24 モブのドット絵ができた）
  const m = read('silver-deer-1f'), swap = { serena: 'mob02', licht: 'mob04', flare: 'mob03', nacht: 'mob01', volt: 'mob01' };
  let k = 0; for (const c of m.stage.npcs || []) { const from = c.borrowed || c.sprite; if (swap[from] && CAST.has(swap[from])) { c.borrowed = from; c.sprite = c.pose === 'stand' && k++ === 1 ? 'mob04' : swap[from]; } }
  write('silver-deer-1f', m);
}
for (const [id, add] of Object.entries(houses)) n += apply(id, add);
const dp = path.join(ROOT, 'data', 'dialogue.json'), dlg = JSON.parse(fs.readFileSync(dp, 'utf8'));
for (const k of Object.keys(dlg.lines)) if (k.startsWith('life.')) delete dlg.lines[k];
Object.assign(dlg.lines, inn.lines, L);
dlg.lifeNote = '2026-11-24 作者「イベントや会話、適当に沢山作っといて」：life. で始まる文と inn.hearth・inn.counter は tools/gen-town-life.cjs が入れた仮の文（status: provisional）。名前・役目・設定の無い町の人だけ。正式な台詞は世界観・シナリオ室の確定で差しかえる';
fs.writeFileSync(dp, JSON.stringify(dlg, null, 2) + '\n');
console.log('町の人・出来事', n, '文', Object.keys(L).length + Object.keys(inn.lines).length);
