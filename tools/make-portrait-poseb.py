# 会話の立ち絵の2つ目のポーズ（poseB：気持ちが大きく動いたとき）を入れる（2026-11-25）。
# 元絵：美術・演出室 pixel/元絵/立ち絵_v01 の <id>_poseB_base / serious / surprise（白い背景。ART-DIALOGUE-20261125 制作記録 v02）。元絵は変えない。
# 1) 白い背景を、まわりからつながった白だけ透明にする（体の中の白いハイライトは残す）。ふちは白さに応じてなめらかに
# 2) 体＝透明にした base を 0.75 倍 → assets/portraits/<id>/b_body.png
# 3) 顔＝表情と base の差のある所だけを、透明にした base に入れてから同じ縮尺にし、差の範囲＋6px を切り出す → b_face_<表情>.png
# 4) 台帳 data/assets.json の portrait.<id> に poseB: { body, size, faces: { 表情: { file, rect, sha256 } } } を書く
# 使い方：<python> -I tools/make-portrait-poseb.py
import os, json, hashlib
from PIL import Image, ImageChops, ImageDraw, ImageFilter
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(os.environ.get('USERPROFILE', 'C:/Users/takhy'), 'OneDrive/ドキュメント/ChatGPT/物語/production/claude/pixel/元絵/立ち絵_v01')
SCALE, PAD = 0.75, 6
sha = lambda p: hashlib.sha256(open(os.path.join(ROOT, p), 'rb').read()).hexdigest()

def transparent(im):
    rgb = im.convert('RGB'); W, H = rgb.size
    white = Image.eval(rgb.convert('L'), lambda v: 255 if v >= 236 else 0)
    # まわりからつながった白（背景）だけを選ぶ
    bg = white.copy(); fill = 128
    for p in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1), (W // 2, 0), (W // 2, H - 1), (0, H // 2), (W - 1, H // 2)]:
        if bg.getpixel(p) == 255: ImageDraw.floodfill(bg, p, fill)
    # 腕と体のあいだのような、閉じた白いすき間（広いもの）も背景にする。小さい白（ハイライト）は残す
    v = 2
    for yy in range(0, H, 6):
        for xx in range(0, W, 6):
            if bg.getpixel((xx, yy)) == 255 and v < 120:
                ImageDraw.floodfill(bg, (xx, yy), v)
                if bg.histogram()[v] > 1500: bg = bg.point(lambda q, v=v: fill if q == v else q)
                v += 1
    bgmask = bg.point(lambda v: 255 if v == fill else 0)
    # ふち：背景のすぐ外側1〜2px は、白さに応じて半透明に
    near = bgmask.filter(ImageFilter.MaxFilter(5))
    mn = Image.eval(rgb.split()[0], lambda v: v)
    r, g, b = rgb.split(); low = ImageChops.darker(ImageChops.darker(r, g), b)
    soft = low.point(lambda v: max(0, min(255, int((255 - v) * 255 / 40))))  # 白に近いほど透明
    alpha = Image.new('L', (W, H), 255)
    alpha.paste(soft, (0, 0), near)
    alpha.paste(0, (0, 0), bgmask)
    out = rgb.convert('RGBA'); out.putalpha(alpha); return out

L = json.load(open(os.path.join(ROOT, 'data', 'assets.json'), encoding='utf-8'))
for cid in ['nacht', 'volt']:
    base = Image.open(os.path.join(SRC, f'{cid}_poseB_base.png')).convert('RGBA'); tb = transparent(base)
    W, H = tb.size; sw, sh = round(W * SCALE), round(H * SCALE)
    d = f'assets/portraits/{cid}'
    tb.resize((sw, sh), Image.LANCZOS).save(os.path.join(ROOT, d, 'b_body.png'), optimize=True)
    faces = {}
    for e in ['serious', 'surprise']:
        ex = Image.open(os.path.join(SRC, f'{cid}_poseB_{e}.png')).convert('RGBA')
        diff = ImageChops.difference(base.convert('RGB'), ex.convert('RGB')).convert('L').point(lambda v: 255 if v > 0 else 0)
        bb = diff.getbbox()
        mixed = tb.copy(); exr = ex.copy(); exr.putalpha(tb.getchannel('A'))
        mixed.paste(exr, (0, 0), diff)  # 差のある画素だけ表情の色に（アルファは透明にした base のまま）
        ms = mixed.resize((sw, sh), Image.LANCZOS)
        x0 = max(0, int(bb[0] * SCALE) - PAD); y0 = max(0, int(bb[1] * SCALE) - PAD); x1 = min(sw, int(bb[2] * SCALE) + PAD); y1 = min(sh, int(bb[3] * SCALE) + PAD)
        f = f'{d}/b_face_{e}.png'; ms.crop((x0, y0, x1, y1)).save(os.path.join(ROOT, f), optimize=True)
        faces[e] = {'file': f, 'rect': [x0, y0, x1 - x0, y1 - y0], 'sha256': sha(f)}
        print(cid, e, faces[e]['rect'])
    entry = next(a for a in L['assets'] if a['id'] == f'portrait.{cid}')
    entry['poseB'] = {'body': f'{d}/b_body.png', 'size': [sw, sh], 'faces': faces, 'sha256': sha(f'{d}/b_body.png'),
                      'sourceArt': f'pixel/元絵/立ち絵_v01/{cid}_poseB_*.png（美術・演出室 ART-DIALOGUE-20261125 制作記録 v02。白い背景を透明にした）',
                      'note': '2つ目のポーズ（気持ちが大きく動いたとき）。会話で face が serious・surprise のとき、この体と顔を使う。normal は体のまま'}
with open(os.path.join(ROOT, 'data', 'assets.json'), 'w', encoding='utf-8', newline='\n') as fo:  # 改行は LF のまま
    fo.write(json.dumps(L, ensure_ascii=False, indent=2) + '\n')
print('台帳に poseB を書いた')
