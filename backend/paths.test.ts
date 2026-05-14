import { describe, expect, test } from 'bun:test';
import { defaultDbPath } from './paths';

describe('defaultDbPath', () => {
  test('linux/macOS: XDG_DATA_HOME', () => {
    const path = defaultDbPath({
      platform: 'linux',
      home: '/home/u',
      env: { XDG_DATA_HOME: '/data' },
    });
    expect(path).toBe('/data/jottapp/jottapp.db');
  });

  test('linux/macOS: falls back to ~/.local/share', () => {
    const path = defaultDbPath({ platform: 'darwin', home: '/Users/u', env: {} });
    expect(path).toBe('/Users/u/.local/share/jottapp/jottapp.db');
  });

  test('win32: APPDATA', () => {
    const path = defaultDbPath({
      platform: 'win32',
      home: 'C:\\Users\\u',
      env: { APPDATA: 'C:\\Users\\u\\AppData\\Roaming' },
    });
    expect(path).toContain('jottapp');
    expect(path).toContain('jottapp.db');
  });

  test('win32: falls back to home AppData/Roaming', () => {
    const path = defaultDbPath({ platform: 'win32', home: 'C:\\Users\\u', env: {} });
    expect(path).toContain('AppData');
    expect(path).toContain('jottapp.db');
  });
});
