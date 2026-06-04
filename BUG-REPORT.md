# Bug Report — Numonic DNS Checker

**Tool:** https://numonic.com/check
**Backend observed:** `https://staging.api.numonic.com/check`
**Tester:** Dan (QA) · **Date:** 2026-06-04
**Method:** Manual exploration, raw HTTP probing (`curl`), page-source review, and Playwright runs.

### Severity summary
| ID | Severity | Title |
|----|----------|-------|
| BUG-01 | **High** | Public production tool depends on the **staging** API; no production API exists |
| BUG-02 | Medium | Page intermittently serves a Vercel bot-challenge (HTTP 403) to legitimate clients |
| BUG-03 | Medium | Invalid input gives **no feedback** — the field silently refocuses |
| BUG-04 | Medium | UI silently **discards API data**: `score`, `summary`, `recommendations`, and the whole **MTA-STS** check |
| BUG-05 | Medium | DKIM steps **never appear** after the user manually picks a provider in the SPF card |
| BUG-06 | Low | SPF picker "Multiple senders" option dead-ends with no guidance |
| BUG-07 | Low | Footer **Privacy** and **Terms** links are dead (`href="#"`) |
| BUG-08 | Low | Aggressive rate limit (HTTP 429 after ~4 requests) trips the normal fix→re-check loop |
| BUG-09 | Low | Helpful API error fields (`why`, `action`) are dropped; only the terse `message` is shown |
| BUG-10 | Low | Strict transport security not enforced |

---

## BUG-01 — Production checker is wired to the STAGING API (High)

**Description**
The public, production-facing tool at `numonic.com/check` makes all its DNS-check calls to
`https://staging.api.numonic.com`. There is no production API host — `api.numonic.com` does not
resolve/respond. Every real user's request is therefore served by staging infrastructure, which
is typically lower-SLA, may carry test data/config, and can be torn down or deployed to without
notice — taking the public tool down with it.

**Steps to Replicate**
1. Open `https://numonic.com/check` and run any check with DevTools → Network open.
2. Observe the outbound request goes to `staging.api.numonic.com/check?domain=…`.
3. View page source and search for `API_BASE`.
4. Try the expected production host: `curl -s -o /dev/null -w "%{http_code}" https://api.numonic.com/check?domain=example.com`.

**Actual Result**
- Page source hardcodes the staging host; production host is unreachable.
```
10: const API_BASE = 'https://staging.api.numonic.com';
653:   let url = `${API_BASE}/check?domain=${encodeURIComponent(domain)}`;
api.numonic.com/check -> http=000   (connection failed, no production endpoint)
```

**Expected Result**
Production page calls a production API host (e.g. `api.numonic.com`) with production SLAs;
staging is used only by non-production environments.

**Proof of Concept**
```
$ grep API_BASE  (page source of https://numonic.com/check)
const API_BASE = 'https://staging.api.numonic.com';

$ curl -s -o /dev/null -w "%{http_code}\n" "https://api.numonic.com/check?domain=example.com"
000

$ curl -s "https://staging.api.numonic.com/check?domain=google.com"
{"domain":"google.com","score":60,"band":"at_risk", ... }   # 200 OK — prod really uses staging
```

---

## BUG-02 — Page intermittently returns a Vercel bot-challenge (403) (Medium)

**Description**
Requests to `numonic.com/check` are sometimes answered with an HTTP **403** "challenge"
interstitial (`x-vercel-mitigated: challenge`) instead of the page. The same URL returns **200**
at other times. Legitimate users behind shared IPs/VPNs/corporate proxies, and any automation or
uptime monitor, can be blocked from a tool whose entire value proposition is being instantly and
freely accessible.

**Steps to Replicate**
1. `curl -sI https://numonic.com/check` (repeat a few times / from different networks).
2. Compare responses.

**Actual Result**
```
HTTP/2 403
cache-control: private, no-store, max-age=0
x-vercel-challenge-token: 2.1780563252.60.NmQ4...
x-vercel-mitigated: challenge
```
(An earlier identical request returned `HTTP/2 200` with the real HTML — i.e. it is intermittent.)

**Expected Result**
A public free tool page should return `200` reliably to ordinary GET requests; bot mitigation
should not interstitial normal users. If challenge mode is intended, it should at least be
consistent and documented.

**Proof of Concept**
First fetch of the session succeeded (page HTML, 200); a later fetch returned `403` with
`x-vercel-mitigated: challenge`. During Playwright runs this surfaces as a 403 navigation
response (the suite skips affected tests rather than failing — see `README.md`).

---

## BUG-03 — Invalid input produces no feedback (Medium, UX + accessibility)

**Description**
When the domain fails the client-side check, the code just re-focuses the input and returns —
no error text, no help, no visual cue. The user clicks **Check →**, nothing visibly happens, and
they're left guessing. The input is also placeholder-only with no associated `<label>`, compounding
the accessibility gap.

**Steps to Replicate**
1. Open `/check`.
2. Type `localhost` (or leave the field empty / spaces only).
3. Click **Check →**.

**Actual Result**
Nothing happens — no message, no spinner, no results. The cursor returns to the field.

```js
// page source, runCheck()
let domain = input.value.trim().toLowerCase()
  .replace(/^https?:\/\//,'').replace(/\/.*$/,'').replace(/^www\./,'');
if (!domain || !domain.includes('.')) { input.focus(); return; } // silent
```

**Expected Result**
An inline message such as "Enter a valid domain, e.g. example.com." should appear (and be
announced to assistive tech). The input should have a real label.

**Proof of Concept**
Playwright test #4 documents the silent behaviour: no request fires, `#checkerResults` never
becomes visible, **and** `#checkerError` is never shown.

---

## BUG-04 — UI silently discards API data, incl. the entire MTA-STS check (Medium)

**Description**
The API returns a numeric `score`, a risk `band`, a written `summary`, a `recommendations[]`
array, **and an `mtaSts` check** (a 5th, security-relevant authentication mechanism). The page's
`renderResults()` only ever consumes `dmarc/spf/dkim/mx` (+ `bimi`). All the other data —
including the MTA-STS result the backend went and fetched — is thrown away and never shown to
the user.

**Steps to Replicate**
1. In DevTools → Network, run a check for `google.com`.
2. Inspect the JSON response vs. what the page renders.

**Actual Result**
Response contains (abridged):
```json
{
  "score": 60, "band": "at_risk",
  "summary": "Your domain has strong DMARC ... but SPF uses soft fail ...",
  "recommendations": ["-all", "Switch SPF from ~all to -all ...", ...],
  "checks": {
    "mtaSts": { "status": "configured", "record": "v=STSv1; id=20210803T010101;",
                "finding": "MTA-STS record found. Inbound mail is protected ..." }
  }
}
```
None of `score`, `band`, `summary`, `recommendations`, or `checks.mtaSts` is rendered. The page
shows a hand-rolled "X fixes needed" count instead of the backend's own score/summary.

**Expected Result**
Either surface this data (a score/grade, the summary, and an MTA-STS card) or stop computing/
returning it. Silently dropping a completed security check (MTA-STS) is misleading — a user can
"pass" everything shown yet never learn their MTA-STS status.

**Proof of Concept**
`curl "https://staging.api.numonic.com/check?domain=google.com"` returns the fields above;
the rendered page (see `renderResults`, page source ~lines 420-477) references only
`c.dmarc/c.spf/c.dkim/c.mx/c.bimi`.

---

## BUG-05 — DKIM steps never appear after a manual SPF provider pick (Medium)

**Description**
When the backend can't auto-detect the email provider, the DKIM card renders a "waiting" state:
*"Select your provider in the SPF card above — DKIM steps will appear here."* But selecting a
provider in the SPF picker (`spfPickerChange`) only updates SPF-card DOM; it never re-renders or
populates the DKIM card. The promised DKIM steps therefore **never appear**, leaving a broken
promise in the UI.

**Steps to Replicate**
1. Check a domain whose provider isn't auto-detected (so the SPF card shows the "Who sends your
   email?" picker and the DKIM card shows the "waiting" message).
2. In the SPF card, choose a provider (e.g. SendGrid).
3. Look at the DKIM card.

**Actual Result**
SPF card shows a record to add; the DKIM card still says "Select your provider in the SPF card
above — DKIM steps will appear here." It never updates.

**Expected Result**
Picking a provider should populate the DKIM card with that provider's DKIM setup steps (the
`dkimSteps` data already exists in the page), or the message shouldn't promise it.

**Proof of Concept**
```
$ grep -n "dkim" page-source | grep -i picker
(no matches) -> spfPickerChange() never references any DKIM element
```
`ctx.sharedProviderKey` is computed once from the API's `spf.esp` at render time; the manual
picker path doesn't feed back into it. Corroborated by the in-code comment:
`// Ported for a future pass — not wired up to the production DKIM card yet.`

---

## BUG-06 — SPF picker "Multiple senders" dead-ends with no guidance (Low, UX)

**Description**
In the SPF provider picker, choosing **Multiple senders** (`value="other"`) hides the hint and
clears the record area, showing nothing at all — no explanation, no next step. Users with more
than one sender (a very common, important case) are left with a blank card.

**Steps to Replicate**
1. Reach an SPF card with the provider picker.
2. Select **Multiple senders**.

**Actual Result**
The card blanks out; no record, no guidance, no Re-check.
```js
if (p === 'other') {
  hint.style.display = 'none';
  record.className = 'hidden'; fields.className = 'hidden'; after.className = 'hidden';
  record.innerHTML = ''; return;   // dead end
}
```

**Expected Result**
Show guidance for combining multiple `include:` mechanisms into one SPF record (or a help link).

**Proof of Concept** — see `spfPickerChange()` in page source (the `p === 'other'` branch).

---

## BUG-07 — Footer Privacy & Terms links are dead (Low)

**Description** Footer "Privacy" and "Terms" links point to `#`, scrolling to top instead of
opening any policy. For a tool that takes a domain and emphasises "no account required," missing
Privacy/Terms is a trust and (potentially) compliance gap.

**Steps to Replicate** Click **Privacy** / **Terms** in the footer.

**Actual Result**
```html
<a href="#">Privacy</a>
<a href="#">Terms</a>
```
Page just jumps to top.

**Expected Result** Links resolve to real Privacy Policy / Terms pages (or are removed until they exist).

**Proof of Concept** `grep '<a href="#"' page-source` → both Privacy and Terms.

---

## BUG-08 — Aggressive rate limit trips the normal usage loop (Low)

**Description** The API returns HTTP **429 (`RATE_LIMIT_EXCEEDED`)** after only ~4 requests in
quick succession. The tool's own UX encourages repeated checks ("fix it, then **Re-check →**"),
so an ordinary user fixing several records and re-checking can be throttled. The 429 *is* handled
gracefully on the page ("Too many requests — please wait a moment…"), so this is a tuning/UX
issue, not a crash.

**Steps to Replicate** Run 4–5 checks in a row (or `curl` the endpoint 4–5× quickly).

**Actual Result**
```json
{"success":false,"error":{"code":"RATE_LIMIT_EXCEEDED","message":"ThrottlerException: Too Many Requests"}}
HTTP 429
```
(Hit after the 4th rapid request during testing.)

**Expected Result** A limit generous enough to absorb a normal fix→re-check session, and/or
clearer in-UI cooldown feedback (e.g. a countdown).

**Proof of Concept** Four sequential `curl` calls to `/check?domain=…` — the 4th onward returned 429.

---

## BUG-09 — Helpful API error fields are dropped (Low)

**Description** On validation errors the API returns rich, user-friendly `why` and `action`
fields, but the page only renders the terse `error.message`.

**Steps to Replicate** Submit `.` (passes the weak client check, hits the API).

**Actual Result** — API returns:
```json
{"error":{"code":"VALIDATION_ERROR",
  "message":"Invalid domain name: \".\"",
  "why":"... must contain at least one dot, use only letters, numbers, and hyphens ...",
  "action":"Provide a valid domain name like \"example.com\" or \"mail.example.com\""}}
```
The page shows only *"Invalid domain name: ".""* (the `message`); `why`/`action` are ignored
(`const msg = body?.error?.message || …`).

**Expected Result** Surface `action` (and/or `why`) so the user knows how to fix the input.

**Proof of Concept** Compare the raw 400 body above with the rendered `#checkerError` text.


---

## BUG-10 — Strict transport security not enforced (Low)

**Description** The application fails to prevent users from connecting to it over unencrypted connections. An attacker able to modify a legitimate user's network traffic could bypass the application's use of SSL/TLS encryption, and use the application as a platform for attacks against its users. This attack is performed by rewriting HTTPS links as HTTP, so that if a targeted user follows a link to the site from an HTTP page, their browser never attempts to use an encrypted connection. The sslstrip tool automates this process.

To exploit this vulnerability, an attacker must be suitably positioned to intercept and modify the victim's network traffic.This scenario typically occurs when a client communicates with the server over an insecure connection such as public Wi-Fi, or a corporate or home network that is shared with a compromised computer. Common defenses such as switched networks are not sufficient to prevent this. An attacker situated in the user's ISP or the application's hosting infrastructure could also perform this attack. Note that an advanced adversary could potentially target any connection made over the Internet's core infrastructure.

**Suggested Issue Remediation** 
The application should instruct web browsers to only access the application using HTTPS. To do this, enable HTTP Strict Transport Security (HSTS) by adding a response header with the name 'Strict-Transport-Security' and the value 'max-age=expireTime', where expireTime is the time in seconds that browsers should remember that the site should only be accessed using HTTPS. Consider adding the 'includeSubDomains' flag if appropriate.

Note that because HSTS is a "trust on first use" (TOFU) protocol, a user who has never accessed the application will never have seen the HSTS header, and will therefore still be vulnerable to SSL stripping attacks. To mitigate this risk, you can optionally add the 'preload' flag to the HSTS header, and submit the domain for review by browser vendors.


**References**
- HTTP Strict Transport Security - https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security
- sslstrip - https://github.com/moxie0/sslstrip
- HSTS Preload Form - https://hstspreload.org/

**Vulnerability Classifications**
- CWE-523: Unprotected Transport of Credentials - https://cwe.mitre.org/data/definitions/523.html
- CAPEC-94: Adversary in the Middle (AiTM) - https://capec.mitre.org/data/definitions/94.html
- CAPEC-157: Sniffing Attacks - https://capec.mitre.org/data/definitions/157.html


---
</content>
