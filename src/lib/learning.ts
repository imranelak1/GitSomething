export type LessonId = 'stage' | 'commit' | 'sync' | 'branch' | 'diff' | 'safety';

export interface LearningLesson {
  id: LessonId;
  title: string;
  explanation: string;
  command: string;
  tip: string;
}

export const LEARNING_LESSONS: LearningLesson[] = [
  {
    id: 'stage',
    title: 'Choose what goes in',
    explanation:
      'Staging selects the current version of a file for your next commit. You can keep editing without saving every edit together.',
    command: 'git add -- "src/App.tsx"',
    tip: 'Unstage removes a file from that selection. Your edits stay on your computer.',
  },
  {
    id: 'commit',
    title: 'Save a local checkpoint',
    explanation:
      'A commit saves the staged changes with a message. It lives in this repository on your computer until you push it.',
    command: 'git commit -m "Describe what changed"',
    tip: 'Read the staged diff first. A useful message describes the result of your change.',
  },
  {
    id: 'sync',
    title: 'Bring your work together',
    explanation:
      'Fetch checks for remote commits. Pull brings compatible commits into your branch. Push uploads your local commits.',
    command: 'git fetch origin',
    tip: 'GitSomething pulls with --ff-only. If histories diverge, it stops instead of silently merging or rewriting them.',
  },
  {
    id: 'branch',
    title: 'Follow a line of work',
    explanation:
      'A branch names a line of commits. The current branch moves forward when you commit; other branches stay where they are.',
    command: 'git branch',
    tip: 'The star marks your current branch. Viewing a branch in the graph does not switch your working files.',
  },
  {
    id: 'diff',
    title: 'Read what changed',
    explanation:
      'A diff compares two versions. Removed lines start with a minus; added lines start with a plus. Unstaged changes compare your files with the staging area.',
    command: 'git diff --staged',
    tip: '--staged compares your selection with the last commit, so you can see exactly what the next commit will save.',
  },
  {
    id: 'safety',
    title: 'Know before you run',
    explanation:
      'This terminal accepts a small set of Git commands and runs them through GitSomething’s Git engine. It never starts a shell.',
    command: 'help',
    tip: 'Reset, force push, command chains, and scripts are unavailable here. Use help to see the supported commands.',
  },
];

export function getLesson(id?: string): LearningLesson {
  return LEARNING_LESSONS.find((lesson) => lesson.id === id) ?? LEARNING_LESSONS[5];
}
