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
│   └── globals.css      Tailwind v4 theme (shared color/spacing tokens with the mobile apps)
└── public/               Logo, screenshots
```

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
