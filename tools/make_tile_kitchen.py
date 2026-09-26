# Kitchen floor tile: 12" x 12" glazed off-white porcelain, straight lay, very faint mottling (mean about
# rgb(240, 235, 224)) and thin light grout (#d9d3c7, 1/8"). One texture covers 4 ft x 4 ft (4 x 4 tiles,
# material repeat 4) and wraps seamlessly: the grout sits on the tile edges and all the noise is periodic.
# Writes textures/tile_kitchen.jpg, tile_kitchen_normal.jpg (grout recessed) and tile_kitchen_rough.jpg
# (glaze a little smoother than the grout; the material's roughness, about 0.35, scales it).
# Usage: python tools/make_tile_kitchen.py
import os
import numpy as np
from PIL import Image

N = 2048                      # pixels across the 4 ft texture
FT = N / 4.0                  # pixels per foot
TILE = N // 4                 # 12" tile
GROUT = 0.125 / 12 * FT       # 1/8" grout width in pixels (~5.3)
MEAN = np.array([240, 235, 224], float)
GROUT_RGB = np.array([0xd9, 0xd3, 0xc7], float)
rng = np.random.default_rng(1212)


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


# very faint mottling in the glaze: soft clouds and a fine speckle, slightly warmer where darker
cloud = periodic_noise(1.5, 3.0)
speck = periodic_noise(0.4)
t = 0.8 * cloud + 0.2 * speck
rgb = np.empty((N, N, 3))
for ch, warm in enumerate([1.0, 1.0, 1.25]):
    rgb[..., ch] = MEAN[ch] * (1 + 0.012 * t * warm)
yy, xx = np.mgrid[0:N, 0:N]
tile_id = (yy // TILE) * 4 + (xx // TILE)
shade = 1 + 0.006 * rng.standard_normal(16)          # each tile a hair lighter or darker
rgb *= shade[tile_id][..., None]


def edge_dist(v):
    d = np.minimum(v % TILE, TILE - (v % TILE))
    return d.astype(float)


# grout centred on the tile edges (x, y = 0, 512, ...), wrapping at the texture edge; soft 1 px shoulder
d = np.minimum(edge_dist(xx + 0.5), edge_dist(yy + 0.5))
g = np.clip((GROUT / 2 + 0.75 - d) / 1.5, 0, 1)      # 1 inside the grout, 0 on the tile
rgb *= MEAN / (rgb * (1 - g[..., None])).reshape(-1, 3).sum(0) * (1 - g).sum()   # glaze averages MEAN
grout = GROUT_RGB * (1 + 0.02 * speck[..., None])
out = rgb * (1 - g[..., None]) + grout * g[..., None]
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'textures')
Image.fromarray(np.clip(out, 0, 255).round().astype(np.uint8)).save(os.path.join(root, 'tile_kitchen.jpg'), quality=92)

# normal map: glazed faces flat with the faintest undulation, grout recessed with eased (cushioned) edges
h = 1 - np.clip((GROUT / 2 + 2.0 - d) / 4.0, 0, 1) ** 1.5 * 0.9 + 0.002 * cloud
strength = 5.0
dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / 2 * strength
dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / 2 * strength
nrm = np.dstack([-dx, dy, np.ones_like(h)])
nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
Image.fromarray(((nrm * 0.5 + 0.5) * 255).round().astype(np.uint8)).save(os.path.join(root, 'tile_kitchen_normal.jpg'), quality=92)

# roughness: the glaze about 0.85 of the material value with a faint variation, the grout 1.0
rough = 0.85 + 0.03 * cloud
rough = rough * (1 - g) + 1.0 * g
Image.fromarray(np.clip(rough * 255, 0, 255).round().astype(np.uint8)).convert('RGB').save(os.path.join(root, 'tile_kitchen_rough.jpg'), quality=92)
print('mean colour', out.reshape(-1, 3).mean(0).round(1))
