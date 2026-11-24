"""Usage: make_pano.py <still> <output_base> [horizon] [options]

Turns one wide film still into a full 360-degree backdrop. The still fills the
quarter of the view straight ahead; mirrored copies carry it round the horizon
(so every join is seamless), and the sky and ground are continued past its top
and bottom edges as soft washes of the edge colours.

horizon   how far down the still eye level sits (0 = top edge, 1 = bottom)
options   plain=right[:0.4]  that side of the still (that fraction of it) has no landmark (sun, tower);
                             the other three quarters are built from it alone,
                             so the landmark appears only once
          skymax             ignore trees poking through the top edge when
                             continuing the sky (for bright daytime skies)
"""
import sys, cv2, numpy as np
src = cv2.imread(sys.argv[1]); out = sys.argv[2]
HORIZON = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
opts = dict(o.split('=') if '=' in o else (o, '1') for o in sys.argv[4:])
h0, w0 = src.shape[:2]
W, H = 8192, 4096
tile = W // 4
sh = int(round(h0 * tile / w0))
still = cv2.resize(src, (tile, sh), interpolation=cv2.INTER_LANCZOS4 if w0 < tile else cv2.INTER_AREA)
blur = cv2.GaussianBlur(still, (0, 0), 1.2); still = cv2.addWeighted(still, 1.3, blur, -0.3, 0)
if 'plain' in opts:
    side, _, frac = opts['plain'].partition(':')
    frac = float(frac) if frac else 0.5                              # how much of the still, from that side, is plain
    o = still if side == 'right' else still[:, ::-1]                 # landmark first, plain part last
    half = cv2.resize(o[:, int(tile * (1 - frac)):], (tile // 2, sh), interpolation=cv2.INTER_CUBIC)
    plain = np.concatenate([half[:, ::-1], half], axis=1)            # starts and ends on the still's plain edge
    # Ease the last plain tile into the still's landmark-side edge: its final stretch
    # takes on the colours of the still's first column, so a glow there fades out smoothly.
    last = plain.astype(np.float32)
    m = int(tile * 0.18)
    r = np.linspace(0, 1, m); r = (r * r * (3 - 2 * r))[None, :, None]
    last[:, -m:] = last[:, -m:] * (1 - r) + o[:, :3].astype(np.float32).mean(1, keepdims=True) * r
    strip = np.concatenate([o, plain, plain, last.astype(np.uint8)], axis=1)
    if side != 'right':
        strip = np.roll(strip[:, ::-1], tile, axis=1)
else:
    strip = np.concatenate([still, still[:, ::-1], still, still[:, ::-1]], axis=1)
strip = np.roll(strip, W // 2 - tile // 2, axis=1)                   # the still itself sits straight ahead
# Let the top and bottom of the picture dissolve into haze, so the washes beyond start softly.
def haze(rows_idx, strength_of):
    for y in rows_idx:
        k = strength_of(y)
        if k <= 0: continue
        row = strip[y:y + 1].astype(np.float32)
        sig = 2 + k * 120
        pad = int(sig * 3 + 2)
        big = np.concatenate([row[:, -pad:], row, row[:, :pad]], axis=1)
        soft = cv2.GaussianBlur(big, (0, 0), sigmaX=sig, sigmaY=0.01)[:, pad:-pad]
        strip[y] = (row * (1 - k) + soft * k)[0].astype(np.uint8)
nt, nb = int(sh * float(opts.get('fadetop', 0.10))), int(sh * float(opts.get('fadebottom', 0.06)))
haze(range(nt), lambda y: (1 - y / max(1, nt)) ** 1.5)
haze(range(sh - nb, sh), lambda y: ((y - (sh - nb)) / max(1, nb)) ** 1.5)
top = int(H / 2 - HORIZON * sh); bot = top + sh
pano = np.zeros((H, W, 3), np.float32)
pano[max(0, top):min(H, bot)] = strip[max(0, -top):sh - max(0, bot - H)]

def wrap_blur(row, sigma):
    pad = int(min(row.shape[1], sigma * 3 + 2))
    big = np.concatenate([row[:, -pad:], row, row[:, :pad]], axis=1)
    return cv2.GaussianBlur(big, (0, 0), sigmaX=sigma, sigmaY=0.01)[:, pad:-pad]

def extend(edge, n, bright=False):
    """Continue past an edge: each row is the edge colours, blurred wider the further out, easing to their mean."""
    S = 8
    row = cv2.resize(edge.astype(np.float32), (W // S, 1), interpolation=cv2.INTER_AREA)
    if bright:
        row = cv2.dilate(row, np.ones((1, 61), np.uint8))
    mean = row.reshape(-1, 3).mean(0)
    ns = max(1, int(np.ceil(n / S)))
    rows = np.empty((ns, W // S, 3), np.float32)
    for i in range(ns):
        t = i / max(1, ns - 1)
        r = wrap_blur(row, 3 + (t ** 0.8) * 160)
        rows[i] = r[0] * (1 - t ** 1.4) + mean * (t ** 1.4)
    return cv2.resize(rows, (W, ns * S), interpolation=cv2.INTER_CUBIC)[:n]

if top > 0:
    pano[:top] = extend(strip[:6].mean(0, keepdims=True), top, 'skymax' in opts)[::-1]
if bot < H:
    pano[bot:] = extend(strip[-6:].mean(0, keepdims=True), H - bot)
for y in (top, bot):
    if 0 < y < H:
        a, b = max(0, y - 40), min(H, y + 40)
        seg = cv2.GaussianBlur(pano[a:b], (0, 0), 6)
        wgt = (1 - np.abs(np.linspace(-1, 1, b - a)))[:, None, None] ** 1.5
        pano[a:b] = pano[a:b] * (1 - wgt) + seg * wgt
pano = np.clip(pano, 0, 255).astype(np.uint8)
cv2.imwrite(out + '_8k.jpg', pano, [cv2.IMWRITE_JPEG_QUALITY, 92])
cv2.imwrite(out + '_4k.jpg', cv2.resize(pano, (4096, 2048), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 92])
cv2.imwrite(out + '_preview.jpg', cv2.resize(pano, (1600, 800), interpolation=cv2.INTER_AREA))
g = strip[-max(2, int(sh * 0.12)):].reshape(-1, 3)
hexc = lambda v: '#%02x%02x%02x' % tuple(int(x) for x in v[::-1])
print(out.split('/')[-1], 'ground', hexc(g.mean(0)), 'light', hexc(np.percentile(g, 80, axis=0)), 'dark', hexc(np.percentile(g, 20, axis=0)))
