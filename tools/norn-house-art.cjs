// ノルンの家の絵の、ドアの大きさ（町の地図を作る道具で使う。2026-11-23 作者「家のドアとキャラの大きさを同じくらいにしてほしい」）。
// h＝ドアの高さ（扉の板だけ。段は入れない）を絵の高さに対する割合で、x＝ドアの真ん中を絵の幅に対する割合で。assets/town/norn の絵を見て測った値。
// 描くとき（src/render/three-stage.js）は、地図の stage.townArt.doors と doorH から、ドアが doorH マスになる大きさで家の絵を立てる。
// 工房（house_d_workshop）の大きな両開きの戸は、キャラの高さにすると家が小さくなりすぎるので、少し高め（キャラの約1.2倍）になるようにしている。
const DOOR_H = 2.5; // ドアの高さ（マス）。キャラ（デフォルメの歩きの絵）は約2.4マス
const ART = {
  'house_a_narrow.webp': { size: [271, 512], h: 0.240, x: 0.39 },
  'house_b_sideroof.webp': { size: [512, 452], h: 0.283, x: 0.35 },
  'house_c_stepgable.webp': { size: [358, 512], h: 0.254, x: 0.50 },
  'house_d_workshop.webp': { size: [512, 487], h: 0.308, x: 0.48 },
  'house_e_archway.webp': { size: [512, 463], h: 0.281, x: 0.49 },
  'house_f_corner.webp': { size: [464, 512], h: 0.283, x: 0.33 },
  'house_home_2f.webp': { size: [512, 511], h: 0.274, x: 0.28 },
  'house_merchant_3f.webp': { size: [383, 512], h: 0.234, x: 0.42 },
};
/** 絵をドアの高さにそろえたときの、板の幅と高さ（マス） */
const boardSize = (file) => { const a = ART[file], h = DOOR_H / a.h; return { w: h * a.size[0] / a.size[1], h }; };
/** 地図の townArt に入れる doors（割合だけ） */
const doorsForMap = () => Object.fromEntries(Object.entries(ART).map(([f, a]) => [f, { h: a.h, x: a.x }]));
module.exports = { DOOR_H, ART, boardSize, doorsForMap };
