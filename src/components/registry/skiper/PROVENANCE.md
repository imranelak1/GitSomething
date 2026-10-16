# Skiper UI source integration

TextRoll is adapted from **Skiper UI**, created by **gxuri**.

- Component documentation: https://skiper-ui.com/v1/skiper58
- Actual source registry: https://skiper-ui.com/r/skiper58.json
- Author: https://x.com/Gur__vi
- License and usage terms inspected October 16, 2026: https://skiper-ui.com/v1/skiper58

The component's documentation explicitly permits free use and modification in personal and commercial projects, with attribution to Skiper UI required for the free version. Branchline includes source attribution here, in the component, and in its in-app design credits. This integration uses the free component, without any paid source.

`TextRoll.tsx` retains the upstream duplicate text layers, individual character variants, stagger, centered-delay option, and hover roll. Adaptations replace block `div` children with valid inline markup, preserve spaces, provide a single accessible text label, support keyboard focus and reduced motion, and tune timing for a desktop interface.

`KineticModal.tsx` remains original Radix Dialog/Framer Motion composition, and now uses the actual Skiper UI TextRoll for its heading.
