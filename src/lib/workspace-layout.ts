export interface WorkspaceLayout {
  sidebarWidth: number;
  filesWidth: number;
  sidebarVisible: boolean;
}

export const WORKSPACE_LAYOUT_KEY = 'gitsomething.workspace-layout.v1';
export const DEFAULT_WORKSPACE_LAYOUT: Readonly<WorkspaceLayout> = {
  sidebarWidth: 224,
  filesWidth: 304,
  sidebarVisible: true,
};

const width = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.min(max, Math.max(min, value)))
    : fallback;

export function readWorkspaceLayout(): WorkspaceLayout {
  try {
    const saved = JSON.parse(localStorage.getItem(WORKSPACE_LAYOUT_KEY) || 'null');
    return {
      sidebarWidth: width(saved?.sidebarWidth, 224, 190, 320),
      filesWidth: width(saved?.filesWidth, 304, 248, 420),
      sidebarVisible: typeof saved?.sidebarVisible === 'boolean' ? saved.sidebarVisible : true,
    };
  } catch {
    return { ...DEFAULT_WORKSPACE_LAYOUT };
  }
}

export function writeWorkspaceLayout(value: WorkspaceLayout) {
  try {
    localStorage.setItem(WORKSPACE_LAYOUT_KEY, JSON.stringify(value));
  } catch {
    // Pane controls keep working when the browser denies persistent storage.
  }
}
