# Extraction prompt

Use this when a link can't be opened directly (e.g. Instagram): paste the prompt below into a
normal Claude chat (with Claude in Chrome, or with screenshots of the post attached), replace
`<LINK>` and `<@AUTHOR>`, then paste Claude's answer back into the Claude Code session or as a
comment on the link's issue.

````text
Please extract the recipe from this post: <LINK>
(If you can't open the link, use the screenshots I attached instead.)

Look in all of these places: the caption (expand "more"), text shown on screen in the video, subtitles, and the creator's own comments (recipes are often pinned there).

Rules:
- Only write what the post actually says. Never guess or invent amounts, ingredients, times or steps.
- Keep the creator's amounts and units exactly as given.
- If something is missing (e.g. amounts are only spoken in the video), leave that field empty, set status to incomplete, and explain what is missing in "missing".
- Write the steps as short, clear sentences in your own words.

Reply with ONLY this block, filled in, and nothing else:

```yaml
title: 
source_url: <LINK>
source_type: instagram  # instagram | website | youtube | tiktok | photo | other
source_author: "<@AUTHOR>"
status: complete        # complete | incomplete
missing: ""             # what could not be found, if incomplete
servings:               # leave empty if not stated
prep_time:              # e.g. 10 min, leave empty if not stated
cook_time: 
total_time: 
tags: []                # 2-4 short tags, e.g. [pasta, vegetarian, quick]
ingredients:
  - name: ""            # group name like "Sauce" or "Dough"; keep "" if there is only one group
    items:
      - 
steps:
  - 
notes: ""               # useful tips from the creator, substitutions, etc.
where_found: ""         # e.g. "caption", "pinned comment", "screenshots"
```
````

## Turning the answer into a recipe file

The answer maps onto `docs/recipe-template.md` with these differences:

- Add `added` (today's date) and `issue` (the issue number).
- Drop `name` from an ingredient group when it is empty (an empty name would still render a heading).
- Use `steps: []` when no steps were found, never a list with an empty item.
- Move `notes` into the text below the front matter; drop `where_found`.
