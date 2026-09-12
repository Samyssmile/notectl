# notectl Angular example

Minimal Angular application that uses `@notectl/angular` through the workspace
link. See the [Angular guide](https://samyssmile.github.io/notectl/guides/angular/)
for the full integration walkthrough.

```bash
pnpm build                            # builds @notectl/core and @notectl/angular
pnpm --filter examples-angular start  # dev server on http://localhost:4200
pnpm --filter examples-angular test   # unit tests
```

In CI, the `angular` Playwright project in `playwright.config.ts` runs the e2e
specs under `e2e/angular/` against this app. Locally, run them with
`CI=true pnpm test:e2e -- angular`.
