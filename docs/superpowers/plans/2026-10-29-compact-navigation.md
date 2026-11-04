# Compact navigation follow-up

User explicitly requested four short categories after reviewing screenshots of the first deployed menu. No additional design confirmation requested.

- Main menu: Games /games, Tools /tools, Store /store, Account /account. Four direct links, no nested account control, no menu scroll.
- Games page: four destinations for own tables, discovery/DMs, creation and invitation, plus Arena access. Game subpages have a short breadcrumb rather than repeated section tabs.
- Tools page: cartography, blacksmith, learning and news.
- Account groups: profile/characters/DM/public page; security and logout; orders/subscription/seller access. Login and registration remain available to guests.
- Instagram moved to footer, chat launcher localized, menu made opaque, header layering raised above XP, compact mobile guide/music/chat controls preserved.
- Production build/typecheck passed. Local browser at 320x568 verified four links, zero nested menus and no menu overflow (bottom292px). Independent review found XP-layer ordering and old chat pseudo-label; both fixed.

Deployment scope: web only, preserving API migration0029 and current VTT. Previous live web build kBtKC3gXKb1Dz5aN4JLE7 is guarded and backed up by ops/deploy-play-genre-web.sh. Initial full release2866d2d deployed successfully with DB snapshot /opt/dndnerds/backups/20261028T212642Z and code backup /opt/dndnerds/backups/play-profiles-20261028T212640Z. Authenticated profile, table card and campaign form were read successfully from live backend without changing account data.
