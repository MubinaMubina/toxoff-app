#!/usr/bin/env node
'use strict';

// Run from any directory: node artifacts/app-store/export.cjs
// Converts only the six named native captures, without resizing or changing their RGB pixels.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const Jimp = require('jimp-compact');
const { PNG } = require('pngjs');

const DIRECTORY = path.join(__dirname, 'iphone-6.9');
const ARCHIVE = path.join(__dirname, 'toxoff-app-store-iphone-6.9.zip');
const FILES = [
  '01-home.png',
  '02-log-deleted.png',
  '03-log-hidden.png',
  '04-filters.png',
  '05-paywall.png',
  '06-welcome.png',
];
const WIDTH = 1320;
const HEIGHT = 2868;
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PROFILE_TYPES = new Set(['iCCP', 'sRGB', 'cHRM', 'gAMA', 'pHYs']);

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parsePng(buffer, label) {
  assert(buffer.subarray(0, 8).equals(SIGNATURE), `${label}: invalid PNG signature`);
  const chunks = [];
  let cursor = 8;
  while (cursor < buffer.length) {
    assert(cursor + 12 <= buffer.length, `${label}: truncated PNG chunk`);
    const length = buffer.readUInt32BE(cursor);
    const end = cursor + 12 + length;
    assert(end <= buffer.length, `${label}: truncated PNG payload`);
    const type = buffer.toString('ascii', cursor + 4, cursor + 8);
    assert.equal(crc32(buffer.subarray(cursor + 4, end - 4)), buffer.readUInt32BE(end - 4), `${label}: ${type} CRC mismatch`);
    chunks.push({ type, data: buffer.subarray(cursor + 8, end - 4), raw: buffer.subarray(cursor, end) });
    cursor = end;
    if (type === 'IEND') break;
  }
  assert.equal(cursor, buffer.length, `${label}: unexpected trailing data`);
  assert.equal(chunks[0]?.type, 'IHDR', `${label}: missing IHDR`);
  assert.equal(chunks.filter((chunk) => chunk.type === 'IHDR').length, 1, `${label}: duplicate IHDR`);
  assert.equal(chunks[0].data.length, 13, `${label}: invalid IHDR`);
  assert.equal(chunks.at(-1)?.type, 'IEND', `${label}: missing IEND`);
  assert.equal(chunks.at(-1).data.length, 0, `${label}: invalid IEND`);
  assert(chunks.some((chunk) => chunk.type === 'IDAT'), `${label}: missing image data`);
  assert(!chunks.some((chunk) => chunk.type === 'acTL'), `${label}: animated PNG is not supported`);
  const header = chunks[0].data;
  assert.equal(header.readUInt32BE(0), WIDTH, `${label}: unexpected width`);
  assert.equal(header.readUInt32BE(4), HEIGHT, `${label}: unexpected height`);
  assert.equal(header[8], 8, `${label}: expected 8-bit channels`);
  assert([2, 6].includes(header[9]), `${label}: expected RGB or RGBA input`);
  return { chunks, colorType: header[9] };
}

function profiles(png) {
  return png.chunks.filter((chunk) => PROFILE_TYPES.has(chunk.type));
}

function assertOpaque(image, label) {
  assert.equal(image.bitmap.width, WIDTH, `${label}: decoded width differs`);
  assert.equal(image.bitmap.height, HEIGHT, `${label}: decoded height differs`);
  assert.equal(image.bitmap.data.length, WIDTH * HEIGHT * 4, `${label}: unexpected bitmap size`);
  for (let offset = 3; offset < image.bitmap.data.length; offset += 4) {
    if (image.bitmap.data[offset] !== 255) {
      assert.fail(`${label}: transparency at pixel ${(offset - 3) / 4}`);
    }
  }
}

function encodeRgb(rgbaPixels) {
  // Copy the already-verified opaque RGB samples directly. Jimp's rgba(false)
  // export composites pixels and can round channel values, even with alpha 255.
  const rgb = Buffer.allocUnsafe(WIDTH * HEIGHT * 3);
  for (let source = 0, target = 0; source < rgbaPixels.length; source += 4, target += 3) {
    rgb[target] = rgbaPixels[source];
    rgb[target + 1] = rgbaPixels[source + 1];
    rgb[target + 2] = rgbaPixels[source + 2];
  }
  // Matching input/output color types selects pngjs's raw, noncompositing path.
  return PNG.sync.write({ width: WIDTH, height: HEIGHT, data: rgb }, {
    inputColorType: 2,
    colorType: 2,
    inputHasAlpha: false,
    bitDepth: 8,
  });
}

async function prepare(filename) {
  const filepath = path.join(DIRECTORY, filename);
  const input = fs.readFileSync(filepath);
  const original = parsePng(input, filename);
  const originalProfiles = profiles(original);
  const image = await Jimp.read(input);
  assertOpaque(image, filename);
  const originalPixels = Buffer.from(image.bitmap.data);
  let output = input;

  // Already compliant PNGs keep their exact bytes, making repeated exports idempotent.
  if (original.colorType !== 2 || original.chunks.some((chunk) => chunk.type === 'tRNS')) {
    const encoded = encodeRgb(originalPixels);
    const encodedPng = parsePng(encoded, `${filename} encoded`);
    // The encoder omits ancillary profiles. Restore source chunks verbatim after IHDR.
    output = Buffer.concat([
      SIGNATURE,
      encodedPng.chunks[0].raw,
      ...originalProfiles.map((chunk) => chunk.raw),
      ...encodedPng.chunks.slice(1)
        .filter((chunk) => !PROFILE_TYPES.has(chunk.type) && chunk.type !== 'tRNS')
        .map((chunk) => chunk.raw),
    ]);
  }

  const result = parsePng(output, `${filename} result`);
  assert.equal(result.colorType, 2, `${filename}: output is not RGB`);
  assert(!result.chunks.some((chunk) => chunk.type === 'tRNS'), `${filename}: output has tRNS transparency`);
  const resultProfiles = profiles(result);
  assert.equal(resultProfiles.length, originalProfiles.length, `${filename}: profile chunk count changed`);
  originalProfiles.forEach((chunk, index) => {
    assert(chunk.raw.equals(resultProfiles[index].raw), `${filename}: ${chunk.type} changed`);
  });
  const decoded = await Jimp.read(output);
  assertOpaque(decoded, `${filename} result`);
  assert(originalPixels.equals(decoded.bitmap.data), `${filename}: decoded pixels changed`);

  return {
    filepath,
    input,
    output,
    manifest: {
      file: filename,
      dimensions: `${WIDTH}x${HEIGHT}`,
      format: 'RGB8',
      sha256: sha256(output),
      profileChunks: resultProfiles.map((chunk) => chunk.type),
    },
  };
}

async function main() {
  const found = fs.readdirSync(DIRECTORY).filter((name) => /\.png$/i.test(name)).sort();
  assert.deepEqual(found, [...FILES].sort(), 'Expected exactly the six named screenshot PNGs; capture them all before exporting.');

  // Finish every opacity/profile/pixel check before changing any capture.
  const prepared = [];
  for (const filename of FILES) prepared.push(await prepare(filename));
  for (const item of prepared) {
    assert(fs.readFileSync(item.filepath).equals(item.input), `${item.manifest.file}: source changed during validation`);
  }
  for (const item of prepared) {
    if (!item.input.equals(item.output)) {
      const temporary = `${item.filepath}.${process.pid}.tmp`;
      let created = false;
      try {
        fs.writeFileSync(temporary, item.output, { flag: 'wx' });
        created = true;
        fs.renameSync(temporary, item.filepath);
      } finally {
        if (created && fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
    }
    assert(fs.readFileSync(item.filepath).equals(item.output), `${item.manifest.file}: written bytes differ`);
  }

  // Create a fresh archive so old or unrelated entries can never survive a rerun.
  const temporaryZip = path.join(__dirname, `.toxoff-app-store-iphone-6.9-${process.pid}.zip`);
  assert(!fs.existsSync(temporaryZip), `Temporary archive already exists: ${temporaryZip}`);
  try {
    execFileSync('zip', ['-q', '-X', temporaryZip, ...FILES], { cwd: DIRECTORY });
    const entries = execFileSync('unzip', ['-Z1', temporaryZip], { encoding: 'utf8' }).trim().split(/\r?\n/);
    assert.deepEqual(entries, FILES, 'Archive must contain exactly six PNGs in the requested order');
    execFileSync('unzip', ['-tqq', temporaryZip]);
    for (const item of prepared) {
      const archived = execFileSync('unzip', ['-p', temporaryZip, item.manifest.file], { maxBuffer: 32 * 1024 * 1024 });
      assert(archived.equals(item.output), `${item.manifest.file}: archive bytes differ`);
    }
    fs.renameSync(temporaryZip, ARCHIVE);
  } finally {
    if (fs.existsSync(temporaryZip)) fs.unlinkSync(temporaryZip);
  }

  console.log(JSON.stringify({
    checks: 'PASS: 6 PNGs; 1320x2868; opaque source pixels; RGB8 without tRNS; exact decoded pixels and profile chunks preserved; ZIP order and bytes verified.',
    files: prepared.map((item) => item.manifest),
    archive: { file: path.basename(ARCHIVE), sha256: sha256(fs.readFileSync(ARCHIVE)) },
  }, null, 2));
}

main().catch((error) => {
  console.error(`Screenshot export failed: ${error.message}`);
  process.exitCode = 1;
});
