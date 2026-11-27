# My Recipe Book: processing workflow

This repository is a recipe book. GitHub Issues is the inbox, `_recipes/` is the storage,
and GitHub Pages builds the website from it with Jekyll (no build step to run by hand).

## When asked to "process the links" (or similar)

1. List the **open** issues in `laurakribben/my-recipe-book` whose title starts with
   `[Recipe]` or that have the `recipe-link` label. Each one holds a link and optional notes.
2. For each issue, open the link and extract the recipe:
   - Instagram/TikTok: needs the owner's logged-in browser on their computer. Read the
     caption, on-screen text, subtitles and the creator's comments. Only read: never like,
     comment, follow or message. Keep batches small.
   - Websites: prefer the page's `schema.org/Recipe` data, otherwise the visible recipe.
   - YouTube: description and transcript.
   If a link can't be opened (Instagram from a cloud session), give the user the prompt in
   `docs/extraction-prompt.md` with the link filled in, and work from the answer they paste
   back (in chat or as an issue comment). That file also lists how the answer maps onto a
   recipe file.
3. Write `_recipes/<short-name>.md` following `docs/recipe-template.md` exactly
   (front matter fields, ingredient groups, steps). Keep the creator's amounts and units.
   **Write every recipe in German** (title, ingredients, steps, notes, tags, `missing`),
   whatever the source language. Keep the creator's amounts; use German unit abbreviations
   (TL, EL, Tasse, Prise) and German ingredient names. Give °C first with the original °F in
   brackets, and add cm in brackets after inches. Name new files after the German title in
   lowercase with hyphens and umlauts spelled out (ä→ae, ö→oe, ü→ue, ß→ss), e.g.
   `gruener-spargelsalat.md`. Never rename existing files: their URLs may have been shared.
4. Never guess amounts or steps. If something is missing (e.g. only spoken in the video),
   set `status: incomplete` and explain it in `missing`.
5. Commit one recipe per commit, mentioning the issue number, push, then comment on the
   issue with the recipe file name and close it. If a link fails (deleted post, login
   wall), comment why and leave the issue open.

## Local preview

`jekyll build` (Jekyll 3.x as used by GitHub Pages) renders the site into `_site/`.
