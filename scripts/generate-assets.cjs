#!/usr/bin/env node
// Export platform sizes from the approved original icon and transparent mascot.
// Artwork is created separately; this script only packages the existing pixels.
const fs = require('node:fs/promises');
const path = require('node:path');
const Jimp = require('jimp-compact');

const assets = path.join(__dirname, '..', 'assets');
const iconPath = path.join(assets, 'toxoff-mascot-icon-1024.png');
const mascotPath = path.join(assets, 'mascot', 'toxoff-mascot.png');
const background = 0x13433bff; // app.json splash and Android adaptive background

async function main() {
  const [icon, mascot] = await Promise.all([Jimp.read(iconPath), Jimp.read(mascotPath)]);
  if (icon.bitmap.width !== 1024 || icon.bitmap.height !== 1024 || icon.hasAlpha()) {
    throw new Error('The approved app-icon master must be opaque and 1024 × 1024.');
  }
  if (!mascot.hasAlpha()) throw new Error('The mascot needs a transparent background.');

  // Keep the user's original icon exactly; iOS applies its own corner mask.
  await fs.copyFile(iconPath, path.join(assets, 'icon.png'));
  await icon.clone().resize(196, 196, Jimp.RESIZE_BICUBIC).rgba(false)
    .writeAsync(path.join(assets, 'favicon.png'));

  // Inset the Android foreground into the central safe area, with no baked-in tile.
  const adaptive = new Jimp(1024, 1024, 0x00000000);
  adaptive.composite(mascot.clone().contain(640, 640, undefined, Jimp.RESIZE_BICUBIC), 192, 192);
  await adaptive.writeAsync(path.join(assets, 'adaptive-icon.png'));

  const splash = new Jimp(1284, 2778, background);
  splash.composite(mascot.clone().contain(800, 800, undefined, Jimp.RESIZE_BICUBIC), 242, 989);
  await splash.rgba(false).writeAsync(path.join(assets, 'splash.png'));

  // Android notification artwork is a white silhouette, preserving source alpha.
  const silhouette = mascot.clone();
  silhouette.scan(0, 0, silhouette.bitmap.width, silhouette.bitmap.height, function (_x, _y, i) {
    this.bitmap.data[i] = this.bitmap.data[i + 1] = this.bitmap.data[i + 2] = 255;
  });
  const notification = new Jimp(96, 96, 0x00000000);
  notification.composite(silhouette.contain(88, 88, undefined, Jimp.RESIZE_BICUBIC), 4, 4);
  await notification.writeAsync(path.join(assets, 'notification-icon.png'));

  console.log('Exported original icon, mascot splash, adaptive icon, favicon, and notification silhouette.');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
