import { useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  GitBranch,
  GitCommitHorizontal,
  GripVertical,
  Copy,
  Check,
  MoveVertical,
} from 'lucide-react';
import type { RepositorySnapshot } from '@/lib/types';
import { AnimatedTooltip } from '@/components/registry/vengeance/AnimatedTooltip';
import './history-motion.css';

export interface HistoryPlan {
  kind: 'squash' | 'rebase';
  source: string;
  target: string;
}

// Blue, slate and restrained branch colors stay legible on both dark graph surfaces.
export const graphColors = ['var(--ui-accent)', '#8b949e', '#7a9c86', '#a99abd', '#8ab6d9'];
const historyGraphColors = graphColors;

/** Keep each actual first-parent chain in its lane until it meets a known ancestor. */
export function buildCommitLanes(repository: RepositorySnapshot) {
  const lanes = new Map<string, number>();
  const commits = new Map(repository.commits.map((commit) => [commit.id, commit]));
  let nextLane = 0;
  function follow(start: string) {
    if (lanes.has(start) || !commits.has(start)) return;
    const lane = nextLane++;
    let id: string | undefined = start;
    while (id && commits.has(id) && !lanes.has(id)) {
      lanes.set(id, lane);
      id = commits.get(id)?.parents[0];
    }
  }
  follow(
    repository.branches.find((branch) => branch.current)?.target ?? repository.commits[0]?.id ?? '',
  );
  repository.branches.forEach((branch) => follow(branch.target));
  repository.commits.forEach((commit) => follow(commit.id));
  return lanes;
}

export function HistoryGraph({
  repository,
  onPlan,
}: {
  repository: RepositorySnapshot;
  onPlan: (plan: HistoryPlan) => void;
}) {
  const reducedMotion = useReducedMotion();
  const [selected, setSelected] = useState(repository.commits[0]?.id);
  const [copied, setCopied] = useState(false);
  const commits = repository.commits;
  const selectedCommit = commits.find((commit) => commit.id === selected) ?? commits[0];
  const lanes = buildCommitLanes(repository);
  const laneCount = Math.max(0, ...lanes.values()) + 1;
  const graphWidth = Math.max(130, 58 + laneCount * 29);
  const rowHeight = 82;
  const colorFor = (id: string) =>
    historyGraphColors[(lanes.get(id) ?? 0) % historyGraphColors.length];
  const style = {
    '--history-graph-width': `${graphWidth}px`,
    '--history-row-height': `${rowHeight}px`,
  } as CSSProperties;

  return (
    <div className="history-view history-cinematic" style={style}>
      <div className="history-intro">
        <div>
          <h2>The story so far.</h2>
          <p>Real commits. Every detour included.</p>
        </div>
        <div className="history-context">
          <span className="history-current-branch">
            <GitBranch size={14} />
            {repository.branch}
          </span>
          <span className="history-count">
            <GitCommitHorizontal size={15} />
            {commits.length} recent commits
          </span>
        </div>
      </div>
      {commits.length === 0 ? (
        <div className="history-empty">
          <GitCommitHorizontal size={30} />
          <h3>Your history starts here.</h3>
          <p>Make your first commit to start a line of your own.</p>
        </div>
      ) : (
        <>
          <div className="history-table">
            <div className="history-table-head">
              <span>Branches</span>
              <span>Commit</span>
              <span>Author</span>
              <span>When</span>
            </div>
            <div className="history-rows">
              <svg
                className="commit-connections"
                width={graphWidth}
                height={commits.length * rowHeight}
                aria-hidden="true"
              >
                {commits.map((commit, index) =>
                  commit.parents.map((parent, parentIndex) => {
                    const target = commits.findIndex((item) => item.id === parent);
                    // Off-screen ancestors never create invented connections to another visible commit.
                    if (target < 0) return null;
                    const x = 34 + (lanes.get(commit.id) ?? 0) * 29;
                    const targetX = 34 + (lanes.get(parent) ?? 0) * 29;
                    const y = index * rowHeight + rowHeight / 2;
                    const targetY = target * rowHeight + rowHeight / 2;
                    const bend = Math.min(Math.abs(targetY - y) / 2, 56);
                    return (
                      <motion.path
                        key={`${commit.id}-${parent}`}
                        d={`M ${x} ${y} C ${x} ${y + bend}, ${targetX} ${targetY - bend}, ${targetX} ${targetY}`}
                        fill="none"
                        stroke={parentIndex ? colorFor(parent) : colorFor(commit.id)}
                        strokeWidth={3}
                        strokeLinecap="round"
                        opacity={0.85}
                        initial={reducedMotion ? false : { pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{
                          duration: 0.85,
                          delay: Math.min(index, 8) * 0.045,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      />
                    );
                  }),
                )}
              </svg>
              {commits.map((commit, index) => {
                const isSelected = selectedCommit?.id === commit.id;
                const isHead = repository.branches.some(
                  (branch) => branch.current && branch.target === commit.id,
                );
                return (
                  <motion.div
                    key={commit.id}
                    className={`history-row ${isSelected ? 'selected' : ''}`}
                    style={{ '--commit-color': colorFor(commit.id) } as CSSProperties}
                    initial={reducedMotion ? false : { opacity: 0.4 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(index, 8) * 0.035, duration: 0.3 }}
                    drag="y"
                    dragSnapToOrigin
                    dragMomentum={false}
                    dragElastic={0.12}
                    whileDrag={{
                      zIndex: 4,
                      backgroundColor: '#e4eaff',
                      scale: reducedMotion ? 1 : 1.012,
                    }}
                    onDragEnd={(_, info) => {
                      if (Math.abs(info.offset.y) < 30) return;
                      const target =
                        commits[
                          Math.min(
                            commits.length - 1,
                            Math.max(0, index + Math.round(info.offset.y / rowHeight)),
                          )
                        ];
                      if (target.id !== commit.id)
                        onPlan({ kind: 'squash', source: commit.summary, target: target.summary });
                    }}
                    onClick={() => {
                      setSelected(commit.id);
                      setCopied(false);
                    }}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelected(commit.id);
                        setCopied(false);
                      }
                    }}
                    aria-label={`${commit.summary}, ${commit.id.slice(0, 7)}`}
                    aria-pressed={isSelected}
                  >
                    <div className="graph-node-cell">
                      <motion.span
                        className={`graph-node ${isHead ? 'graph-node-head' : ''}`}
                        style={{ left: 27 + (lanes.get(commit.id) ?? 0) * 29 }}
                        initial={reducedMotion ? false : { scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{
                          delay: Math.min(index, 8) * 0.055 + 0.1,
                          type: 'spring',
                          stiffness: 350,
                          damping: 24,
                        }}
                      >
                        {isSelected && (
                          <motion.span
                            className="history-selected-ring"
                            layoutId="selected-commit-ring"
                            transition={{
                              duration: reducedMotion ? 0 : 0.25,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                          />
                        )}
                      </motion.span>
                    </div>
                    <div className="commit-description">
                      <div className="commit-summary">
                        <span>{commit.summary}</span>
                        <GripVertical className="commit-grip" size={15} />
                      </div>
                      <div className="commit-ref-line">
                        <code>{commit.id.slice(0, 7)}</code>
                        {repository.branches
                          .filter((branch) => branch.target === commit.id)
                          .map((branch) => (
                            <motion.button
                              key={branch.name}
                              drag
                              dragSnapToOrigin
                              dragMomentum={false}
                              data-branch-name={branch.name}
                              onDragEnd={(_, info) => {
                                if (Math.hypot(info.offset.x, info.offset.y) < 20) return;
                                const target = Array.from(
                                  document.querySelectorAll<HTMLElement>('[data-branch-name]'),
                                ).find((element) => {
                                  if (element.dataset.branchName === branch.name) return false;
                                  const rect = element.getBoundingClientRect();
                                  return (
                                    info.point.x >= rect.left - 12 &&
                                    info.point.x <= rect.right + 12 &&
                                    info.point.y >= rect.top - 12 &&
                                    info.point.y <= rect.bottom + 12
                                  );
                                });
                                if (target?.dataset.branchName)
                                  onPlan({
                                    kind: 'rebase',
                                    source: branch.name,
                                    target: target.dataset.branchName,
                                  });
                              }}
                              className={`branch-ref ${branch.current ? 'current' : ''}`}
                              onClick={(event) => event.stopPropagation()}
                              aria-label={`${branch.name}${branch.current ? ', current branch' : ''}. Drag onto another branch to preview rebase.`}
                            >
                              <GitBranch size={11} />
                              {branch.name}
                              {branch.current && <span className="branch-head-label">HEAD</span>}
                            </motion.button>
                          ))}
                      </div>
                    </div>
                    <span className="commit-author">
                      <span
                        className={`avatar ${commit.author === 'Sam Chen' ? 'avatar-lilac' : ''}`}
                      >
                        {commit.author
                          .split(' ')
                          .map((word) => word[0])
                          .join('')
                          .slice(0, 2)}
                      </span>
                      {commit.author}
                    </span>
                    <span className="commit-time">{relativeTime(commit.timestamp)}</span>
                  </motion.div>
                );
              })}
            </div>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {selectedCommit && (
              <motion.div
                key={selectedCommit.id}
                className="commit-detail"
                initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                transition={{ duration: 0.22 }}
              >
                <GitCommitHorizontal size={22} />
                <div>
                  <strong>{selectedCommit.summary}</strong>
                  <span>
                    <code>{selectedCommit.id}</code>
                    <span>by {selectedCommit.author}</span>
                  </span>
                </div>
                <AnimatedTooltip
                  content={copied ? 'Copied to your clipboard.' : 'Copy this commit’s full hash.'}
                >
                  <button
                    className="button button-outline button-sm"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(selectedCommit.id)
                        .then(() => setCopied(true))
                        .catch(() => {});
                    }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy hash'}
                  </button>
                </AnimatedTooltip>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
      <div className="history-hint">
        <MoveVertical size={15} />
        <span>Drag commits to preview a squash. Drag branches to preview a rebase.</span>
        <span>Preview only</span>
      </div>
    </div>
  );
}

function relativeTime(timestamp: number) {
  const minutes = Math.max(0, Math.floor((Date.now() / 1000 - timestamp) / 60));
  return minutes < 60
    ? `${minutes}m ago`
    : minutes < 1440
      ? `${Math.floor(minutes / 60)}h ago`
      : `${Math.floor(minutes / 1440)}d ago`;
}
