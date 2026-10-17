# Motion and animation sources

GitSomething uses [Motion for React](https://motion.dev/docs/react), imported from `motion/react`, for shared layout transitions, spring interactions, gesture feedback, SVG drawing, and presence. The package is open source under its [MIT license](https://github.com/motiondivision/motion/blob/main/LICENSE.md). No Motion+ source or subscription-only component is included.

The implementation follows Motion's documented [spring values](https://motion.dev/docs/react-use-spring), [SVG path drawing](https://motion.dev/docs/react-svg-animation), and [reduced-motion guidance](https://motion.dev/docs/react-accessibility). Changes in application state drive motion; animation does not mutate Git state or imply that an unsupported Git operation has run.

The requested [AnimMaster](https://animmasterlib.dev/) catalog provides the creative reference for more tactile pointer effects, drawing, and playful physics. As reviewed on 2026-10-16, component source is sold in downloadable packages rather than offered through a public registry. Its [terms](https://animmasterlib.dev/terms) require a purchase license and restrict redistribution. No licensed files were supplied, so the project includes original Motion implementations inspired by those broad categories, not copied or installed AnimMaster components. Their provenance is recorded in [the source directory](../src/components/registry/animmaster/PROVENANCE.md).

The existing attributed [Skiper TextRoll](../src/components/registry/skiper/PROVENANCE.md) and [Vengeance controls](../src/components/registry/vengeance/PROVENANCE.md) remain in use alongside the new Motion components.

Motion stays useful: selection follows focus, file transitions show staging, commit paths reveal relationships, and publishing animates only actual operation progress or an explicitly labeled practice preview. Keyboard access, native operation feedback, and reduced-motion equivalents remain available.
