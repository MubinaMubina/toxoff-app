#!/usr/bin/env python3
"""Builds the app's store assets from the master icon. Run: `npm run gen:assets` (needs Pillow).

Source: assets/toxoff-icon-green-1024.png (the finished icon: white outlined speech bubble with a
check and a pale lavender bubble behind it, on deep forest green #13433B).

Writes, in assets/:
  icon.png               1024x1024  iOS app icon (app.json "icon")
  adaptive-icon.png      1024x1024  Android foreground; the emblem sits inside the safe zone
  favicon.png            196x196    web
  splash.png             1284x2778  the emblem centred on the icon's own green (app.json "splash")
  notification-icon.png  96x96      Android status-bar icon: the emblem in white on transparency

The splash canvas colour is sampled from the icon's border, so the pasted icon has no visible edge.
"""
import os
import statistics

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, '..', 'assets')
SOURCE = os.path.join(ASSETS, 'toxoff-icon-green-1024.png')


def main() -> None:
    src = Image.open(SOURCE).convert('RGB')
    w, h = src.size
    ring = [src.getpixel((x, y)) for x in range(0, w, 4) for y in (2, h - 3)]
    ring += [src.getpixel((x, y)) for y in range(0, h, 4) for x in (2, w - 3)]
    bg = tuple(int(statistics.median(c[i] for c in ring)) for i in range(3))

    src.save(os.path.join(ASSETS, 'icon.png'))
    src.save(os.path.join(ASSETS, 'adaptive-icon.png'))
    src.resize((196, 196), Image.LANCZOS).save(os.path.join(ASSETS, 'favicon.png'))

    sw, sh = 1284, 2778
    splash = Image.new('RGB', (sw, sh), bg)
    side = int(sw * 0.62)
    splash.paste(src.resize((side, side), Image.LANCZOS), ((sw - side) // 2, (sh - side) // 2))
    splash.save(os.path.join(ASSETS, 'splash.png'))

    # Everything that isn't the background becomes white, with soft edges.
    def key(px):
        d = max(abs(px[i] - bg[i]) for i in range(3))
        return (255, 255, 255, min(255, max(0, int((d - 24) * 255 / 70))))

    mask = Image.new('RGBA', (w, h))
    mask.putdata([key(p) for p in src.getdata()])
    l, t, r, b = mask.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()
    pad = 40
    crop = mask.crop((max(0, l - pad), max(0, t - pad), min(w, r + pad), min(h, b + pad)))
    square = max(crop.size)
    sq = Image.new('RGBA', (square, square), (0, 0, 0, 0))
    sq.paste(crop, ((square - crop.size[0]) // 2, (square - crop.size[1]) // 2))
    sq.resize((96, 96), Image.LANCZOS).save(os.path.join(ASSETS, 'notification-icon.png'))

    print('background #%02X%02X%02X; wrote icon, adaptive-icon, favicon, splash, notification-icon' % bg)


if __name__ == '__main__':
    main()
