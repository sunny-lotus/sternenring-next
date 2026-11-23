# 戸口の奥に置く「中の眺めの写し」を、明るく（または暗く）してぼかす（2026-11-23 作者「今回はそのスクリーンショットを明るくしてぼかしておいておく。洞窟とかだったら、くらくしてぼかしておいておく」）。
# 写しは tools/capture-peek.html で撮る（横に広く）。元の写しは変えない。
# 使い方: python -I peek-tone.py <in.jpg|png> <out.webp> <bright|dark> [ぼかしの半径px=7] [明るさ（bright 1.35・dark 0.45 のかわり）]
import sys
from PIL import Image, ImageEnhance, ImageFilter

src, dst, tone = sys.argv[1], sys.argv[2], sys.argv[3]
radius = float(sys.argv[4]) if len(sys.argv) > 4 else 7
bright = float(sys.argv[5]) if len(sys.argv) > 5 else None
im = Image.open(src).convert('RGB')
if tone == 'bright':  # 明るい部屋：明るく、少し色をうすく、暖かいもやを重ねる
    im = ImageEnhance.Brightness(im).enhance(bright or 1.35)
    im = ImageEnhance.Color(im).enhance(0.85)
    im = Image.blend(im, Image.new('RGB', im.size, (255, 226, 176)), 0.18 if (bright or 1.35) > 1.2 else 0.06)
elif tone == 'dark':  # 洞窟など：暗く、色をうすく
    im = ImageEnhance.Brightness(im).enhance(bright or 0.45)
    im = ImageEnhance.Color(im).enhance(0.7)
else:
    raise SystemExit('tone は bright か dark')
im = im.filter(ImageFilter.GaussianBlur(radius))
im.save(dst, 'WEBP', quality=86, method=6)
print(dst, im.size, tone, radius)
