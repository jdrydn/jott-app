import { describe, expect, test } from 'bun:test';
import { defaultDataDir } from './paths';

describe('defaultDataDir', () => {
  test('linux/macOS: XDG_DATA_HOME', () => {
    const dir = defaultDataDir({
      platform: 'linux',
      home: '/home/u',
      env: { XDG_DATA_HOME: '/data' },
    });
    expect(dir).toBe('/data/jottapp');
  });

  test('linux/macOS: falls back to ~/.local/share', () => {
    const dir = defaultDataDir({ platform: 'darwin', home: '/Users/u', env: {} });
    expect(dir).toBe('/Users/u/.local/share/jottapp');
  });

  test('win32: APPDATA', () => {
    const dir = defaultDataDir({
      platform: 'win32',
      home: 'C:\\Users\\u',
      env: { APPDATA: 'C:\\Users\\u\\AppData\\Roaming' },
    });
    expect(dir).toContain('jottapp');
  });

  test('win32: falls back to home AppData/Roaming', () => {
    const dir = defaultDataDir({ platform: 'win32', home: 'C:\\Users\\u', env: {} });
    expect(dir).toContain('AppData');
    expect(dir).toContain('jottapp');
  });
});
