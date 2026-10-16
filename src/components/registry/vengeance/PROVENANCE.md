# Vengeance UI source integrations

Upstream: https://github.com/Ashutoshx7/VengeanceUI

Source references, inspected October 16, 2026:

- https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/components/ui/tooltip.tsx
- https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/components/ui/animated-tooltip.tsx
- https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/components/ui/animated-button.tsx
- https://github.com/Ashutoshx7/VengeanceUI/blob/main/LICENSE

`AnimatedTooltip.tsx` adapts the upstream Radix tooltip composition and the animated tooltip's Framer Motion ease-out transition. It replaces the marketing bubble variants with compact command explanations, adds collision-safe portal positioning and reduced-motion support, and uses this application's CSS tokens. It is an adaptation, not an unmodified registry installation. The upstream MIT notice is preserved in `LICENSE`.

Vengeance UI is distributed as source through a shadcn registry, not as a runtime npm dependency.

`AnimatedButton.tsx` adapts the actual upstream AnimatedButton's spring interaction, animated text mask, and animated border shine. It uses strict motion props, preserves native button semantics, supplies reduced-motion behavior, and runs shine on pointer/focus interaction rather than a perpetual timer. It powers the shared primary Button and the publish flow's primary CTA.
