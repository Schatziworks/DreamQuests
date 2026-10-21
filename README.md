# DreamQuests

A mobile-first React + TypeScript quest / GTD app with Supabase authentication and cloud-saved game progress.

## 1. Configure Supabase

1. Create a Supabase project.
2. In **Project Settings → API**, copy the Project URL and publishable key.
3. In **Authentication → Providers → Email**, enable email/password sign-in.
4. In **Authentication → URL Configuration**, set your deployed Vercel URL as the Site URL and add it to Redirect URLs. For local development, also add `http://localhost:5173/**`.
5. In the Supabase SQL Editor, run:

   ```sql
   create table public.game_saves (
     user_id uuid primary key references auth.users(id) on delete cascade,
     game_state jsonb not null,
     updated_at timestamptz not null default now()
   );

   alter table public.game_saves enable row level security;

   create policy "Users can read their own save"
   on public.game_saves for select to authenticated
   using ((select auth.uid()) = user_id);

   create policy "Users can create their own save"
   on public.game_saves for insert to authenticated
   with check ((select auth.uid()) = user_id);

   create policy "Users can update their own save"
   on public.game_saves for update to authenticated
   using ((select auth.uid()) = user_id)
   with check ((select auth.uid()) = user_id);
   ```

If you already created the `game_saves` table and policies from the earlier instructions, do not run the SQL again.

## 2. Configure the app locally

1. Open this folder in VS Code.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Replace the example values in `.env.local` with your Supabase Project URL and publishable key.
5. Run `npm run dev` and open the local URL Vite prints.

The app now shows a login / create-account screen. After login, it loads the user's saved game and automatically saves updates to that user's row. The first account can import the existing local save if no cloud save exists and the local save has not already been assigned to another account.

## 3. Deploy from GitHub to Vercel

1. Commit and push these code changes to your `DreamQuests` GitHub repository.
2. In Vercel, open the project's **Settings → Environment Variables**.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` with the same values as `.env.local`.
4. Make sure they apply to the environment you deploy (usually Production, and optionally Preview/Development).
5. Redeploy the project.
6. In Supabase **Authentication → URL Configuration**, set the Vercel URL as Site URL and add it to Redirect URLs.

Do not add a Supabase service-role or secret key to the React app. Only use the publishable key in `VITE_SUPABASE_PUBLISHABLE_KEY`; Row Level Security protects each user's data.

## Run locally

```bash
npm install
npm run dev
```

## Build check

```bash
npm run build
```
