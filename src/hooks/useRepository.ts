import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { demoLog, demoRepository, initialLogs } from '@/lib/demo';
import { displayError, mergeLog } from '@/lib/console';
import { isDesktop, type GitLog, type RepositorySnapshot } from '@/lib/types';
import { useActivity } from './useActivity';

export function useRepository() {
  const { record } = useActivity();
  const [repository, setRepository] = useState<RepositorySnapshot>(demoRepository);
  const [demo, setDemo] = useState(true);
  const [logs, setLogs] = useState<GitLog[]>(initialLogs);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const operation = useRef(false);
  const activePath = useRef<string | null>(null);
  const generation = useRef(0);
  const openRequest = useRef(0);
  const addLog = useCallback((log: GitLog) => setLogs((prev) => mergeLog(prev, log)), []);

  const refresh = useCallback(async () => {
    const path = activePath.current;
    const version = generation.current;
    if (!path) return;
    try {
      const result = await invoke<RepositorySnapshot>('open_repository', { path });
      if (version === generation.current && path === activePath.current) {
        setRepository(result);
        return result;
      }
    } catch (error) {
      if (version === generation.current) setNotice(displayError(error));
    }
  }, []);

  useEffect(() => {
    if (!isDesktop()) return;
    let disposed = false;
    const cleanups: (() => void)[] = [];
    const subscribe = async () => {
      const results = await Promise.allSettled([
        listen<GitLog>('git:log', (e) => addLog(e.payload)),
        listen<{ path: string }>('repo:changed', (e) => {
          if (e.payload.path === activePath.current) void refresh();
        }),
      ]);
      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (disposed) result.value();
          else cleanups.push(result.value);
        } else if (!disposed) setNotice(`Unable to subscribe: ${displayError(result.reason)}`);
      }
    };
    void subscribe();
    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [addLog, refresh]);

  const open = useCallback(
    async (path: string) => {
      if (operation.current) return;
      const request = ++openRequest.current;
      setBusy(true);
      try {
        const result = await invoke<RepositorySnapshot>('open_repository', { path });
        if (request !== openRequest.current) return;
        generation.current++;
        activePath.current = result.path;
        setRepository(result);
        setDemo(false);
        setLogs((prev) => prev.filter((log) => log.operationId !== 'demo'));
        setNotice('');
        return result;
      } catch (error) {
        if (request === openRequest.current) {
          setNotice(displayError(error));
          record({
            kind: 'interface',
            label: 'Open repository failed',
            description: 'The repository could not be opened.',
            output: displayError(error),
            status: 'error',
          });
        }
      } finally {
        if (request === openRequest.current) setBusy(false);
      }
    },
    [record],
  );

  const activateDemo = () => {
    if (busy || operation.current) return false;
    generation.current++;
    openRequest.current++;
    activePath.current = null;
    setRepository(structuredClone(demoRepository));
    setDemo(true);
    setLogs(initialLogs);
    setNotice('');
    return true;
  };

  const stage = async (filePath: string, staged: boolean) => {
    if (busy || operation.current) return false;
    operation.current = true;
    setBusy(true);
    try {
      if (demo) {
        setRepository((prev) => ({
          ...prev,
          files: prev.files.map((file) =>
            file.path === filePath ? { ...file, staged: !staged } : file,
          ),
        }));
        addLog(
          demoLog([
            ['git', 'Git records changes to your project.'],
            [
              staged ? 'restore' : 'add',
              staged
                ? 'Restore a path from a saved version.'
                : 'Include this file in the next commit.',
            ],
            ...(staged
              ? [
                  [
                    '--staged',
                    'Remove this file from the next commit, keeping your working changes.',
                  ] as [string, string],
                ]
              : []),
            ['--', 'Treat the following value as a file path.'],
            [filePath, 'The file affected by this action.'],
          ]),
        );
      } else {
        await invoke(staged ? 'unstage_file' : 'stage_file', { path: repository.path, filePath });
        await refresh();
      }
      return true;
    } catch (error) {
      setNotice(displayError(error));
      record({
        kind: 'interface',
        label: staged ? 'Unstage failed' : 'Stage failed',
        description: 'The requested staging operation did not complete.',
        output: displayError(error),
        status: 'error',
        lessonId: 'stage',
      });
      return false;
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };

  const commit = async (message: string) => {
    if (
      busy ||
      operation.current ||
      !message.trim() ||
      (demo && !repository.files.some((file) => file.staged))
    )
      return false;
    operation.current = true;
    setBusy(true);
    try {
      if (demo) {
        const id = crypto.randomUUID().replaceAll('-', '');
        setRepository((prev) => ({
          ...prev,
          files: prev.files.filter((file) => !file.staged),
          commits: [
            {
              id,
              summary: message,
              author: 'You',
              timestamp: Math.floor(Date.now() / 1000),
              parents: prev.commits[0] ? [prev.commits[0].id] : [],
            },
            ...prev.commits,
          ],
          branches: prev.branches.map((b) => (b.current ? { ...b, target: id } : b)),
        }));
        addLog(
          demoLog([
            ['git', 'Git records the history of your project.'],
            ['commit', 'Save a snapshot of the staged changes.'],
            ['-m', 'Use the following text as the commit message.'],
            [JSON.stringify(message), 'Your description of what changed.'],
          ]),
        );
        setNotice('Demo commit saved. Your real files are unchanged.');
      } else {
        await invoke('commit_changes', { path: repository.path, message });
        await refresh();
      }
      return true;
    } catch (error) {
      setNotice(displayError(error));
      record({
        kind: 'interface',
        label: 'Commit failed',
        description: 'The requested local commit did not complete.',
        output: displayError(error),
        status: 'error',
        lessonId: 'commit',
      });
      return false;
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };

  const sync = async (action: 'fetch' | 'pull' | 'push') => {
    if (busy || operation.current) return false;
    operation.current = true;
    setBusy(true);
    try {
      if (demo) {
        addLog(
          demoLog([
            ['git', 'Git manages your project history.'],
            [
              action,
              {
                fetch: 'Download remote references without changing your files.',
                pull: 'Download changes and fast-forward when safe.',
                push: 'Upload your commits to the remote repository.',
              }[action],
            ],
            ['origin', 'The default remote repository.'],
          ]),
        );
        setNotice(`Demo ${action} complete. Open a local repository to use real Git.`);
      } else {
        await invoke(`${action}_repository`, { path: repository.path });
        await refresh();
        setNotice(`${action[0].toUpperCase()}${action.slice(1)} complete.`);
      }
      return true;
    } catch (error) {
      setNotice(displayError(error));
      record({
        kind: 'interface',
        label: `${action[0].toUpperCase()}${action.slice(1)} failed`,
        description:
          'The requested sync operation did not complete. Authentication can stop an operation before Git begins.',
        output: displayError(error),
        status: 'error',
        lessonId: 'sync',
      });
      return false;
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };
  return {
    repository,
    demo,
    logs,
    busy,
    notice,
    setNotice,
    open,
    refresh,
    stage,
    commit,
    sync,
    activateDemo,
  };
}
