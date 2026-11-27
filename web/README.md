# Mein Rezeptbuch – web app

Next.js app with logins, shared recipe books and AI recipe extraction.

- **Supabase**: database, login by email link, access rules (row level security)
- **Vercel**: hosts the website and server code
- **Claude API** (Claude Haiku 5.5): turns links, pasted text and photos into German recipes

## How it works

- Only invited people can log in. Anyone who owns a recipe book can invite others by sharing it.
- Each user can have several recipe books and share each one with others, as **Kann lesen** (viewer)
  or **Kann bearbeiten** (editor). The owner manages members.
- Each recipe is **privat** (only members of its book) or **öffentlich** (anyone with the link).
- **Rezept hinzufügen** → Link, Text or Fotos → the AI fills in the recipe → you check and save.
  Instagram/TikTok can't be read directly (login wall): paste the caption or upload screenshots.
- Each recipe can have a picture: uploaded (shrunk in the browser first), or taken over from the
  recipe website when the AI reads a link. Pictures are stored in the public-read storage bucket
  `recipe-images` under random addresses; only the server uploads and deletes them. The picture's
  source ("Bild: …") is shown under it; for website pictures it's filled in automatically.
- Cooking mode shows under each step the ingredients (with amounts) it uses. The AI assigns them
  while reading a recipe, again when ingredients or steps are changed on save, and for older
  recipes via a button in cooking mode (editors only).
- The edit view has "Fehlendes mit KI ergänzen": it lists what a recipe lacks (picture, ingredients
  per step) and fills it in. New checks are added in `src/lib/recipe-completion.ts`.
- Servings: the recipe page and cooking mode have a "− 4 Portionen +" control that recalculates the
  ingredient amounts for the current browser session only (`src/lib/servings.ts`). When adding a
  recipe, an optional "Portionen" field makes the AI convert all amounts, steps included.
- Wochenplan (`/plans`): each user gets a personal meal plan (days with dishes, recipes or free
  entries, servings per entry) that can be shared like a recipe book. "Einkaufsliste für diese
  Woche" puts the ingredients of the week's recipes, scaled to the planned servings, on the plan's
  shared shopping list. Viewers of a plan can tick items off but change nothing else.
- Each user can run 30 AI extractions per 24 hours (`AI_DAILY_LIMIT`), to keep costs predictable.

## Setup (once)

### 1. Supabase

1. Create a free project at supabase.com.
2. **SQL Editor** → New query → paste `supabase/migrations/0001_init.sql` → **Run**. Then the same
   with `supabase/migrations/0002_grants.sql` and `supabase/migrations/0003_images.sql` (recipe
   pictures: adds the `image_path` column and the `recipe-images` storage bucket) and
   `supabase/migrations/0004_image_credit.sql` (picture source shown under the picture) and
   `supabase/migrations/0005_step_ingredients.sql` (ingredients per step in cooking mode) and
   `supabase/migrations/0006_meal_plans.sql` (meal plans and shopping lists).
3. **Authentication → Sign In / Providers → Email**: keep Email enabled. Under **User Signups**,
   turn **Allow new users to sign up** off (the book is invite-only).
4. **Authentication → URL Configuration**: set **Site URL** to the app's address
   (e.g. `https://my-recipe-book.vercel.app`, or `http://localhost:3000` while testing).
5. **Authentication → Emails → Templates**: change the link in two templates so it points to the app:
   - **Magic Link**: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
   - **Invite user**: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`

   For example: `<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Anmelden</a></p>`
6. **Authentication → Users → Invite user**: invite yourself. This is the first account.
7. **Project Settings → API Keys**: note the project URL, the **publishable** (or legacy *anon*) key and
   the **secret** (or legacy *service_role*) key. The secret key bypasses all access rules: never
   put it in the browser, in chat or in git.

Supabase's built-in email sending is limited to a few emails per hour. For more users, add your
own SMTP server under **Authentication → Emails → SMTP Settings**.

### 2. Claude API key

At platform.claude.com: add a payment method or prepaid credits, then create an API key.
This is billed separately from a Claude Pro/Max subscription. With Claude Haiku 5.5 one recipe
costs roughly 0.1–1 cent.

### 3. Vercel

1. Import the GitHub repository at vercel.com and set **Root Directory** to `web`.
2. Add these **Environment Variables**:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable / anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | secret / service_role key |
   | `ANTHROPIC_API_KEY` | Claude API key |
   | `NEXT_PUBLIC_SITE_URL` | the app's address, same as Supabase's Site URL |
   | `AI_DAILY_LIMIT` | optional, default 30 |

3. Deploy. Then log in with the email from step 1.6 and create your first recipe book.

### 4. Import the old recipes (optional)

Open your recipe book; its id is the last part of the address (`/books/<id>`). Then, with the
variables from `.env.example` in `web/.env.local`:

```bash
npm run import-recipes -- <book-id>
```

Imported recipes are public by default (as on the old site); add `--visibility private` to change that.

## Troubleshooting

**Creating a recipe book fails ("Profil fehlt" / database error 23503).** Accounts created before
`0001_init.sql` ran have no profile. Run this once in the SQL Editor (safe to repeat):

```sql
insert into public.profiles (id, email)
select id, lower(email) from auth.users
on conflict (id) do nothing;
```

**Database error 42501 (access denied) for every action.** The app's database roles lack table
permissions. Run `supabase/migrations/0002_grants.sql` in the SQL Editor.

**"Invalid path specified in request URL".** `NEXT_PUBLIC_SUPABASE_URL` must be only the project
address (`https://abcd.supabase.co`), without `/rest/v1/`. The app strips a path since then.

**Errors in general.** Vercel → project → **Logs** shows the server errors; Supabase →
**Authentication → Logs** shows login and email problems.

## Development

```bash
npm install
npm run dev        # http://localhost:3000, needs web/.env.local
npm run typecheck
npm run lint
npm run build
```
