// Verify the shared palette's readable pairings in both appearances, without React Native.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/theme/colors.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const theme = { exports: {} };
new Function('module', 'exports', compiled)(theme, theme.exports);

function luminance(hex) {
  const linear = hex.slice(1).match(/../g).map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
function contrast(foreground, background) {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function check(colors, fg, bg, minimum) {
  const ratio = contrast(colors[fg], colors[bg]);
  assert.ok(ratio >= minimum, `${fg} on ${bg}: ${ratio.toFixed(2)}:1, expected at least ${minimum}:1`);
}

for (const appearance of ['lightColors', 'darkColors']) {
  const colors = theme.exports[appearance];
  test(`${appearance}: all semantic badges, notices and brand pills meet normal-text AA`, () => {
    for (const tone of ['success', 'warning', 'danger', 'info', 'neutral', 'brand', 'accent']) {
      const pair = theme.exports.getSemanticColors(colors, tone);
      assert.ok(contrast(pair.text, pair.background) >= 4.5, `${tone} foreground/fill pair`);
    }
  });
  test(`${appearance}: body, secondary and placeholder text stay readable on actual UI fills`, () => {
    for (const bg of ['background', 'surface', 'surfaceAlt', 'card', 'primarySoft', 'hero',
      'filtered', 'successSoft', 'warningSoft', 'dangerSoft', 'infoSoft', 'neutralSoft', 'accentSoft']) {
      for (const fg of ['text', 'textMuted', 'textFaint']) check(colors, fg, bg, 4.5);
    }
    check(colors, 'onPrimary', 'primary', 4.5);
    check(colors, 'tabInactive', 'card', 4.5);
  });
  test(`${appearance}: switch state tracks contrast with the thumb and adjacent surface`, () => {
    for (const fg of ['switchOn', 'switchOff']) {
      for (const bg of ['switchThumb', 'background', 'card', 'surface']) check(colors, fg, bg, 3);
    }
  });
}
