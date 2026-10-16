import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, GitBranch, GitCommitHorizontal } from 'lucide-react';
import type { RepositorySnapshot } from '@/lib/types';
import { AnimatedTooltip } from '@/components/registry/vengeance/AnimatedTooltip';
import { buildCommitLanes, graphColors } from '@/components/HistoryGraph';
import './history-motion.css';

/** A real Git graph: every connection comes from a visible commit's parent IDs. */
export function BranchJourney({
  repository,
  onViewHistory,
}: {
  repository: RepositorySnapshot;
  onViewHistory: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const visible = repository.commits.slice(0, 5).reverse();
  const lanes = buildCommitLanes(repository);
  const visibleLanes = [...new Set(visible.map((commit) => lanes.get(commit.id) ?? 0))].sort(
    (a, b) => a - b,
  );
  const laneY = (lane: number) =>
    53 + visibleLanes.indexOf(lane) * Math.min(16, 26 / Math.max(1, visibleLanes.length - 1));
  const nodeX = (index: number) =>
    visible.length === 1 ? 370 : 46 + index * (588 / Math.max(1, visible.length - 1));
  const colorFor = (id: string) => graphColors[(lanes.get(id) ?? 0) % graphColors.length];

  return (
    <section className="journey-strip" aria-label="Recent commit graph">
      <div className="journey-map">
        {visible.length ? (
          <>
            <svg
              className="journey-lines"
              viewBox="0 0 680 112"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {visible.map((commit, index) =>
                commit.parents.map((parent) => {
                  const parentIndex = visible.findIndex((candidate) => candidate.id === parent);
                  if (parentIndex === -1) return null;
                  const x = nodeX(index),
                    parentX = nodeX(parentIndex);
                  const y = laneY(lanes.get(commit.id) ?? 0),
                    parentY = laneY(lanes.get(parent) ?? 0);
                  return (
                    <motion.path
                      key={`${commit.id}-${parent}`}
                      d={`M ${parentX} ${parentY} C ${parentX + (x - parentX) * 0.5} ${parentY}, ${x - (x - parentX) * 0.5} ${y}, ${x} ${y}`}
                      fill="none"
                      stroke={colorFor(commit.id)}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      initial={reducedMotion ? false : { pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.95, delay: index * 0.055, ease: [0.16, 1, 0.3, 1] }}
                    />
                  );
                }),
              )}
            </svg>
            {visible.map((commit, index) => {
              const branches = repository.branches.filter((branch) => branch.target === commit.id);
              const newest = index === visible.length - 1;
              const isHead = branches.some((branch) => branch.current);
              return (
                <div
                  key={commit.id}
                  className={`journey-position ${isHead ? 'journey-position-current' : ''} ${newest ? 'journey-position-last' : ''} ${index === 0 ? 'journey-position-first' : ''}`}
                  style={{
                    left: `${nodeX(index) / 6.8}%`,
                    top: `${laneY(lanes.get(commit.id) ?? 0)}px`,
                    color: colorFor(commit.id),
                  }}
                >
                  {branches.length > 0 && (
                    <motion.button
                      className="journey-branch"
                      style={{ x: newest ? '-90%' : index === 0 ? '-10%' : '-50%' }}
                      onClick={onViewHistory}
                      initial={reducedMotion ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 + index * 0.06 }}
                      whileHover={reducedMotion ? {} : { y: -2, rotate: newest ? -2 : 1 }}
                      aria-label={`View ${branches.map((branch) => branch.name).join(', ')} in history`}
                    >
                      <GitBranch size={12} />
                      <span>
                        {branches.find((branch) => branch.current)?.name ?? branches[0].name}
                      </span>
                    </motion.button>
                  )}
                  <AnimatedTooltip
                    content={
                      <span>
                        <strong>{commit.summary}</strong>
                        <br />
                        <span>
                          {commit.author} · {commit.id.slice(0, 7)}
                        </span>
                      </span>
                    }
                    side="bottom"
                  >
                    <motion.button
                      className="journey-node"
                      onClick={onViewHistory}
                      aria-label={`View commit: ${commit.summary}`}
                      initial={reducedMotion ? false : { scale: 0.5 }}
                      animate={{ scale: 1 }}
                      transition={{
                        delay: index * 0.07,
                        type: 'spring',
                        stiffness: 400,
                        damping: 25,
                      }}
                      whileHover={reducedMotion ? {} : { scale: 1.35 }}
                      whileTap={reducedMotion ? {} : { scale: 0.9 }}
                    >
                      {isHead && (
                        <motion.span
                          className="journey-node-ring"
                          initial={reducedMotion ? false : { scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: 0.4, duration: 0.5 }}
                        />
                      )}
                    </motion.button>
                  </AnimatedTooltip>
                  <code className="journey-hash">{commit.id.slice(0, 7)}</code>
                </div>
              );
            })}
          </>
        ) : (
          <div className="journey-empty">
            <GitCommitHorizontal size={20} />
            <span>No commits yet · ready for your first idea</span>
          </div>
        )}
      </div>
      <motion.button
        className="journey-open"
        onClick={onViewHistory}
        aria-label="Explore commit history"
        whileHover={reducedMotion ? {} : 'hover'}
      >
        <span>
          The full
          <br />
          story
        </span>
        <motion.span className="journey-open-arrow" variants={{ hover: { x: 2, y: -2 } }}>
          <ArrowUpRight size={18} />
        </motion.span>
      </motion.button>
    </section>
  );
}
