# 窓の外の景色（美術・演出室 ART-DAY-EXPANSION-FINAL-RETURN、pixel/元絵/内装_追加_v01 の window_<町・森・村>_<昼・夜>）を、ゲーム用に assets/interiors/district へ写す。元絵は変えない。1024×768 → 512×384 の WebP。
# 使い方：<python> -I tools/copy-window-views.py
import os
from PIL import Image
P = os.path.join(os.environ.get('USERPROFILE', 'C:/Users/takhy'), 'OneDrive', 'ドキュメント', 'ChatGPT', '物語', 'production', 'claude', 'pixel', '元絵', '内装_追加_v01')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'interiors', 'district')
n = 0
for place in ('town', 'forest', 'village'):
    for t in ('day', 'night'):
        name = f'window_{place}_{t}'
        im = Image.open(os.path.join(P, name + '.png')).convert('RGB').resize((512, 384), Image.LANCZOS)
        im.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=88, method=6); n += 1
print(n, 'files')
