# My Recipe Book

A recipe book that turns links (Instagram, websites, videos) into clean recipes.

## How it works

1. **Save a link:** open a new issue with the **Recipe link** template and paste the link.
2. **Process:** ask Claude to process the links. Claude opens each link, writes the recipe
   to `_recipes/`, and closes the issue.
3. **Read:** the website rebuilds automatically and shows the new recipe.

Open issues = links still waiting. Closed issues = done.

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
