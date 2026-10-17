export interface TerminalPreferences {
  height: number;
  fontSize: number;
}

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const TERMINAL_PREFERENCES_KEY = 'branchline.terminal.v1';
export const DEFAULT_TERMINAL_PREFERENCES: Readonly<TerminalPreferences> = {
  height: 180,
  fontSize: 13,
};

/** Reserve room for the title bar, terminal heading, and a usable workspace. */
export function terminalHeightBounds(viewportHeight: number, contentCapacity = Infinity) {
  const availableHeight = Number.isFinite(viewportHeight) ? viewportHeight : 768;
  return {
    min: 160,
    max: Math.max(
      160,
      Math.floor(Math.min(600, availableHeight * 0.6, availableHeight - 360, contentCapacity)),
    ),
  };
}

export function clampTerminalHeight(height: number, viewportHeight: number): number {
  const { min, max } = terminalHeightBounds(viewportHeight);
  return Math.round(
    Math.min(
      max,
      Math.max(min, Number.isFinite(height) ? height : DEFAULT_TERMINAL_PREFERENCES.height),
    ),
  );
}

export function normalizeTerminalPreferences(value: unknown): TerminalPreferences {
  const source = value && typeof value === 'object' ? (value as Partial<TerminalPreferences>) : {};
  return {
    height:
      typeof source.height === 'number' && Number.isFinite(source.height)
        ? Math.round(Math.min(600, Math.max(160, source.height)))
        : DEFAULT_TERMINAL_PREFERENCES.height,
    fontSize:
      typeof source.fontSize === 'number' && Number.isFinite(source.fontSize)
        ? Math.round(Math.min(18, Math.max(12, source.fontSize)))
        : DEFAULT_TERMINAL_PREFERENCES.fontSize,
  };
}

export function readTerminalPreferences(storage: PreferenceStorage): TerminalPreferences {
  try {
    return normalizeTerminalPreferences(
      JSON.parse(storage.getItem(TERMINAL_PREFERENCES_KEY) || 'null'),
    );
  } catch {
    return { ...DEFAULT_TERMINAL_PREFERENCES };
  }
}

/** Preferences remain usable in memory if the browser blocks persistent storage. */
export function writeTerminalPreferences(storage: PreferenceStorage, value: TerminalPreferences) {
  try {
    storage.setItem(TERMINAL_PREFERENCES_KEY, JSON.stringify(normalizeTerminalPreferences(value)));
  } catch {
    // A denied or full localStorage must not interrupt terminal interactions.
  }
}
