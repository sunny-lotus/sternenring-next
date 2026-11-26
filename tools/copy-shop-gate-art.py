# 商店通りの店の正面8種（ART-SHOP-FRONTS-RETURN）と、二つの大門・ノルンの東門（ART-GATES-RETURN）の元絵を、ゲーム用に assets/town/norn へ写す。元絵は変えない。
# 透明でない所を切り出し、長い辺 512（店・家と同じ）、門は 768。使い方：<python> -I tools/copy-shop-gate-art.py
import os
from PIL import Image
P = os.path.join(os.environ.get('USERPROFILE', 'C:/Users/takhy'), 'OneDrive', 'ドキュメント', 'ChatGPT', '物語', 'production', 'claude', 'pixel', '元絵')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'town', 'norn')
jobs = [('ノルン_商店通り_v01', n, 512) for n in ['shop_travel', 'shop_transport', 'shop_bakery', 'shop_eatery', 'shop_general', 'shop_herbal', 'shop_repair', 'shop_cloth']] + [('ノルン_大門_v01', n, 768) for n in ['kardia_great_gate', 'gastel_great_gate', 'norn_east_gate']]
for d, n, side in jobs:
    im = Image.open(os.path.join(P, d, n + '.png')).convert('RGBA'); b = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox(); im = im.crop(b)
    s = min(1, side / max(im.size)); im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    p = os.path.join(OUT, n + '.webp'); im.save(p, 'WEBP', quality=88, method=6); print(n, b, im.size)
