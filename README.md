# Marketing Schedule Tracker (Next.js)

This is a preconfigured Next.js 14 application that bundles a single-file marketing scheduler into a ready-to‑deploy site. It uses Tailwind CSS for styling and includes a handful of light‑weight UI primitives (Card, Button, Badge, Input and Progress) reimplemented from the shadcn/ui library.

## Developing locally

```bash
pnpm install  # or npm install
pnpm run dev  # starts the dev server on http://localhost:3000
```

## Deployment

Deploy on Vercel by pushing this repository to GitHub and selecting **Next.js** as the framework. There are no environment variables required; the Google Sheet URL is hard‑coded in `app/MarketingTracker.tsx` as `FIXED_SHEET_URL`.
