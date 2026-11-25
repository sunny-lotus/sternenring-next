# 座り姿も「元の絵」で（2026-11-25 サニー「座りも元の絵ね」）。?chara=art のときだけ使う。
# 元絵：美術・演出室の座り姿（<id>_sit4_source.png、横1段×4列＝正面・背中・左向き・右向き）。元絵は変えない。
# ドット絵の座り姿（chibi-sit.png、sit4.ps1）で体がコマのどこにあるか（不透明な所の範囲。まわり1ドットの縁どりを除く）に合わせ、
# 元絵の体を S 倍の大きさで同じ所に置く。だから座面の高さ（台帳の seat）・足の裏（anchor）はドット絵と同じ（S 倍）で合う。
# 出力：assets/characters/<id>/art-sit.png（行＝down,left,right,up・1コマ）
# 使い方：<python> -I tools/make-art-sit.py
import os, json
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(os.environ.get('USERPROFILE', 'C:/Users/takhy'), 'OneDrive/ドキュメント/ChatGPT/物語/production/claude/pixel/元絵')
S = 5
COL = {'down': 0, 'up': 1, 'left': 2, 'right': 3}  # 元絵の列（正面・背中・左向き・右向き）

def ok(px, red_hair):
    r, g, b, a = px
    if a < 160: return False
    if (r > 180 and g < 55 and b < 60) if red_hair else (r > 150 and g < 100 and b < 110 and r - g > 80): return False
    if r > 190 and g > 180 and b < 70: return False
    if r > 150 and b > 140 and g < 110 and r - g > 70 and b - g > 60: return False
    return True

L = json.load(open(os.path.join(ROOT, 'data', 'assets.json'), encoding='utf-8'))
for p in L['party'] + L.get('cast', []):
    se = next((a for a in L['assets'] if a['id'] == p.get('sit')), None)
    if not se: continue
    cid = p['id']; fn = os.path.join(SRC, ('モブ_v01/' if cid.startswith('mob') else '') + f'{cid}_sit4_source.png')
    if not os.path.exists(fn): print('元絵なし', cid); continue
    src = Image.open(fn).convert('RGBA'); CW = src.width // 4; red = cid == 'flare'
    mask = Image.new('L', src.size, 0); mp = mask.load(); px = src.load()
    for y in range(src.height):
        for x in range(src.width):
            if ok(px[x, y], red): mp[x, y] = 255
    clean = Image.new('RGBA', src.size, (0, 0, 0, 0)); clean.paste(src, (0, 0), mask)
    dot = Image.open(os.path.join(ROOT, se['path'])).convert('RGBA'); FW, FH = se['frame']
    out = Image.new('RGBA', (FW * S, FH * S * 4), (0, 0, 0, 0))
    for r, d in enumerate(se['directions']):
        fb = dot.crop((0, r * FH, FW, (r + 1) * FH)).getchannel('A').getbbox()  # ドット絵の体の範囲（縁どりを含む）
        x0, y0, x1, y1 = fb[0] + 1, fb[1] + 1, fb[2] - 1, fb[3] - 1  # 縁どり1ドットを除く
        c = COL[d]; cb = mask.crop((c * CW, 0, (c + 1) * CW, src.height)).getbbox()
        body = clean.crop((c * CW + cb[0], cb[1], c * CW + cb[2], cb[3]))
        w, h = (x1 - x0) * S, (y1 - y0) * S
        body = body.resize((w, h), Image.LANCZOS)
        out.alpha_composite(body, (x0 * S, r * FH * S + y0 * S))
    dst = os.path.join(ROOT, 'assets', 'characters', cid, 'art-sit.png'); out.save(dst, optimize=True)
    print(cid, out.size, os.path.getsize(dst))
