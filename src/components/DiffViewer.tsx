import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DiffEditor, loader, type DiffEditorProps } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { invoke } from '@tauri-apps/api/core';
import { Columns2, FileCode2, LoaderCircle, WrapText } from 'lucide-react';
import { demoDiff } from '@/lib/demo';
import { displayError } from '@/lib/console';
import type { ChangedFile, FileDiff } from '@/lib/types';
import { Button } from './ui/button';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

// Monaco 0.55 requires detaching the diff model before disposing its text models.
// The wrapper's passive cleanup does the reverse, so own the models here.
function ManagedDiffEditor(props: DiffEditorProps) {
  const editor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  useLayoutEffect(
    () => () => {
      const instance = editor.current;
      if (!instance) return;
      const models = instance.getModel();
      instance.setModel(null);
      models?.original.dispose();
      models?.modified.dispose();
      editor.current = null;
    },
    [],
  );
  return (
    <DiffEditor
      {...props}
      keepCurrentOriginalModel
      keepCurrentModifiedModel
      onMount={(instance, api) => {
        editor.current = instance;
        props.onMount?.(instance, api);
      }}
    />
  );
}

export default function DiffViewer({
  file,
  path,
  demo,
  onStage,
  busy,
}: {
  file?: ChangedFile;
  path: string;
  demo: boolean;
  onStage: () => void;
  busy: boolean;
}) {
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [error, setError] = useState('');
  const [split, setSplit] = useState(false);
  const [wrap, setWrap] = useState(true);
  useEffect(() => {
    let alive = true;
    setError('');
    setDiff(null);
    if (!file) return;
    if (demo) {
      setDiff(demoDiff(file.path));
      return;
    }
    invoke<FileDiff>('get_diff', { path, filePath: file.path, staged: file.staged })
      .then((result) => {
        if (alive) setDiff(result);
      })
      .catch((e) => {
        if (alive) setError(displayError(e));
      });
    return () => {
      alive = false;
    };
  }, [file, path, demo]);
  if (!file)
    return (
      <div className="empty-state">
        <FileCode2 size={36} strokeWidth={1} />
        <h3>Room for your next idea.</h3>
        <p>Your working directory is clean.</p>
      </div>
    );
  return (
    <section className="diff-panel" aria-label="File diff">
      <div className="diff-toolbar">
        <div className="diff-file">
          <FileCode2 size={15} />
          <span>{file.path}</span>
          <span className="diff-stats">
            <b>+{file.additions}</b>
            <i>−{file.deletions}</i>
          </span>
        </div>
        <div className="toolbar-actions">
          <button
            className={`icon-button ${wrap ? 'active' : ''}`}
            aria-label="Toggle word wrap"
            aria-pressed={wrap}
            onClick={() => setWrap(!wrap)}
          >
            <WrapText size={15} />
          </button>
          <button
            className={`icon-button ${split ? 'active' : ''}`}
            aria-label="Toggle split diff"
            aria-pressed={split}
            onClick={() => setSplit(!split)}
          >
            <Columns2 size={15} />
          </button>
        </div>
      </div>
      <div className="diff-context">
        <span>
          {file.staged
            ? 'Staged changes · included in your next commit'
            : 'Working changes · not yet staged'}
        </span>
        <span>
          {split ? 'Side by side' : 'Unified diff'}
          <span className="context-separator">/</span>Read only
        </span>
      </div>
      <div className="editor-container">
        {error ? (
          <div className="diff-error" role="alert">
            {error}
          </div>
        ) : diff ? (
          <ManagedDiffEditor
            original={diff.original}
            modified={diff.modified}
            language={diff.language}
            theme="gitsomething"
            loading={
              <div className="editor-loading">
                <LoaderCircle size={18} className="spin" /> Preparing your diff…
              </div>
            }
            beforeMount={(editor) =>
              editor.editor.defineTheme('gitsomething', {
                base: 'vs-dark',
                inherit: true,
                rules: [
                  { token: 'comment', foreground: '9198A1' },
                  { token: 'keyword', foreground: 'FF7B72' },
                  { token: 'string', foreground: 'A5D6FF' },
                  { token: 'number', foreground: '79C0FF' },
                  { token: 'tag', foreground: '7EE787' },
                  { token: 'delimiter', foreground: 'A6A7B0' },
                  { token: 'identifier', foreground: 'D8D9E0' },
                ],
                colors: {
                  'editor.background': '#0d1117',
                  'editor.foreground': '#f0f6fc',
                  'editorLineNumber.foreground': '#777b86',
                  'editorLineNumber.activeForeground': '#c0c2cb',
                  'editor.selectionBackground': '#388bfd33',
                  'editor.lineHighlightBackground': '#ffffff03',
                  'editorGutter.background': '#0d1117',
                  'diffEditor.insertedTextBackground': '#3fb95026',
                  'diffEditor.insertedLineBackground': '#3fb9500e',
                  'diffEditor.removedTextBackground': '#f8514926',
                  'diffEditor.removedLineBackground': '#f851490e',
                  'diffEditor.border': '#3d444d',
                  'editorOverviewRuler.border': '#131417',
                  'scrollbarSlider.background': '#7e839426',
                  'scrollbarSlider.hoverBackground': '#7e83944a',
                },
              })
            }
            options={{
              readOnly: true,
              originalEditable: false,
              renderSideBySide: split,
              automaticLayout: true,
              minimap: { enabled: false },
              fontFamily: 'Geist Mono, monospace',
              fontSize: 13,
              lineHeight: 26,
              fontLigatures: true,
              scrollBeyondLastLine: false,
              padding: { top: 18, bottom: 18 },
              renderLineHighlight: 'none',
              folding: false,
              lineNumbersMinChars: 3,
              glyphMargin: false,
              overviewRulerLanes: 0,
              renderOverviewRuler: false,
              scrollbar: { verticalScrollbarSize: 7, horizontalScrollbarSize: 7 },
              wordWrap: wrap ? 'on' : 'off',
              diffWordWrap: wrap ? 'on' : 'off',
              stickyScroll: { enabled: false },
              contextmenu: false,
              links: false,
            }}
          />
        ) : (
          <div className="editor-loading">
            <LoaderCircle className="spin" size={18} /> Reading file…
          </div>
        )}
      </div>
      <div className="diff-footer">
        <span>
          {file.staged
            ? 'This file is selected for your next commit.'
            : 'Stage selects this file for your next commit.'}
        </span>
        <Button size="sm" variant="outline" onClick={onStage} disabled={busy}>
          {file.staged ? 'Unstage file' : 'Stage file'}
          <span aria-hidden="true">{file.staged ? '−' : '+'}</span>
        </Button>
      </div>
    </section>
  );
}
