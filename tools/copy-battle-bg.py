# 戦闘の背景・床の元絵（美術・演出室 ART-BATTLE-BG-20261125、pixel/元絵/戦闘背景_v01）を、ゲーム用に webp へ写す。元絵は変えない。
# 使い方：<python> -I tools/copy-battle-bg.py
import os, sys
from PIL import Image
SRC = os.path.join(os.environ.get('USERPROFILE', 'C:/Users/takhy'), 'OneDrive/ドキュメント/ChatGPT/物語/production/claude/pixel/元絵/戦闘背景_v01')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'battle')
os.makedirs(OUT, exist_ok=True)
for n in ['battle_forest_day', 'battle_forest_night', 'battle_town_day', 'battle_town_night', 'battle_dungeon', 'battle_floor_forest', 'battle_floor_town', 'battle_floor_dungeon']:
    im = Image.open(os.path.join(SRC, n + '.png')).convert('RGB')
    p = os.path.join(OUT, n + '.webp'); im.save(p, 'WEBP', quality=86, method=6)
    print(n, im.size, os.path.getsize(p) // 1024, 'KB')
