# 四地区の小物と目印（美術・演出室 ART-NORN-DISTRICTS-RETURN、pixel/元絵/ノルン_地区_v01、provisional）を assets/town/norn へ写す。元絵は変えない。
# 透明でない所を切り出し、長い辺 512。使い方：<python> -I tools/copy-district-props.py
import os
from PIL import Image
P = os.path.join(os.environ.get('USERPROFILE', 'C:/Users/takhy'), 'OneDrive', 'ドキュメント', 'ChatGPT', '物語', 'production', 'claude', 'pixel', '元絵', 'ノルン_地区_v01')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'town', 'norn')
for f in sorted(os.listdir(P)):
    if not (f.endswith('.png') and f[:3] in ('ne_', 'nw_', 'se_', 'sw_')): continue
    im = Image.open(os.path.join(P, f)).convert('RGBA'); b = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox(); im = im.crop(b)
    s = min(1, 512 / max(im.size)); im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    im.save(os.path.join(OUT, f[:-4] + '.webp'), 'WEBP', quality=88, method=4); print(f, im.size)
