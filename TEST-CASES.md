# Manual Test Cases — Numonic DNS Checker

**Tool under test:** https://numonic.com/check
**Tester:** Dan (QA)
**Date:** 2026-06-04

## Tool summary
A free email-DNS authentication checker. The user types a domain, clicks **Check →** (or
presses Enter), and the page calls a JSON API (`GET .../check?domain=<domain>`) and renders
cards for **DMARC, SPF, DKIM, MX** (plus an optional **BIMI** "Advanced" section), each with a
pass badge or a copy-paste fix. A `?domain=` URL parameter auto-runs a check on load.

## Environment / preconditions
- Desktop Chrome (latest), normal network, no ad-blocker unless stated.
- Backend reached by the page: `https://staging.api.numonic.com/check`.
- The API is **rate-limited** — space out repeated runs to avoid `429` during testing.

---

| # | Title | Category | Preconditions | Steps | Expected Result |
|---|-------|----------|---------------|-------|-----------------|
| TC-01 | Check a domain with strong config | Happy path | On /check | 1. Type `google.com` 2. Click **Check →** | Loading spinner shows the domain, then results appear: header summary ("X fixes needed" / "All good"), 4 dots, and DMARC/SPF/DKIM/MX cards. Passing checks show a green "Passing" badge. No console errors. |
| TC-02 | Check a fully-unconfigured domain | Happy path / edge | On /check | 1. Type a domain with no email DNS (e.g. a parked/new domain) 2. Check | All four checks render as failing with actionable "Add this DNS record" cards and copy buttons; header reads "Four fixes needed". |
| TC-03 | Submit with Enter key | Happy path | On /check | 1. Type `gmail.com` 2. Press **Enter** | Check runs identically to clicking the button. |
| TC-04 | Deep-link via `?domain=` param | Happy path | — | 1. Open `https://numonic.com/check?domain=google.com` directly | Input is pre-filled and a check auto-runs on page load; results render without any click. |
| TC-05 | URL / protocol / www normalization | Edge / input handling | On /check | 1. Type `https://www.Google.com/some/path` 2. Check | Input is normalized to `google.com` (protocol, `www.`, path stripped, lowercased) and that domain is checked. |
| TC-06 | Empty / whitespace input | Invalid input | On /check | 1. Leave input empty (or only spaces) 2. Click **Check →** | No API call is made; the field is focused. **(Observe:** no visible error/help message is shown — see BUG-03.) |
| TC-07 | Input with no dot | Invalid input | On /check | 1. Type `localhost` 2. Check | Treated as invalid (must contain a dot); no request fires. The user should be told why — verify whether any message appears. |
| TC-08 | Malformed value that still contains a dot | Invalid input / validation | On /check | 1. Type `.` (a single dot), then `foo.` | Client passes it to the API (it contains a dot); API returns a clear validation error and the page shows a readable error message — not a blank/broken state. |
| TC-09 | Non-existent domain | Edge | On /check | 1. Type `thisdomaindoesnotexist-qa-12345.com` 2. Check | Results render with all checks failing (score 0 / critical), not an unhandled error. |
| TC-10 | Re-check after a result + button state | Functional / UX | A result is showing | 1. Note **Check →** is dimmed/disabled after a result 2. Edit the domain text 3. Observe button 4. Click **Re-check →** inside a card | Button re-enables when the domain is edited; **Re-check →** re-runs the check for the current domain. |
| TC-11 | Copy buttons copy the exact record | Functional | A failing result with a fix is showing | 1. Click the copy icon on a record value and on a Host/Name field | Clipboard contains the exact record string / host; button shows a transient check-mark confirmation for ~2s. |
| TC-12 | DKIM "selector" path | Functional / edge | A result where DKIM is "not detected" | 1. Check `google.com` 2. Inspect the DKIM card guidance | DKIM is reported as not detected with guidance; verify the on-page DKIM steps/affordance actually work (note: code suggests DKIM steps may be unfinished — see BUG-06). |
| TC-13 | SPF provider picker incl. "Multiple senders" | Functional / UX | A result where SPF provider is NOT auto-detected | 1. In the SPF card open "Who sends your email?" 2. Pick a provider (e.g. SendGrid) — a record + Re-check appears 3. Re-open and pick **Multiple senders** | A concrete provider yields a copyable SPF record. **Multiple senders** should give useful guidance — verify it does not silently blank the card with no instructions (see BUG-07). |
| TC-14 | BIMI "Advanced" section visibility & generation | Functional | A domain eligible for BIMI (DMARC p=reject), e.g. `google.com` | 1. After results, expand **Advanced** 2. Paste an SVG logo URL | Advanced/BIMI section appears only for eligible domains; pasting a URL builds `v=BIMI1; l=<url>;` and enables the copy button. For non-eligible domains the section stays hidden. |
| TC-15 | Rate-limit handling | Edge / resilience | On /check | 1. Run several checks in quick succession | When the API returns `429`, the page shows a friendly "Too many requests — please wait a moment and try again." message (not a blank/broken result) and the button re-enables. |
| TC-16 | Network failure handling | Negative | On /check (offline or API blocked) | 1. Disable network / block `staging.api.numonic.com` 2. Check | Page shows "Could not reach the server…" error and re-enables the button; no infinite spinner. |
| TC-17 | XSS / injection in domain field | Security | On /check | 1. Type `<script>alert(1)</script>.com` 2. Check | No script executes; value is escaped/validated. API rejects it; page renders the error as text. |
| TC-18 | Mobile / responsive layout | UI | Viewport ≤ 600px | 1. Open /check on mobile width 2. Run a check | Input, button, and result cards reflow cleanly; nothing overlaps or is cut off; copy buttons remain tappable. |
| TC-19 | Footer / nav links | Content / UX | On /check | 1. Click footer **Privacy** and **Terms** links | Each should navigate to a real page. (Observe: both are `href="#"` placeholders — see BUG-05.) |
| TC-20 | Score/summary completeness vs. API | Data integrity | A result is showing | 1. Compare on-page results with the raw API response (DevTools → Network) | The page should not silently drop meaningful data. (Observe: API returns `score`, `band`, `summary`, `recommendations`, and an `mtaSts` check that the UI never displays — see BUG-04.) |

---

