# AyuLink Website

A static marketing/information site for AyuLink — **not** one of the
four apps, and not a web version of them either. It explains what
AyuLink is and links out to the mobile apps; it has no login, no
dashboards, and makes no calls to Supabase, Neo4j, or anything else.

```
frontend/web/
├── src/app/
│   ├── layout.tsx      Root layout — fonts, metadata, no providers
│   ├── page.tsx         The entire site (single page, anchor-linked sections)
│   └── globals.css      Tailwind v4 theme + the glassmorphism design system
└── public/               Logo, screenshots
```

Live at **<https://ayulink-web.onrender.com>** (Render Static Site).

## Design system

The site uses a glassmorphism surface language. Two things are worth
knowing before editing it:

- **Frosted panels need something behind them.** A fixed layer of three
  slow-drifting brand-colour orbs (`.backdrop-orbs`) plus a fine grain
  (`.backdrop-grain`) is what the `backdrop-filter` on `.glass` actually
  samples. On a flat background the same CSS just looks like a washed-out
  box, so do not remove that layer while keeping the panels.
- **Contrast survived the redesign.** Body copy sits on high-opacity
  panels (`.glass-strong`) in `--color-primary-dark` (6.91:1 on white).
  The bright lime `--color-primary-action` measured 3.29:1 as text and is
  reserved for fills and shapes that carry no text — the same rule the
  mobile apps follow.

There is a `@supports not (backdrop-filter)` fallback to near-solid
surfaces, and `prefers-reduced-motion` stops the orb drift entirely.

Scroll reveals are armed by JavaScript at runtime, never in the
stylesheet, plus a 2.5s failsafe that clears the hidden state
unconditionally — so a browser that never runs the script, or an
observer that never fires, shows everything rather than a blank page.

## Run

```bash
cd frontend/web
npm install
npm run dev     # http://localhost:3000
```

No `.env` needed — this site doesn't call any backend.

## Updating the "Get the app" section

Each app's card in `page.tsx` (`apps` array) currently shows "Coming
Soon" store badges instead of real App Store / Google Play links, since
none of the four apps are published yet. Once one is, replace that
app's two `<span>` badges with real `<a href="...">` links to its store
listing.
