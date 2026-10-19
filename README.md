# The Tentact — Next.js

The Tentact marketing site (landing page and Terms & Conditions), ported from the static HTML in
`../Tentact-UI/` to Next.js (App Router, TypeScript). The original HTML is left untouched; this app
reproduces it section by section, with the same visuals, copy and motion.

## Scripts

| Command             | What it does                                 |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Start the dev server on http://localhost:3000 |
| `npm run build`     | Production build (both pages are static)      |
| `npm start`         | Serve the production build                    |
| `npm run lint`      | ESLint (Next core-web-vitals + TypeScript)    |
| `npm run typecheck` | `tsc --noEmit`                                |

`dev` and `build` use webpack (`--webpack`) on purpose. Turbopack ignores `adjustFontFallback: false`
in `next/font` and always inserts an Arial fallback face. That changes how glyphs Geist doesn't have
(→ ✓ ✦ ★) render compared with the original design, which falls back to the system UI font.

## Structure

```
src/
├── app/                      Routes, root layout (fonts, metadata), global CSS
│   ├── page.tsx              → features/home/HomePage
│   └── terms/page.tsx        → features/terms/TermsPage
├── config/site.ts            Brand copy, contact email, demo URL, routes
├── components/               Shared UI: ButtonLink, Reveal, FitFrame, BrandMark
├── hooks/                    React hooks (scroll reveal, fit-to-viewport, tilt, element refs…)
├── lib/                      Framework-free helpers: math, motion presets, observers,
│                             animation loop, Disposer, pointer parallax
├── providers/                SmoothScrollProvider (Lenis), MotionGate
└── features/
    ├── home/
    │   ├── HomePage.tsx      Section order
    │   ├── components/       SiteHeader, SiteFooter
    │   ├── data/             Navigation links
    │   └── sections/<name>/  One folder per section (see below)
    └── terms/                Terms page, its content (terms.data.tsx) and small client widgets
```

### Anatomy of a section

Each landing-page section lives in `features/home/sections/<name>/`:

- `<name>.data.ts(x)`: the content (cards, copy, coordinates). Edit copy here, not in JSX.
- `<Name>Section.tsx`: the view. Renders markup and collects element refs.
- `<name>.scene.ts`: the animation controller, a plain class used as
  `new Scene(elements)` → `start()` → `dispose()`. It owns render loops, observers and
  listeners, and registers every one of them on a `Disposer` so unmounting cleans up completely.
- `<Name>Section.module.css`: styles scoped to the section.

Animations write styles directly to DOM nodes every frame rather than going through React state,
so scrolling and pointer movement never re-render components. User-driven state (menu, legend
filter, sealed price reveal, prompt slider) stays in React.

The reach map is split between server and client. `reach.model.server.ts` projects the world
atlas and route curves at build time, so the browser receives finished SVG paths and never
downloads d3 or the atlas.

## Notes carried over from the original

- **Hero globe pins stay hidden.** In the original page the intro animation never shows them (the CSS
  `scale: 0` and the animated `transform: scale()` multiply to zero). This port keeps that behaviour.
  See `HeroScene.hideIntroElements` for the one-line change that makes them pop in.
- The Terms page still has a `[city]` placeholder in "Governing law".
