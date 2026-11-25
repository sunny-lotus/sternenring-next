# ノルンの骨格の元絵（美術・演出室 ART-NIGHT-NORN-20261126、pixel/元絵/ノルン_骨格_v01、provisional）を、ゲーム用に写す。元絵は変えない。
# 町の物 → assets/town/norn/、森の物 → assets/forest/、背景 → assets/backdrops/（jpg）。透明でない所を切り出す（壁は横につなげるので左右は切らない）。
# 使い方：<python> -I tools/copy-norn-structure-art.py
import os
from PIL import Image
SRC = os.path.join(os.environ.get('USERPROFILE', 'C:/Users/takhy'), 'OneDrive', 'ドキュメント', 'ChatGPT', '物語', 'production', 'claude', 'pixel', '元絵', 'ノルン_骨格_v01')
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
JOBS = [('town_wall', 'town/norn', 1024, True), ('third_wall', 'town/norn', 1024, True), ('gate_tower', 'town/norn', 640, False), ('kardia_gate', 'town/norn', 768, False),
        ('clock_tower', 'town/norn', 768, False), ('witch_house', 'forest', 768, False), ('signpost_forest', 'forest', 512, False), ('herbs_forest', 'forest', 512, False), ('firewood_forest', 'forest', 512, False)]
for n, sub, side, wall in JOBS:
    im = Image.open(os.path.join(SRC, n + '.png')).convert('RGBA')
    l, t, r, b = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    im = im.crop((0, t, im.width, b) if wall else (l, t, r, b))
    s = min(1, side / max(im.size)); im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    p = os.path.join(ROOT, sub, n + '.webp'); im.save(p, 'WEBP', quality=88, method=6); print(n, im.size, os.path.getsize(p) // 1024, 'KB')
for n, o in [('erde_backdrop_day', 'erde_day_v01.jpg'), ('erde_backdrop_night', 'erde_night_v01.jpg')]:
    im = Image.open(os.path.join(SRC, n + '.png')).convert('RGB'); s = 2400 / im.width; im = im.resize((2400, round(im.height * s)), Image.LANCZOS)
    p = os.path.join(ROOT, 'backdrops', o); im.save(p, 'JPEG', quality=86); print(o, im.size, os.path.getsize(p) // 1024, 'KB')
