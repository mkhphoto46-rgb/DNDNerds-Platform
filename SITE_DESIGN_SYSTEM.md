# D&D Nerds website design system

Canonical visual direction for website work: illustrated midnight guild hall, sapphire/cyan glass, restrained antique gold. References: owner's desktop and mobile blue D20 images supplied 2026-11-02. Runtime art comes from the read-only `assets/Optimized Image` folder.

All new theme selectors live under `.dnd-site-shell`. Core tokens: background `#061427`, panel `rgba(5,30,51,.9)`, cyan `#36c9da`, gold `#efc477`, text `#f7f5ef`, muted `#afc2d0`. Font: bundled Vazirmatn Variable, with English text isolated via bidi where needed. Cards 16–24px radius, fields at least 44px high, visible cyan keyboard focus. Gold primary actions; outlined cyan secondary actions. Semantic errors remain red and genuine active sessions may use green.

Use `SiteIcon`, `SiteNavigation`, `.site-panel`, `.site-primary`, `.site-secondary`. All six rail items stay visible, RTL: خانه، انجمن، میز بازی، بازارچه، آرنا، نقشه‌ساز. Existing quick table actions remain in the menu and table pages. Future routes retain truthful status labels.

Home: desktop three-column composition with central die/pedestal; mobile die/title followed by community and tables. Cards display real API data or clear loading/error/empty states. Never copy sample people or activity from mockups into runtime data.

Owner adjustments (2026-11-02): use the supplied finished D&D-emblem die; center the Home title horizontally; show the existing account XP/level; use «تاس سرنوشتت را تعیین می‌کند» and “Dice Will Decide Your Fate”; rotate the supplied halo in a 55-second loop; center header glyphs inside their circles. The compact menu contains five destinations: games, tools, account, support, feedback. Existing persistent chat launcher and top chat action both open the original social panel. Public navigation does not expose MFA setup; account security remains available as a capability.

Motion: transforms/opacity only, 180ms interactions, 5.5s subtle die float, slow optional halo. Stop decoration with reduced motion or document hidden. Decorative images never capture pointer events. Reserve rail and safe-area padding. Background images are decoration, all UI text remains HTML.

The VTT owns a separate application and visual system. Never apply this design system to its renderer, engine, voice or rules.
