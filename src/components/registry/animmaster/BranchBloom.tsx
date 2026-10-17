import { motion, useReducedMotion } from 'motion/react';

type Phase = 'edit' | 'commit' | 'share';

const colors = {
  outline: 'var(--ui-canvas)',
  primary: 'var(--ui-accent-fill)',
  petal: '#79c0ff',
  document: '#8b949e',
  cloud: '#6e7681',
  check: 'var(--ui-accent-ink)',
  label: 'var(--ui-text)',
  guide: 'var(--ui-subtle)',
};

/** Original conceptual illustration; never represents repository history or live progress. */
export function BranchBloom({ phase = 'edit', className }: { phase?: Phase; className?: string }) {
  const reduced = useReducedMotion();
  const current = ['edit', 'commit', 'share'].indexOf(phase);
  const duration = reduced ? 0 : 0.65;

  return (
    <svg
      viewBox="0 0 420 220"
      width="100%"
      className={className}
      aria-hidden="true"
      focusable="false"
      data-motion="branch-bloom"
      data-phase={phase}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <path
        d="M52 173H365"
        stroke={colors.guide}
        strokeOpacity="0.12"
        strokeWidth="1.5"
        strokeDasharray="3 7"
      />
      <motion.path
        key={`stem-${phase}`}
        d="M93 127C93 166 136 171 164 145S186 114 210 114S241 141 267 142S310 129 326 102"
        fill="none"
        stroke={colors.primary}
        strokeWidth="5"
        strokeLinecap="round"
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: duration + (reduced ? 0 : 0.2), ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.path
        d="M211 114C191 82 173 75 166 54C156 26 194 20 205 45L211 62L217 45C228 20 266 26 256 54C249 75 231 82 211 114Z"
        fill={colors.petal}
        stroke={colors.outline}
        strokeWidth="2"
        initial={reduced ? false : { scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, rotate: reduced ? 0 : current === 1 ? 4 : 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 20, delay: reduced ? 0 : 0.1 }}
        style={{ transformOrigin: '211px 114px' }}
      />
      <motion.path
        d="M211 114C224 93 251 74 271 79C293 85 279 110 259 112L211 114Z"
        fill={colors.cloud}
        stroke={colors.outline}
        strokeWidth="2"
        initial={reduced ? false : { scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 20, delay: reduced ? 0 : 0.2 }}
        style={{ transformOrigin: '211px 114px' }}
      />
      <path
        d="M211 114C197 98 180 92 158 97C141 101 151 121 169 118L211 114Z"
        fill={colors.document}
        stroke={colors.outline}
        strokeWidth="2"
      />
      <g transform="translate(55 72)">
        <motion.g
          initial={reduced ? false : { y: 8, rotate: -6, opacity: 0 }}
          animate={{ y: 0, rotate: reduced ? 0 : current === 0 ? -6 : -3, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 23 }}
          style={{ transformOrigin: '35px 35px' }}
        >
          <rect x="3" y="7" width="70" height="68" rx="10" fill={colors.outline} />
          <rect
            width="70"
            height="68"
            rx="10"
            fill={colors.document}
            stroke={colors.outline}
            strokeWidth="2"
          />
          <path
            d="M17 23H52M17 33H42M17 43H47"
            stroke={colors.outline}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M50 54L55 59L64 48"
            fill="none"
            stroke={colors.outline}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.g>
      </g>
      <motion.circle
        cx="211"
        cy="114"
        r="18"
        fill={colors.primary}
        stroke={colors.outline}
        strokeWidth="2"
        initial={reduced ? false : { scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 18, delay: reduced ? 0 : 0.25 }}
        style={{ transformOrigin: '211px 114px' }}
      />
      <motion.path
        key={`check-${phase}`}
        d="M202 114L208 120L220 108"
        fill="none"
        stroke={colors.check}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduced ? 0 : 0.3, delay: reduced ? 0 : 0.5 }}
      />
      <g transform="translate(293 52)">
        <motion.g
          initial={reduced ? false : { y: 9, rotate: 5, opacity: 0 }}
          animate={{ y: 0, rotate: reduced ? 0 : current === 2 ? 5 : 2, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 23, delay: reduced ? 0 : 0.1 }}
          style={{ transformOrigin: '36px 36px' }}
        >
          <rect x="3" y="7" width="72" height="72" rx="18" fill={colors.outline} />
          <rect
            width="72"
            height="72"
            rx="18"
            fill={colors.cloud}
            stroke={colors.outline}
            strokeWidth="2"
          />
          <path
            d="M24 48H20C5 46 12 25 25 29C26 11 51 14 51 30C67 25 69 48 54 48H47"
            fill="none"
            stroke={colors.outline}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M36 54V34M28 42L36 34L44 42"
            fill="none"
            stroke={colors.outline}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.g>
      </g>
      <g
        fill={colors.label}
        textAnchor="middle"
        fontFamily="inherit"
        fontSize="12"
        fontWeight="700"
      >
        <text x="92" y="197" opacity={current === 0 ? 1 : 0.65}>
          01 · pick files
        </text>
        <text x="211" y="197" opacity={current === 1 ? 1 : 0.65}>
          02 · save
        </text>
        <text x="329" y="197" opacity={current === 2 ? 1 : 0.65}>
          03 · share
        </text>
      </g>
      <motion.path
        d="M280 37L283 27M290 44L300 41"
        stroke={colors.primary}
        strokeWidth="3"
        strokeLinecap="round"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration, delay: reduced ? 0 : 0.4 }}
      />
    </svg>
  );
}
