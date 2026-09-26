# Entry-landing floor tile: 18" x 18" porcelain, straight lay, cool greige with soft stone-like clouding
# (mean about #b9b2a7) and thin light-grey grout (#cfcac2, 1/8"). One texture covers 3 ft x 3 ft (2 x 2
# tiles) and wraps seamlessly: the grout sits on the tile edges and all the noise is periodic.
# Writes textures/tile_entry.jpg and textures/tile_entry_normal.jpg (grout lines recessed).
# Usage: python tools/make_tile_entry.py
import os
import numpy as np
from PIL import Image

N = 1024                      # pixels across the 3 ft texture
FT = N / 3.0                  # pixels per foot
TILE = N // 2                 # 18" tile
GROUT = 0.125 / 12 * FT       # 1/8" grout width in pixels (~3.6)
MEAN = np.array([0xb9, 0xb2, 0xa7], float)
GROUT_RGB = np.array([0xcf, 0xca, 0xc2], float)
rng = np.random.default_rng(1830)


def periodic_noise(beta, lo_cut=1.0):
    """Seamless fractal noise: white noise shaped by 1/f^beta in the Fourier domain, zero mean, unit std."""
    f = np.fft.fftfreq(N) * N
    fx, fy = np.meshgrid(f, f)
    r = np.hypot(fx, fy)
    r[0, 0] = 1
    amp = 1 / np.maximum(r, lo_cut) ** beta
    amp[0, 0] = 0
    spec = np.fft.fft2(rng.standard_normal((N, N))) * amp
    n = np.real(np.fft.ifft2(spec))
    return (n - n.mean()) / n.std()


# soft clouding (large, low-contrast), finer veining and a speckle, mixed into a light-to-mid greige
cloud = periodic_noise(1.6, 2.0)
veins = periodic_noise(1.1, 6.0)
speck = periodic_noise(0.3)
t = 0.62 * cloud + 0.3 * np.tanh(1.5 * veins) + 0.08 * speck
# light-to-mid: each channel scaled round the mean, a little warmer where darker (taupe clouds)
light = MEAN * 1.0
rgb = np.empty((N, N, 3))
for ch, warm in enumerate([1.0, 0.97, 0.9]):
    rgb[..., ch] = light[ch] * (1 + 0.075 * t * (1.0 if ch == 0 else warm))
# each tile a touch lighter or darker than its neighbours (batch variation)
yy, xx = np.mgrid[0:N, 0:N]
tile_id = (yy // TILE) * 2 + (xx // TILE)
shade = 1 + 0.018 * rng.standard_normal(4)
rgb *= shade[tile_id][..., None]
rgb *= MEAN / rgb.reshape(-1, 3).mean(0)          # hold the average at the target colour

# grout: centred on the tile edges (x, y = 0 and TILE), wrapping at the texture edge; soft 1 px shoulder
def edge_dist(v):
    d = np.minimum(v % TILE, TILE - (v % TILE))
    return d.astype(float)

d = np.minimum(edge_dist(xx + 0.5), edge_dist(yy + 0.5))
g = np.clip((GROUT / 2 + 0.75 - d) / 1.5, 0, 1)   # 1 inside the grout, 0 on the tile
grout = GROUT_RGB * (1 + 0.03 * speck[..., None])
out = rgb * (1 - g[..., None]) + grout * g[..., None]
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'textures')
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(os.path.join(root, 'tile_entry.jpg'), quality=90)

# normal map: tile faces flat with a faint surface undulation, grout recessed with eased edges
h = 1 - np.clip((GROUT / 2 + 1.5 - d) / 3.0, 0, 1) ** 1.5 * 0.9 + 0.004 * cloud
strength = 6.0
dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / 2 * strength
dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / 2 * strength
nrm = np.dstack([-dx, dy, np.ones_like(h)])
nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
Image.fromarray(((nrm * 0.5 + 0.5) * 255).round().astype(np.uint8)).save(os.path.join(root, 'tile_entry_normal.jpg'), quality=92)
print('mean colour', out.reshape(-1, 3).mean(0).round(1))
