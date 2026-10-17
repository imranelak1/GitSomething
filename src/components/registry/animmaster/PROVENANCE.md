# AnimMaster reference and original GitSomething components

The user requested [AnimMaster Lib](https://animmasterlib.dev/) alongside Motion, Skiper, and Vengeance for GitSomething's next design. Its public catalog was reviewed on 2026-10-16, particularly its mouse effects, SVG animation, and physics categories.

AnimMaster sells source packages delivered after purchase. Its [terms](https://animmasterlib.dev/terms) grant purchased components a non-transferable license and restrict redistribution. No licensed download was supplied, and no public package or free component registry was identified. Nothing in this directory copies or redistributes that source. The directory records the requested design reference; it is not an installed AnimMaster library.

`Magnetic.tsx` and `BranchBloom.tsx` are original GitSomething implementations using the open-source `motion` package. They apply the broad interaction ideas of responsive pointer springs and SVG path drawing to a Git workflow, rather than reproducing a catalog design. No paid Motion+ components are used.

- [Motion spring values](https://motion.dev/docs/react-use-spring)
- [Motion SVG drawing](https://motion.dev/docs/react-svg-animation)
- [Motion accessibility](https://motion.dev/docs/react-accessibility)
- [Motion repository and MIT license](https://github.com/motiondivision/motion)

Magnetic movement is bounded, mouse-only, and disabled while a child is focused, when disabled, and for reduced motion. The hit area stays stationary. BranchBloom is a conceptual onboarding illustration, not repository history or live progress. It draws once per explanatory phase, with no perpetual animation, and stays static for reduced motion.
