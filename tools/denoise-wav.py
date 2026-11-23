# 録音の雑音を減らす（スペクトルの引き算）。2026-11-23 作者「ノイズ取れたらとって」。元のファイルは読むだけ。
# 録音全体を細かく区切り、いちばん静かな区間（下から pct %、ふつう5%）を「雑音」とみなして、周波数ごとの雑音の大きさを測る。
# その大きさの何倍か（strength）より小さい成分を弱める（下げすぎて水中のような音にならないよう、floor より下には下げない）。
# 使い方: python -I denoise-wav.py <in.wav> <out.wav> <start秒> <end秒> [strength=2.0] [floor_dB=-18] [pct=5] [雑音を測る始め秒 終わり秒]（指定すると、その区間で雑音を測る。音のすぐ近くの雑音が全体とちがうとき）
import sys, wave
import numpy as np

src, dst, t0, t1 = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
strength = float(sys.argv[5]) if len(sys.argv) > 5 else 2.0
pct = float(sys.argv[7]) if len(sys.argv) > 7 else 5
nz = (float(sys.argv[8]), float(sys.argv[9])) if len(sys.argv) > 9 else None
floor = 10 ** ((float(sys.argv[6]) if len(sys.argv) > 6 else -18) / 20)
w = wave.open(src); sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes(); assert w.getsampwidth() == 2
x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float64).reshape(-1, ch) / 32768; w.close()
N, H = 2048, 512; win = np.hanning(N)

def stft(y):
    frames = [np.fft.rfft(win * y[i:i + N]) for i in range(0, len(y) - N, H)]
    return np.array(frames)

def istft(S, length):
    y = np.zeros(length + N); wsum = np.zeros(length + N)
    for k, F in enumerate(S):
        i = k * H; y[i:i + N] += win * np.fft.irfft(F, N); wsum[i:i + N] += win ** 2
    wsum[wsum < 1e-8] = 1; return (y / wsum)[:length]

out = np.zeros(((int(t1 * sr) - int(t0 * sr)), ch))
for c in range(ch):
    S = stft(x[:, c]); mag = np.abs(S)
    if nz: noise = np.median(np.abs(stft(x[int(nz[0] * sr):int(nz[1] * sr), c])), axis=0) + 1e-12 # 指定の区間で雑音を測る
    else:
        level = mag.sum(axis=1); quiet = level <= np.percentile(level[level > 0], pct)
        noise = np.median(mag[quiet], axis=0) + 1e-12 # 周波数ごとの雑音の大きさ
    a, b = max(0, int(t0 * sr) - N), min(len(x), int(t1 * sr) + N)
    Sseg = stft(x[a:b, c]); m = np.abs(Sseg)
    g = np.clip(1 - strength * noise / (m + 1e-12), floor, 1)
    g = np.apply_along_axis(lambda r: np.convolve(r, np.ones(3) / 3, 'same'), 0, g) # 時間方向に少しならす（ちらつく音を防ぐ）
    y = istft(Sseg * g, b - a)
    s0 = int(t0 * sr) - a; out[:, c] = y[s0:s0 + out.shape[0]]
o = wave.open(dst, 'wb'); o.setnchannels(ch); o.setsampwidth(2); o.setframerate(sr)
o.writeframes((np.clip(out, -1, 1) * 32767).astype(np.int16).tobytes()); o.close()
def db(v): return 20 * np.log10(np.sqrt(np.mean(v ** 2)) + 1e-12)
print(f'{dst}: {out.shape[0] / sr:.2f}s  雑音の推定 {db(noise):.1f}  前 {db(x[int(t0*sr):int(t1*sr)]):.1f}dB → 後 {db(out):.1f}dB')
