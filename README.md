# My Recipe Book

A recipe book that turns links (Instagram, websites, videos) into clean recipes.

**New:** `web/` contains the full app with logins, shared recipe books, editing and built-in AI
extraction. See [`web/README.md`](web/README.md) for setup. The GitHub Pages site and issue
workflow below keep working until the app is live.

## How it works

1. **Save a link:** open a new issue with the **Recipe link** template and paste the link.
2. **Process:** ask Claude to process the links. Claude opens each link, writes the recipe
   to `_recipes/`, and closes the issue.
3. **Read:** the website rebuilds automatically and shows the new recipe.

Open issues = links still waiting. Closed issues = done.

**Instagram links:** Claude can't open Instagram from a cloud session. Paste the prompt from
`docs/extraction-prompt.md` into a normal Claude chat (with Claude in Chrome or screenshots),
then paste the answer back to Claude Code or as a comment on the issue.

## Structure

| Path | Purpose |
|---|---|
| `_recipes/` | One file per recipe |
| `docs/recipe-template.md` | The recipe format |
| `_layouts/`, `index.html`, `assets/` | The website |
| `.github/ISSUE_TEMPLATE/recipe-link.yml` | The form for saving links |
| `CLAUDE.md` | Processing instructions for Claude |

## Website setup (once)

Settings → Pages → Build and deployment → Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
The site then appears at `https://<your-github-name>.github.io/my-recipe-book/`.
