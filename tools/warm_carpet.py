# Beige carpet: warm and lighten textures/carpet_beige.jpg in place, keeping its pile detail. Each channel
# is shifted so the mean lands on about rgb(208, 195, 174) (light warm beige); the variation round the
# mean is kept as it is. Re-running it is harmless (it targets the mean, it doesn't add to it).
# Usage: python tools/warm_carpet.py
import os
import numpy as np
from PIL import Image

TARGET = np.array([208, 195, 174], float)
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'textures', 'carpet_beige.jpg')
a = np.asarray(Image.open(path).convert('RGB')).astype(float)
mean = a.reshape(-1, 3).mean(0)
out = a - mean + TARGET
Image.fromarray(np.clip(out, 0, 255).round().astype(np.uint8)).save(path, quality=92)
print('mean', mean.round(1), '->', out.reshape(-1, 3).mean(0).round(1))
