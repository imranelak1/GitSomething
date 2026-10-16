import { useState } from 'react';
import { motion } from 'framer-motion';
import { GitBranch, GitCommitHorizontal, GripVertical, ArrowUpRight } from 'lucide-react';
import type { RepositorySnapshot } from '@/lib/types';

export interface HistoryPlan {
  kind: 'squash' | 'rebase';
  source: string;
  target: string;
}
export function HistoryGraph({
  repository,
  onPlan,
}: {
  repository: RepositorySnapshot;
  onPlan: (plan: HistoryPlan) => void;
}) {
  const [selected, setSelected] = useState(repository.commits[0]?.id);
  const commits = repository.commits;
  const selectedCommit = commits.find((commit) => commit.id === selected);
  const lanes = new Map<string, number>();
  let nextLane = 0;
  commits.forEach((commit) => {
    if (!lanes.has(commit.id)) lanes.set(commit.id, nextLane++ % 3);
    commit.parents.forEach((parent, i) => {
      if (!lanes.has(parent)) lanes.set(parent, i === 0 ? lanes.get(commit.id)! : nextLane++ % 3);
    });
  });
  const colors = ['#b8f2c9', '#c5afff', '#d9b58d'];
  return (
    <div className="history-view">
      <div className="history-intro">
        <div>
          <h2>A clear line of thought.</h2>
          <p>Every change, and how it all connects.</p>
        </div>
        <span className="history-count">
          <GitCommitHorizontal size={15} /> {commits.length} recent commits
        </span>
      </div>
      <div className="history-table">
        <div className="history-table-head">
          <span>Graph</span>
          <span>Commit</span>
          <span>Author</span>
          <span>When</span>
        </div>
        <div className="history-rows">
          <svg
            className="commit-connections"
            width="106"
            height={Math.max(commits.length * 66, 1)}
            aria-hidden="true"
          >
            {commits.map((commit, index) =>
              commit.parents.map((parent) => {
                const target = commits.findIndex((c) => c.id === parent);
                if (target < 0) return null;
                const x = 29 + (lanes.get(commit.id) || 0) * 23,
                  targetX = 29 + (lanes.get(parent) || 0) * 23;
                return (
                  <motion.path
                    key={`${commit.id}-${parent}`}
                    d={`M ${x} ${index * 66 + 33} C ${x} ${index * 66 + 66}, ${targetX} ${target * 66}, ${targetX} ${target * 66 + 33}`}
                    fill="none"
                    stroke={colors[lanes.get(commit.id) || 0]}
                    strokeWidth="1.5"
                    opacity=".6"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.8 }}
                  />
                );
              }),
            )}
          </svg>
          {commits.map((commit, index) => (
            <motion.div
              key={commit.id}
              className={`history-row ${selected === commit.id ? 'selected' : ''}`}
              drag="y"
              dragSnapToOrigin
              dragMomentum={false}
              dragElastic={0.14}
              onDragEnd={(_, info) => {
                if (Math.abs(info.offset.y) < 30) return;
                const target =
                  commits[
                    Math.min(
                      commits.length - 1,
                      Math.max(0, index + Math.round(info.offset.y / 66)),
                    )
                  ];
                if (target.id !== commit.id)
                  onPlan({ kind: 'squash', source: commit.summary, target: target.summary });
              }}
              onClick={() => setSelected(commit.id)}
              tabIndex={0}
              role="button"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelected(commit.id);
                }
              }}
              aria-label={`${commit.summary}, ${commit.id.slice(0, 7)}`}
            >
              <div className="graph-node-cell">
                <span
                  className="graph-node"
                  style={{
                    left: 23 + (lanes.get(commit.id) || 0) * 23,
                    borderColor: colors[lanes.get(commit.id) || 0],
                  }}
                />
              </div>
              <div className="commit-description">
                <div className="commit-summary">
                  <span>{commit.summary}</span>
                  <GripVertical className="commit-grip" size={14} />
                </div>
                <div className="commit-ref-line">
                  <code>{commit.id.slice(0, 7)}</code>
                  {repository.branches
                    .filter((b) => b.target === commit.id)
                    .map((branch) => (
                      <motion.button
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
                        key={branch.name}
                        className={`branch-ref ${branch.current ? 'current' : ''}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GitBranch size={11} />
                        {branch.name}
                      </motion.button>
                    ))}
                </div>
              </div>
              <span className="commit-author">
                <span className={`avatar ${commit.author === 'Sam Chen' ? 'avatar-lilac' : ''}`}>
                  {commit.author
                    .split(' ')
                    .map((s) => s[0])
                    .join('')
                    .slice(0, 2)}
                </span>
                {commit.author}
              </span>
              <span className="commit-time">{relativeTime(commit.timestamp)}</span>
            </motion.div>
          ))}
        </div>
      </div>
      {selectedCommit && (
        <div className="commit-detail">
          <GitCommitHorizontal size={18} />
          <div>
            <strong>{selectedCommit.summary}</strong>
            <span>
              <code>{selectedCommit.id}</code> by {selectedCommit.author}
            </span>
          </div>
          <button
            className="button button-outline button-sm"
            onClick={() => navigator.clipboard.writeText(selectedCommit.id).catch(() => {})}
          >
            Copy hash
            <ArrowUpRight size={12} />
          </button>
        </div>
      )}
      <div className="history-hint">
        <GripVertical size={14} />
        Drag a commit or branch to preview a history change.
        <span>History editing is a planned milestone.</span>
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
