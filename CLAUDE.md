# Soundtrack to Awakening

Single-page static site: everything lives in `index.html` (inline CSS + JS),
with media in `assets/`. No build step, no package manager, no tests.

## Workflow

- **Merge automatically.** When a change is ready, open a PR into `main` and
  merge it yourself without asking. The owner has no staging environment and
  checks changes on the live site after merge.
- Before merging, check the page in headless Chromium (serve the repo with
  `python3 -m http.server` rather than opening `file://`, which breaks
  `fetch` and downloads) and confirm there are no page errors.
- Don't submit the signup popup form in tests against the real backend
  (`LIGHTSTORM_API_BASE`): it stores a real lead in the LightStorm admin.
