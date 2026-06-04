# Numonic DNS Checker — QA

QA deliverables for the **Numonic DNS Checker** (https://numonic.com/check):

- [`TEST-CASES.md`](./TEST-CASES.md) — 20 manual test cases (happy paths, edge cases, invalid input, security, UI).
- [`tests/dns-checker.spec.ts`](./tests/dns-checker.spec.ts) — 5 automated Playwright tests (TypeScript).
- [`BUG-REPORT.md`](./BUG-REPORT.md) — issues found, with repro steps and proofs of concept.

## The tool in one paragraph
Enter a domain → the page calls a JSON API (`GET .../check?domain=<domain>`) and renders
**DMARC / SPF / DKIM / MX** cards (plus an optional **BIMI** "Advanced" section), each either
"Passing" or with a copy-paste DNS fix. `?domain=` in the URL auto-runs a check on load.

## Running the Playwright tests

```bash
npm install
npx playwright install chromium
npm test            # headless
npm run test:headed # recommended — see the bot-challenge note below
npm run report      # open the HTML report
```

### Heads-up: bot challenge
`numonic.com/check` intermittently serves a **Vercel bot-challenge** (HTTP 403,
`x-vercel-mitigated: challenge`) to automated/headless clients. When that happens the affected
test **skips itself** with a message rather than failing spuriously. Running `--headed` is the
most reliable way through it. This challenge behaviour is itself logged as **BUG-02**.

### Heads-up: API rate limit
The backend rate-limits aggressively (HTTP 429 after only a handful of quick requests). The
suite runs single-worker/serial to be gentle; if you re-run repeatedly you may still hit 429.

## What the tests cover
| # | Test | Type |
|---|------|------|
| 1 | Checker form loads with the expected input/button/title | smoke / happy |
| 2 | Checking `google.com` renders 4 result cards + header | happy |
| 3 | `?domain=` deep link auto-runs a check | happy |
| 4 | Input without a dot fires no request | edge / invalid |
| 5 | Malformed-but-dotted domain (`.`) shows a readable error, not a broken panel | edge |

