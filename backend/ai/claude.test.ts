import { describe, expect, test } from 'bun:test';
import { detectClaude } from './claude';

describe('detectClaude', () => {
  test('returns unavailable when PATH is empty', () => {
    const det = detectClaude({ PATH: '' });
    expect(det.available).toBe(false);
    expect(det.binaryPath).toBeNull();
    expect(det.version).toBeNull();
  });

  test('returns unavailable when PATH points only at empty dirs', () => {
    const det = detectClaude({ PATH: '/nonexistent-dir-xyz' });
    expect(det.available).toBe(false);
    expect(det.binaryPath).toBeNull();
  });
});
