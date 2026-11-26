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
  // cut：入れる扉を切り抜くときの扉の形（2026-11-23 作者「ドアを切り取って開くようにできるかい？」）。x0〜x1＝左右のはし（絵の幅に対する割合）、
  //   y0＝てっぺん・y1＝下のはし（絵の高さに対する割合、上から）、arch＝上のアーチの高さ（同じく絵の高さに対する割合）、hinge＝ちょうつがいの側（鉄の帯が出ている側）
  'house_e_archway.webp': { size: [512, 463], h: 0.281, x: 0.49, cut: { x0: 0.432, x1: 0.553, y0: 0.659, y1: 0.942, arch: 0.054, hinge: 'right' } },
  'house_f_corner.webp': { size: [464, 512], h: 0.283, x: 0.33 },
  'house_home_2f.webp': { size: [512, 511], h: 0.274, x: 0.28 },
  'house_merchant_3f.webp': { size: [383, 512], h: 0.234, x: 0.42 },
  // 商店通りの店の正面8種（2026-11-26 美術・演出室 ART-SHOP-FRONTS-RETURN）。扉の値は Claude が格子を重ねた画面で測った（扉の矩形の数値は資料に無い）。1階の閉じた木戸が入口
  'shop_travel.webp': { size: [440, 512], h: 0.37, x: 0.24 }, 'shop_transport.webp': { size: [450, 512], h: 0.38, x: 0.77 },
  'shop_bakery.webp': { size: [436, 512], h: 0.39, x: 0.735 }, 'shop_eatery.webp': { size: [437, 512], h: 0.35, x: 0.255 },
  'shop_general.webp': { size: [435, 512], h: 0.38, x: 0.31 }, 'shop_herbal.webp': { size: [430, 512], h: 0.35, x: 0.735 },
  'shop_repair.webp': { size: [462, 512], h: 0.32, x: 0.745 }, 'shop_cloth.webp': { size: [440, 512], h: 0.36, x: 0.235 },
  // 銀鹿亭の正面（美術・演出室 2026-11-23 inn_silver_deer.png。外側の透明を切って長い辺を512に）。両開きの扉は絵の中で少し開いていて奥の食堂が見えるので、切り抜かない
  // hole：入口（扉の付け根から付け根まで）をくりぬく。開いた扉の板（x0〜mx0・mx1〜x1）は入口の左右に立て、そのあいだの食堂の絵（mx0〜mx1）を奥へ下げて置く
  //   （2026-11-23 作者「入るところはくりぬいて、家をくぐったら、中」「もっと奥を深くして、右と左の側面は、扉の付け根まで広げてみて、縦も長く」「扉の部分の上がくりぬかれてないね」）
  //   leafTop：開いた扉の板の上のはし（ちょうつがい側 outer・内側 inner の高さと、左右の扉の横の位置）。これより上（アーチの内側の木）はくりぬく（作者「ここをくりぬいてほしい」）
  //   windows：1階の窓のガラスもくりぬいて、奥の写しが見えるように（木の格子は残す。作者「この窓の部分もくりぬいて」）
  'inn_silver_deer.webp': { size: [511, 512], h: 0.229, x: 0.499, cut: { x0: 0.351, x1: 0.649, y0: 0.659, y1: 0.943, arch: 0.085, hole: true, mx0: 0.419, mx1: 0.581, leafTop: { outer: 0.709, inner: 0.738, lo: 0.366, li: 0.419, ri: 0.586, ro: 0.651 }, windows: [{ x0: 0.117, x1: 0.279, y0: 0.709, y1: 0.855, arch: 0.037 }, { x0: 0.724, x1: 0.886, y0: 0.709, y1: 0.855, arch: 0.037 }] } },
};
/** 絵をドアの高さにそろえたときの、板の幅と高さ（マス） */
const boardSize = (file) => { const a = ART[file], h = DOOR_H / a.h; return { w: h * a.size[0] / a.size[1], h }; };
/** 地図の townArt に入れる doors（割合だけ） */
const doorsForMap = () => Object.fromEntries(Object.entries(ART).map(([f, a]) => [f, { h: a.h, x: a.x, ...(a.cut ? { cut: a.cut } : {}) }]));
module.exports = { DOOR_H, ART, boardSize, doorsForMap };
