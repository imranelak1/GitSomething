import { describe, expect, it, vi } from 'vitest';
import {
  clampTerminalHeight,
  DEFAULT_TERMINAL_PREFERENCES,
  normalizeTerminalPreferences,
  readTerminalPreferences,
  TERMINAL_PREFERENCES_KEY,
  terminalHeightBounds,
  writeTerminalPreferences,
} from './terminal-preferences';

describe('terminal appearance preferences', () => {
  it('recovers from absent, malformed, and inaccessible storage', () => {
    for (const saved of [null, 'broken json', 'null', 'false', '[]']) {
      expect(readTerminalPreferences({ getItem: () => saved, setItem: vi.fn() })).toEqual(
        DEFAULT_TERMINAL_PREFERENCES,
      );
    }
    expect(
      readTerminalPreferences({
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: vi.fn(),
      }),
    ).toEqual(DEFAULT_TERMINAL_PREFERENCES);
  });

  it('bounds stored values and rejects wrong types and nonfinite numbers', () => {
    expect(normalizeTerminalPreferences({ height: 9000, fontSize: 1 })).toEqual({
      height: 600,
      fontSize: 12,
    });
    expect(normalizeTerminalPreferences({ height: -90, fontSize: 900 })).toEqual({
      height: 160,
      fontSize: 18,
    });
    expect(normalizeTerminalPreferences({ height: '350', fontSize: Infinity })).toEqual(
      DEFAULT_TERMINAL_PREFERENCES,
    );
    expect(normalizeTerminalPreferences({ height: NaN, fontSize: 14.6 })).toEqual({
      height: 244,
      fontSize: 15,
    });
  });

  it('keeps room for workspace and adapts saved heights to the viewport', () => {
    expect(terminalHeightBounds(700)).toEqual({ min: 160, max: 340 });
    expect(terminalHeightBounds(1000)).toEqual({ min: 160, max: 600 });
    expect(terminalHeightBounds(400)).toEqual({ min: 160, max: 160 });
    expect(terminalHeightBounds(900, 215)).toEqual({ min: 160, max: 215 });
    expect(terminalHeightBounds(700, 90)).toEqual({ min: 160, max: 160 });
    expect(clampTerminalHeight(600, 700)).toBe(340);
    expect(clampTerminalHeight(70, 900)).toBe(160);
    expect(clampTerminalHeight(NaN, 900)).toBe(244);
  });

  it('persists a normalized value and tolerates storage write failures', () => {
    const setItem = vi.fn();
    writeTerminalPreferences({ getItem: () => null, setItem }, { height: 330.4, fontSize: 16 });
    expect(setItem).toHaveBeenCalledWith(
      TERMINAL_PREFERENCES_KEY,
      JSON.stringify({ height: 330, fontSize: 16 }),
    );
    expect(() =>
      writeTerminalPreferences(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error('full');
          },
        },
        DEFAULT_TERMINAL_PREFERENCES,
      ),
    ).not.toThrow();
  });
});
