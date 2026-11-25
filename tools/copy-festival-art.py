# 星環祭の飾りの元絵（美術・演出室 ART-FESTIVAL-20261125、pixel/元絵/町_ノルン_祭り_v01）を、ゲーム用に assets/town/norn へ webp で写す。元絵は変えない。
# town-prep と同じく透明でない所を切り出す（吊るす紐・竿の上のはしが板の上のはしになる）。長い辺は 1024 まで（通りに長く渡すので 512 より大きく）。屋台は stall.webp と同じく長い辺 512。
# 使い方：<python> -I tools/copy-festival-art.py
import os
from PIL import Image
SRC = os.path.join(os.environ.get('USERPROFILE', 'C:/Users/takhy'), 'OneDrive/ドキュメント/ChatGPT/物語/production/claude/pixel/元絵/町_ノルン_祭り_v01')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'town', 'norn')
for n, side in [('bunting', 1024), ('lantern_string', 1024), ('festival_banner', 512), ('flower_garland', 512), ('stall_festival', 512)]:
    im = Image.open(os.path.join(SRC, n + '.png')).convert('RGBA')
    box = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox(); im = im.crop(box)
    s = min(1, side / max(im.size)); im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    p = os.path.join(OUT, n + '.webp'); im.save(p, 'WEBP', quality=88, method=6)
    print(n, box, im.size, os.path.getsize(p) // 1024, 'KB')
