# Fablekeep

A lightweight, mobile-first D&D 5e character sheet built with Next.js, TypeScript, React, and Supabase Auth/Postgres.

**No sample character is created.** After sign-in, you will see an empty collection until you press **New character**. All character fields start blank. Characters autosave to your Supabase account and can be accessed from different devices.

## 1. Prepare Supabase (required)

The Supabase project URL and **publishable** key that you supplied are already in `.env.local` for local development. No secret or service-role key is included or necessary.

1. Open the [Supabase dashboard](https://supabase.com/dashboard) and select your project (`cadntvuqpuzinlfdlsub`).
2. Select **SQL Editor → New query**.
3. Open `supabase/schema.sql`, copy all of its contents, and run it in the SQL Editor.
4. Open **Authentication → Providers → Email** and make sure email/password authentication is enabled.
5. Open **Authentication → URL Configuration**:
   - For local testing, add `http://localhost:3000` (or `http://localhost:3000/**`) to the redirect allow-list.
   - For deployment, add your actual website URL as the Site URL and an allowed redirect URL, e.g. `https://your-site.pages.dev/**`.
6. If **Confirm email** is on, new accounts must confirm their email before signing in. The app will show a reminder.

**Security:** `public.characters` has row-level security enabled and separate read/insert/update/delete policies. Each policy checks `auth.uid() = user_id`. Characters from one account cannot be read or modified by another account through the publishable API key.

## 2. Start the website

Use Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open **http://localhost:3000**.

Create an account (or sign in), then select **New character**. The sheet begins entirely empty. There is no starter character or default ability score.

### Environment variables

`.env.local` is already populated with your supplied browser-safe public connection information. For another Supabase project, replace these values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLISHABLE-KEY
```

Never use a Supabase `service_role` key or secret key in a variable prefixed with `NEXT_PUBLIC_`. `.env.local` is excluded from Git by `.gitignore`.

## 3. Verify your app

```bash
npm run lint      # TypeScript checker
npm run build     # Build static website into out/
```

Next.js is configured with `output: 'export'` because this version connects directly from the browser to Supabase. No dedicated Next.js server is required. Do not use `npm run start` to host this static-export configuration: publish `out/` through a static host.

## 4. Host it online (optional)

You can deploy to Cloudflare Pages or another static host:

- Build command: `npm run build`
- Output directory: `out`
- Add the two `NEXT_PUBLIC_SUPABASE_*` environment variables to the hosting project's **build** environment.
- Redeploy after changing environment variables.
- Add the deployed URL to Supabase **Authentication → URL Configuration** so email confirmation links can return to your deployed app.

Because the browser talks directly to Supabase (protected by RLS), no paid hosting tier is required for small personal use, subject to the provider's current free-plan limits.

## 5. Saving, backup, and importing the old site

- Sheets autosave about 650 ms after a change, and try to flush pending saves when a phone browser is backgrounded.
- A badge indicates **Saved to cloud**, **Saving**, or **Save failed · Retry**. Check for **Saved to cloud** before closing or navigating away.
- Use **Export** to download a JSON backup of all characters.
- Use **Import** to restore a Fablekeep JSON backup **or** a `venture-sheet-backup` file exported by the previous standalone VentureSheet website.
- The old localStorage data is not automatically copied to a different website domain. Export it from the old site first, then import the resulting JSON in Fablekeep.
- This first version requires an internet connection to load and save. No offline sync engine has been added.

## 6. Architecture / how it works

```text
Next.js App Router (static export)
  src/app/                Page, metadata, global CSS
  src/components/         Auth form, app shell, character sheet editor
  src/lib/character.ts    Blank character structure and D&D bonus calculations
  src/lib/supabase.ts     Browser-side Supabase client
  supabase/schema.sql     SQL table, owner-only RLS, updated-at trigger

Browser -> Supabase Auth (email/password)
        -> Supabase Postgres public.characters
           (id, user_id, name, sheet JSONB, timestamps)
        -> RLS: authenticated user can only access their own rows
```

For a small character sheet, storing each sheet's flexible fields inside one `jsonb` column keeps the schema simple and makes it easy to add new character sections later. No authentication logic or service key runs on a Next.js server.

### Current scope

- Create, switch, duplicate, delete, import, export characters
- Upload/change/remove a character portrait (PNG, JPEG, or WebP). Images are cropped and compressed in the browser, stored inside the existing `sheet` JSONB data, and sync to your account. No additional SQL or storage bucket is needed. Original images must be under 8 MB; the resulting image is 480×480 JPEG.
- Editable character identity, all six ability scores, hit points, AC, speed, saving throws, skills, attacks, spells, inventory, and journal
- Computed ability modifiers, proficiency bonus, and skill/saving throw bonuses
- D20 rolls in the browser
- Responsive desktop and phone layouts with a fixed phone navigation bar
- Per-account cloud saving secured by Supabase RLS

The app does not automatically calculate class features, equipment effects, spell slots, rules variants, leveling, or multiclass mechanics; these are intentionally manual to keep the website lightweight.

## 6. Dashboard and virtual tabletop (new)

- `/` is the dashboard; `/characters` is the existing character manager; `/tabletop` is the encounter board.
- All routes use the existing Supabase email/password authentication. No new SQL is needed for the tabletop's current local-only scene mode.
- Upload PNG, JPEG, or WebP maps (up to 15 MB). The original map image is saved in **IndexedDB on this browser/device**, under your signed-in user ID. Map images do not get uploaded to Supabase.
- Scene settings and tokens are autosaved to **localStorage** in the signed-in user's browser. Characters still save to Supabase and sync between devices.
- Grid overlay: 6–60 squares across, optional snapping, on/off grid, and zoom. Drag token markers on the map with mouse or touch. You can add blank/NPC tokens or create token labels from your Supabase character names. Token placement does **not** change character records.
- Dice roller: d4, d6, d8, d10, d12, d20, d100 or a custom-sided die, with number-of-dice and modifier controls. Recent rolls remain only in memory until you leave the page.
- Export Scene saves grid settings and tokens to JSON; the large map image is **not included** in a scene export. Import the map image separately when restoring a scene.
- This version does **not** include simultaneous live multiplayer, shared maps, fog of war, player permissions, or Supabase image storage. Adding persistent hosted scenes with Storage + RLS + realtime is a later phase.

### Deploy to Cloudflare Workers static assets

The existing Next.js `output: 'export'` setting can remain. A `wrangler.jsonc` is included. Install dependencies, then:

```bash
npm run build
npx wrangler deploy
```

For CI builds, supply `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as **build environment variables**. Also add the deployed domain to Supabase Auth URL Configuration. Client-side routing is statically exported into `out/characters.html` and `out/tabletop.html`.

## Shared multiplayer VTT (new)

The `/tabletop` route now opens **campaign rooms**, replacing the local-only scene editor. All signed-in users can create rooms or join using the code shown to room members. Every room member can upload maps, move/add/delete tokens, change the grid, and roll dice into a shared log.

1. Run `supabase/schema.sql` if the original character table is not installed.
2. Run **`supabase/multiplayer.sql`** once in Supabase SQL Editor (creates protected rooms, memberships, tokens, rolls, map Storage bucket, and realtime publication entries).
3. Keep `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Run `npm install && npm run dev`, or `npm run deploy` for Cloudflare Workers static assets.
5. Sign in to two different Fablekeep accounts. Create a room on the first account and share the join code with the second. Both participants can now change the same tabletop.

**Important:** The new VTT uses Supabase, not previous localStorage/IndexedDB scenes. Old locally saved scene JSON can still be accessed in an older project copy. Existing character sheets are unchanged. Authentication is still required. Room codes are invitations, so share them only with people you want to join. A room's creator can remove the room in the database; no room-member removal interface is included yet. Realtime uses Supabase Postgres Changes; while connected, updates propagate to other accounts. Token drag writes are throttled to approximately one request per 110 ms; that may consume Realtime messages under heavy use. Cloud synchronization requires internet access. The dice log is informational rather than tamper-resistant cryptographic dice.


## Cloudflare deployment checklist (October 2026)

This ZIP contains `wrangler.jsonc`, but not a generated `package-lock.json`.
After extracting, run `npm install` locally to produce a lockfile, and commit **both** `package.json` and `package-lock.json` to GitHub. Cloudflare uses `npm ci`, which fails when these are out of sync.

In Cloudflare Workers Git builds configure:

- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy`
- **Root directory:** the directory containing `package.json` and `wrangler.jsonc`
- **Build variables:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Run `supabase/multiplayer.sql` in your Supabase SQL Editor if not already installed, and configure Authentication > URL Configuration for the deployed origin.

### Local validation

```powershell
npm install
npm ci
npm run build
```

If these commands pass, then commit/push your changes. The code has **not** been verified with a full dependency-backed build in this delivery environment; Cloudflare is the final build check.
