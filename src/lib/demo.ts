import type { FileDiff, GitLog, RepositorySnapshot } from './types';

const now = Math.floor(Date.now() / 1000);
export const demoRepository: RepositorySnapshot = {
  path: '~/Projects/orbit',
  name: 'orbit',
  branch: 'feature/dropzone',
  guardian: null,
  files: [
    {
      path: 'src/components/Dropzone.tsx',
      status: 'modified',
      staged: false,
      additions: 24,
      deletions: 8,
    },
    {
      path: 'src/components/RepositoryCard.tsx',
      status: 'modified',
      staged: false,
      additions: 12,
      deletions: 3,
    },
    {
      path: 'src/hooks/useRepository.ts',
      status: 'new',
      staged: false,
      additions: 38,
      deletions: 0,
    },
    {
      path: 'src/styles/globals.css',
      status: 'modified',
      staged: false,
      additions: 6,
      deletions: 2,
    },
    { path: 'package.json', status: 'modified', staged: true, additions: 2, deletions: 1 },
    { path: 'README.md', status: 'modified', staged: true, additions: 8, deletions: 0 },
  ],
  commits: [
    {
      id: 'b82f0ae48987103a',
      summary: 'Make room for the next big idea',
      author: 'Alex Morgan',
      timestamp: now - 960,
      parents: ['f9e31c284646d6ce'],
    },
    {
      id: 'f9e31c284646d6ce',
      summary: 'Add drag and drop repository setup',
      author: 'Alex Morgan',
      timestamp: now - 3600,
      parents: ['b7c2e18a494c4359'],
    },
    {
      id: 'a13d8094937b523a',
      summary: 'Refine the empty state',
      author: 'Sam Chen',
      timestamp: now - 7200,
      parents: ['b7c2e18a494c4359'],
    },
    {
      id: 'b7c2e18a494c4359',
      summary: 'Merge pull request #24 from fix/keyboard-focus',
      author: 'Alex Morgan',
      timestamp: now - 15000,
      parents: ['d4f9c20aaf0cf894', 'c2d840aee6883f29'],
    },
    {
      id: 'c2d840aee6883f29',
      summary: 'Keep keyboard focus where it belongs',
      author: 'Sam Chen',
      timestamp: now - 21000,
      parents: ['d4f9c20aaf0cf894'],
    },
    {
      id: 'd4f9c20aaf0cf894',
      summary: 'Introduce the command palette',
      author: 'Alex Morgan',
      timestamp: now - 86400,
      parents: ['e82b41a028883c91'],
    },
    {
      id: 'e82b41a028883c91',
      summary: 'A quieter place to build',
      author: 'Alex Morgan',
      timestamp: now - 172800,
      parents: [],
    },
  ],
  branches: [
    { name: 'feature/dropzone', current: true, target: 'b82f0ae48987103a' },
    { name: 'main', current: false, target: 'b7c2e18a494c4359' },
    { name: 'fix/empty-state', current: false, target: 'a13d8094937b523a' },
  ],
};

const original = `import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { createRepository } from '@/lib/github';

interface DropzoneProps {
  onComplete: (url: string) => void;
}

export function Dropzone({ onComplete }: DropzoneProps) {
  const [path, setPath] = useState('');

  async function handleCreate() {
    const repository = await createRepository(path);
    onComplete(repository.url);
  }

  return (
    <div className="dropzone">
      <FolderOpen size={24} />
      <h2>Choose a folder</h2>
      <input value={path} onChange={e => setPath(e.target.value)} />
      <button onClick={handleCreate}>Create repository</button>
    </div>
  );
}
`;
const modified = `import { useState } from 'react';
import { motion } from 'framer-motion';
import { FolderOpen, ArrowUpRight } from 'lucide-react';
import { createRepository } from '@/lib/github';

interface DropzoneProps {
  onComplete: (url: string) => void;
}

export function Dropzone({ onComplete }: DropzoneProps) {
  const [path, setPath] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreate() {
    setIsCreating(true);
    try {
      const repository = await createRepository(path);
      onComplete(repository.url);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <motion.div className="dropzone" whileHover={{ scale: 1.01 }}>
      <FolderOpen size={24} strokeWidth={1.5} />
      <h2>From a folder to your next big thing.</h2>
      <p>Drop your project. We'll take it from here.</p>
      <input value={path} onChange={e => setPath(e.target.value)} />
      <button onClick={handleCreate} disabled={isCreating}>
        {isCreating ? 'Creating…' : 'Create & push'}
        <ArrowUpRight size={16} />
      </button>
    </motion.div>
  );
}
`;
export function demoDiff(path: string): FileDiff {
  if (path.endsWith('Dropzone.tsx')) return { original, modified, language: 'typescript' };
  if (path.endsWith('.json'))
    return {
      original: '{\n  "name": "orbit",\n  "version": "0.1.0"\n}',
      modified: '{\n  "name": "orbit",\n  "version": "0.2.0",\n  "private": true\n}',
      language: 'json',
    };
  if (path.endsWith('.md'))
    return {
      original: '# Orbit\n\nA small place for big ideas.\n',
      modified:
        '# Orbit\n\nA small place for big ideas.\n\n## Getting started\n\nInstall dependencies and start your local workspace.\n\n```sh\nnpm install\nnpm run dev\n```\n',
      language: 'markdown',
    };
  if (path.endsWith('.css'))
    return {
      original: ':root {\n  --surface: #151619;\n  --radius: 6px;\n}\n',
      modified:
        ':root {\n  --surface: #17181c;\n  --radius: 8px;\n  --accent: #b8f2c9;\n}\n\n::selection { background: #b8f2c930; }\n',
      language: 'css',
    };
  return {
    original: '',
    modified: `// ${path}\nimport { useState } from 'react';\n\nexport function useRepository() {\n  const [isReady, setIsReady] = useState(false);\n  return { isReady, setIsReady };\n}\n`,
    language: 'typescript',
  };
}
export function demoLog(words: [string, string][]): GitLog {
  return {
    id: crypto.randomUUID(),
    operationId: 'demo',
    status: 'success',
    timestamp: Date.now(),
    tokens: words.map(([text, explanation]) => ({ text, explanation })),
  };
}
export const initialLogs: GitLog[] = [
  demoLog([
    ['git', 'Git records the history of your project.'],
    ['switch', 'Move to another branch.'],
    ['feature/dropzone', 'The branch you are currently working on.'],
  ]),
  demoLog([
    ['git', 'Git records the history of your project.'],
    ['status', 'See what has changed in your project.'],
    ['--short', 'Show a compact list of changed files.'],
  ]),
  demoLog([
    ['git', 'Git records the history of your project.'],
    ['diff', 'Compare changes that have not been staged.'],
    ['--', 'Treat everything after this as a file path.'],
    ['src/components/Dropzone.tsx', 'Only show changes in this file.'],
  ]),
];
