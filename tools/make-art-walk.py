# キャラを「元の絵」（水彩の歩きの元絵）で歩かせる試し（2026-11-25 サニー「今キャラがドット絵だけど、元の絵だったらどうなるか試したい」）。
# ドット絵（walk12.ps1）と同じ並び・同じコマの形（頭の中心をコマの真ん中、足の裏を anchor に）で、S 倍の大きさの絵を作る。色はしぼらない・縁どりもしない。
# 出力：assets/characters/<id>/art-walk.png（行＝down,left,right,up／列＝右足・立つ・左足・立つ）、art-idle.png（立つ1コマ）。
# 画面では ?chara=art のときだけ使う（src/data.js）。元絵は変えない。
# 使い方：<python> -I tools/make-art-walk.py
import os, json
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(os.environ.get('USERPROFILE', 'C:/Users/takhy'), 'OneDrive/ドキュメント/ChatGPT/物語/production/claude/pixel/元絵')
FILES = {
    'nacht': 'nacht_walk12_source_v01.png', 'volt': 'volt_walk12_source_v01.png', 'flare': 'flare_walk12_source_v02.png',
    'serena': 'serena_walk12_source_v03.png', 'licht': 'licht_walk12_source_v02.png',
    'mob01': 'モブ_v01/mob01_walk12_source.png', 'mob02': 'モブ_v01/mob02_walk12_source.png', 'mob03': 'モブ_v01/mob03_walk12_source.png', 'mob04': 'モブ_v01/mob04_walk12_source.png',
}
S = 5
ledger = json.load(open(os.path.join(ROOT, 'data', 'assets.json'), encoding='utf-8'))
ROW = {'down': 0, 'left': 2, 'right': 3, 'up': 1}

def ok(px, red_hair):
    r, g, b, a = px
    if a < 140: return False
    if (r > 180 and g < 55 and b < 60) if red_hair else (r > 150 and g < 100 and b < 110 and r - g > 80): return False  # 赤いにじみ
    if r > 190 and g > 180 and b < 70: return False  # 黄色いにじみ
    if r > 150 and b > 140 and g < 110 and r - g > 70 and b - g > 60: return False  # 赤紫のにじみ
    return True

for cid, fn in FILES.items():
    party = next(p for p in ledger['party'] + ledger.get('cast', []) if p['id'] == cid)
    we = next(a for a in ledger['assets'] if a['id'] == party['walk'])
    FW, FH = we['frame']; AY = we['anchor'][1]; H = FH - 2
    src = Image.open(os.path.join(SRC, fn)).convert('RGBA'); CW, CH = src.width // 3, src.height // 4
    px = src.load(); red = cid == 'flare'
    mask = Image.new('L', src.size, 0); mp = mask.load()
    for y in range(src.height):
        for x in range(src.width):
            if ok(px[x, y], red): mp[x, y] = 255
    clean = Image.new('RGBA', src.size, (0, 0, 0, 0)); clean.paste(src, (0, 0), mask)
    boxes, heads = [], []
    for c in range(12):
        ox, oy = (c % 3) * CW, (c // 3) * CH
        bb = mask.crop((ox, oy, ox + CW, oy + CH)).getbbox()
        x0, y0, x1, y1 = bb[0] + ox, bb[1] + oy, bb[2] + ox, bb[3] + oy
        top = y0 + int((y1 - y0) * 0.35)
        head = mask.crop((x0, y0, x1, top)); hb = head.getbbox()
        # 頭の中心：上35%の不透明な所の平均
        hp = head.load(); sx = n = 0
        for yy in range(head.height):
            for xx in range(head.width):
                if hp[xx, yy]: sx += xx; n += 1
        heads.append(x0 + (sx / n if n else (x1 - x0) / 2)); boxes.append((x0, y0, x1, y1))
    k = H / max(b[3] - b[1] for b in boxes) * S
    frames = []
    for c in range(12):
        x0, y0, x1, y1 = boxes[c]
        piece = clean.crop((x0, y0, x1, y1)); w, h = max(1, round(piece.width * k)), max(1, round(piece.height * k))
        piece = piece.resize((w, h), Image.LANCZOS)
        fr = Image.new('RGBA', (FW * S, FH * S), (0, 0, 0, 0))
        left = round(FW * S / 2 - (heads[c] - x0) * k); topy = AY * S - h  # 足の裏を anchor に
        fr.alpha_composite(piece, (left, topy)) if 0 <= left and left + w <= FW * S and topy >= 0 else fr.paste(piece, (left, topy), piece)
        frames.append(fr)
    walk = Image.new('RGBA', (FW * S * 4, FH * S * 4), (0, 0, 0, 0)); idle = Image.new('RGBA', (FW * S, FH * S * 4), (0, 0, 0, 0))
    for r, d in enumerate(['down', 'left', 'right', 'up']):
        row = ROW[d] * 3
        for col, c in enumerate([row + 1, row, row + 2, row]): walk.paste(frames[c], (col * FW * S, r * FH * S))
        idle.paste(frames[row], (0, r * FH * S))
    out = os.path.join(ROOT, 'assets', 'characters', cid)
    walk.save(os.path.join(out, 'art-walk.png'), optimize=True); idle.save(os.path.join(out, 'art-idle.png'), optimize=True)
    print(cid, walk.size, os.path.getsize(os.path.join(out, 'art-walk.png')))
