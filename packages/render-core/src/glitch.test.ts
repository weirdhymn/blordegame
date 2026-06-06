import { describe, expect, it } from 'vitest';
import { transformHex } from './glitch.js';

describe('glitch transforms (§4.3b)', () => {
  it('inverts each channel', () => {
    expect(transformHex('#000000', 'inverted')).toBe('#ffffff');
    expect(transformHex('#ffffff', 'inverted')).toBe('#000000');
    // 0x5a→0xa5, 0x2e→0xd1, 0x18→0xe7
    expect(transformHex('#5a2e18', 'inverted')).toBe('#a5d1e7');
  });

  it('screen pushes toward white', () => {
    // 0 + 255*0.55 = 140.25 → 140 = 0x8c
    expect(transformHex('#000000', 'screen')).toBe('#8c8c8c');
  });

  it('shade pushes toward black', () => {
    // 255 * 0.45 = 114.75 → 115 = 0x73
    expect(transformHex('#ffffff', 'shade')).toBe('#737373');
  });

  it('passes non-hex tokens through unchanged', () => {
    expect(transformHex('matches body', 'inverted')).toBe('matches body');
  });
});
