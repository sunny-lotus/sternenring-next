# 作者の録音（ノイズ低減版）から1回分ずつ切り出す。元のファイルは読むだけ。
# 2026-11-23 作者「足音とドアの音など録音したから入れてほしい」。MP3 は Audacity 同梱の libmp3lame（VBR 2）で作った
# 使い方: python -I cut.py <outdir>
import wave, array, sys, os, hashlib, json, math
SRC = r"C:\Users\takhy\OneDrive\ドキュメント\ChatGPT\物語\outputs"
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
# (出力名, 元, 始め秒, 終わり秒, 正規化グループ)
CUTS = [
    ('step_wood_01', '足音_木の床_ノイズ低減.wav', 2.12, 2.50, 'wood'),
    ('step_wood_02', '足音_木の床_ノイズ低減.wav', 2.77, 3.12, 'wood'),
    ('step_wood_03', '足音_木の床_ノイズ低減.wav', 3.54, 3.92, 'wood'),
    ('step_wood_04', '足音_木の床_ノイズ低減.wav', 4.27, 4.65, 'wood'),
    ('step_soft_01', '足音_布系_録音04_ノイズ低減.wav', 5.66, 5.92, 'soft'),
    ('step_soft_02', '足音_布系_録音04_ノイズ低減.wav', 6.98, 7.24, 'soft'),
    # 2026-11-23 作者「布の足音（2種類）は4種類だったよね」：雑音の大きかった前の2歩（元の録音の2.83秒・4.31秒）も、すぐ近くの音のない所（3.3〜4.1秒）で雑音を測って減らし（tools/denoise-wav.py）、足した
    ('step_soft_03', 'assets/audio/field/source/rec04_2.5-4.7_denoise.wav', 0.33, 0.59, 'soft'),
    ('step_soft_04', 'assets/audio/field/source/rec04_2.5-4.7_denoise.wav', 1.81, 2.07, 'soft'),
    # 2026-11-23 作者「石の上の足音使ってみて」：録音43（石の上の足音、ChatGPT のノイズ低減版）の4歩
    ('step_stone_01', '足音_石の上_仮_録音43_ノイズ低減.wav', 1.62, 1.84, 'stone'),
    ('step_stone_02', '足音_石の上_仮_録音43_ノイズ低減.wav', 2.26, 2.48, 'stone'),
    ('step_stone_03', '足音_石の上_仮_録音43_ノイズ低減.wav', 2.92, 3.14, 'stone'),
    ('step_stone_04', '足音_石の上_仮_録音43_ノイズ低減.wav', 3.64, 3.86, 'stone'),
    ('door_open', 'ドア開閉_ノイズ低減.wav', 2.10, 3.90, 'door_open'),  # 開く音は小さいので別にそろえる
    ('door_close', 'ドア開閉_ノイズ低減.wav', 6.95, 8.05, 'door'),
]
TARGET = 10 ** (-3 / 20)  # グループの中でいちばん大きい音の山を -3dBFS に（グループの中の大小はそのまま）
clips, peaks, meta = {}, {}, {}
src_sha = {}
for name, f, a, b, grp, *opt in CUTS:
    p = f if f.startswith('assets/') else os.path.join(SRC, f)  # assets/ で始まるものは NEXT の中（Claude が雑音を減らしたもの）
    if f not in src_sha: src_sha[f] = hashlib.sha256(open(p, 'rb').read()).hexdigest()
    w = wave.open(p); sr, ch = w.getframerate(), w.getnchannels(); assert w.getsampwidth() == 2
    if grp in ('wood', 'soft', 'stone'):  # 足音：足が着く瞬間（山の25%をはじめて超える所）を、どれも頭から8msにそろえる（2026-11-23 作者「なんか間隔がバラバラ」）
        w.setpos(max(0, int((a - 0.05) * sr))); m = int((b - a + 0.1) * sr); xx = array.array('h', w.readframes(m)); s0 = max(0, int((a - 0.05) * sr)) / sr
        mono = [abs(xx[i * ch]) for i in range(len(xx) // ch)]; pk = max(mono); on = next(i for i, v in enumerate(mono) if v > 0.25 * pk)
        L = b - a; a = s0 + on / sr - 0.008; b = a + L
    w.setpos(int(a * sr)); n = int((b - a) * sr)
    x = array.array('h', w.readframes(n)); w.close()
    fi, fo = int(0.006 * sr), int(opt[0] * sr) if opt else int(n * 0.4)  # 頭は6msで立ち上げ、終わりの4割（opt があればその秒数）でゆっくり消す
    y = [0.0] * len(x)
    for i in range(n):
        g = min(1.0, i / fi) * (1.0 if i < n - fo else ((n - i) / fo) ** 2)
        for c in range(ch): y[i * ch + c] = x[i * ch + c] * g
    clips[name] = (y, sr, ch); meta[name] = dict(source=f, start=round(a, 3), end=round(b, 3), group=grp)
    peaks[grp] = max(peaks.get(grp, 0), max(abs(v) for v in y))
for name, (y, sr, ch) in clips.items():
    k = TARGET * 32767 / peaks[meta[name]['group']]
    z = array.array('h', (max(-32767, min(32767, int(round(v * k)))) for v in y))
    w = wave.open(os.path.join(out, name + '.wav'), 'wb'); w.setnchannels(ch); w.setsampwidth(2); w.setframerate(sr); w.writeframes(z.tobytes()); w.close()
    meta[name].update(gainDb=round(20 * math.log10(k), 1), seconds=round(len(y) / ch / sr, 3), sourceSha256=src_sha[meta[name]['source']])
    print(name, meta[name])
json.dump(meta, open(os.path.join(out, 'cuts.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
