# pilates-evi

Pilates studio management app — SvelteKit 2 / Svelte 5, Supabase, Tailwind 4 + shadcn-svelte.

## Developing

```sh
npm install
cp .env.example .env   # fill in the Supabase keys
npm run dev
```

`npm run check` type-checks, `npm run lint` runs Prettier, `npm run gen:db-types`
regenerates `src/lib/types/database.types.ts` from the linked Supabase project.

## Deploying (adapter-node)

```sh
npm ci
npm run build
node --env-file=.env build   # serves on PORT (default 3000)
```

The built server in `build/` reads its configuration from the process environment:
`PUBLIC_SUPABASE_*` and `PRIVATE_SUPABASE_SECRET_KEY` are baked in at build time
(`$env/static/*`), while `ORIGIN`, `PORT`, `HOST` and `BODY_SIZE_LIMIT` are read at
runtime. Set `ORIGIN` to the public URL (e.g. `https://pilates.example.com`) or form
submissions are rejected as cross-site. Put it behind a reverse proxy (nginx/Caddy)
that terminates TLS and forwards to `PORT`, and keep it alive with systemd or pm2.
