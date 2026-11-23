# ホーム画面に置くときの絵（アプリのしるし）を作る（2026-11-23 作者「全画面をスマホ用に」）。
# 本の表紙と同じ、こげ茶の革に金の輪と四つの光の星。文字は入れない。
# 使い方: python -I tools/make-icon.py  → assets/icon/icon-192.png・icon-512.png・apple-touch-icon.png（180）
import math, os
from PIL import Image, ImageDraw, ImageFilter

out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'icon')
os.makedirs(out, exist_ok=True)

def make(n):
    S = n * 4  # 大きく描いて縮める（ふちをなめらかに）
    im = Image.new('RGB', (S, S), (74, 44, 28))
    d = ImageDraw.Draw(im)
    for i in range(0, S, 6):  # 革のうすい筋
        c = 70 + (i * 37 % 11)
        d.line([(0, i), (S, i + S * 0.05)], fill=(c, 42, 27), width=2)
    im = im.filter(ImageFilter.GaussianBlur(S * 0.004))
    d = ImageDraw.Draw(im)
    gold, cx, cy = (214, 172, 92), S / 2, S / 2
    r = S * 0.33
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=gold, width=int(S * 0.018))
    r2 = S * 0.29
    d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], outline=gold, width=int(S * 0.006))
    for k in range(12):  # 輪の小さな点
        a = k * math.pi / 6; px, py = cx + math.cos(a) * r * 1.08, cy + math.sin(a) * r * 1.08; q = S * 0.012
        d.ellipse([px - q, py - q, px + q, py + q], fill=gold)
    R, w = S * 0.2, S * 0.045  # 四つの光の星
    pts = []
    for k in range(8):
        a = -math.pi / 2 + k * math.pi / 4; rr = R if k % 2 == 0 else w
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    d.polygon(pts, fill=(236, 200, 120))
    return im.resize((n, n), Image.LANCZOS)

for n, name in [(192, 'icon-192.png'), (512, 'icon-512.png'), (180, 'apple-touch-icon.png')]:
    make(n).save(os.path.join(out, name), optimize=True)
    print(name)
