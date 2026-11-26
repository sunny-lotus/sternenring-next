# 地区・店ごとの内装の元絵（美術・演出室 ART-INTERIORS-RETURN-20261126、pixel/元絵/内装_地区_v01 と 内装_追加_v01）を、ゲーム用に assets/interiors/district へ写す。元絵は変えない。
# 床・壁・天井（kind: texture）は 1024 のまま WebP。家具は透明でない所を切り出し、長い辺 512。切り抜いた大きさと種類（ground・hanging・top・loose-props）を data/interior-art.json に書く。
# 使い方：<python> -I tools/copy-interior-district-art.py
import os, json
from PIL import Image
P = os.path.join(os.environ.get('USERPROFILE', 'C:/Users/takhy'), 'OneDrive', 'ドキュメント', 'ChatGPT', '物語', 'production', 'claude', 'pixel', '元絵', '内装_地区_v01')
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'interiors', 'district'); os.makedirs(OUT, exist_ok=True)
cat = json.load(open(os.path.join(P, '素材カタログ_v01.json'), encoding='utf-8'))
art = {}
for e in cat:
    f = e['file']; name = os.path.splitext(os.path.basename(f))[0]
    im = Image.open(os.path.join(P, f)).convert('RGBA')
    if e['kind'] == 'texture':
        im.convert('RGB').save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=88, method=6); art[name] = {'kind': 'texture', 'repeat': e.get('repeatAxes', 'XY')}; continue
    b = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox(); im = im.crop(b)
    s = min(1, 512 / max(im.size)); im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=88, method=6)
    art[name] = {'kind': e['kind'], 'size': [im.width, im.height]}
json.dump({'format': 'sternenring-next-interior-art', 'version': 1, 'status': 'provisional', 'source': 'production/claude/pixel/元絵/内装_地区_v01（ART-INTERIORS-RETURN-20261126）', 'base': 'assets/interiors/district/', 'art': art,
           'sets': json.load(open(os.path.join(P, '部屋セット_対応v01.json'), encoding='utf-8')),
           'scale': json.load(open(os.path.join(P, '表示尺度_仮目安_v01.json'), encoding='utf-8'))}, open(os.path.join(ROOT, 'data', 'interior-art.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(art), 'files')
