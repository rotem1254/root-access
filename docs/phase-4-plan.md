# Phase 4 — Plan (Web challenges, the final boss, deploy)

Approved by the user ("כן, תתחיל את Phase 4"). Same working agreement: small verifiable steps,
Conventional Commits, the quality gate green after every step, no plaintext flags in the build.

## Principle

The SQL injection level must teach the real mechanism, not a trick. So the simulated endpoint builds
its query by **string concatenation** and hands it to a small but genuine SQL engine (SELECT, WHERE,
AND/OR, parentheses, literals, `--` comments, UNION SELECT). The injection works because the query
text really changes — any valid payload works, not a scripted one — and a broken payload produces a
real syntax error, which is itself how you discover the flaw.

## Progress

- [x] 1. Mini SQL engine (tokenizer, parser, evaluator, UNION, MySQL errors)
- [x] 2. Dynamic HTTP (query string, body, headers, handler routes)
- [x] 3. curl for web work (-X, -d, -H, -b, query strings)
- [x] 4. Chapter 4 "The Way In" (robots.txt, IDOR, SQL injection)
- [x] 5. Chapter 5 "Root Access" finale (the full chain)
- [x] 6. Polish and deploy (vercel.json, README, Phase 4 report)

## Steps

1. **Mini SQL engine** (`src/engine/web/sql.ts`) — tokenizer, parser and evaluator over in-memory
   tables; MySQL-ish error messages. Pure, unit-tested.
2. **Dynamic HTTP** — requests gain a parsed query string, a body, and cookies; a route may be a
   handler function instead of a fixed body, so a level can serve a search page, a login form and an
   object lookup. Static routes keep working unchanged.
3. **curl for real web work** — `-X`, `-d`, `-H`, `-b/--cookie`, `-L`, and query strings in the URL.
4. **Chapter 4 "The Way In"** — three levels: what `robots.txt` gives away, broken access control
   (IDOR via a predictable id), and manual SQL injection through `curl`.
5. **Chapter 5 "Root Access"** — one final boss level that chains the whole game: recon on the
   network, a credential recovered with the crypto tools, and a web flaw to finish.
6. **Polish and deploy** — accessibility pass on the panels, keyboard help, `vercel.json` with the
   production headers, README and the Phase 4 report.

## Chapter 4 — The Way In (draft)

| #   | Level              | Teaches                                                             |
| --- | ------------------ | ------------------------------------------------------------------- |
| 12  | Robots and Secrets | `robots.txt` and `curl -I`: what a site tells you not to look at     |
| 13  | Broken Access      | IDOR — changing an id in a URL to read someone else's record         |
| 14  | Injection          | manual SQL injection with `curl`, including a UNION to another table |

## Chapter 5 — Root Access

| #   | Level         | Teaches                                                     |
| --- | ------------- | ----------------------------------------------------------- |
| 15  | The Last Door | the whole chain: scan → pivot → crack → decrypt → inject     |

## Fidelity conventions (new)

- `robots.txt` is served as `text/plain` and `Disallow:` lines are the point: they enumerate exactly
  what the owner wanted hidden.
- A SQL error surfaces the way a careless app leaks it:
  `You have an error in your SQL syntax; check the manual ... near "'" at line 1`.
- `curl -d` implies `POST` unless `-X` says otherwise, and sends
  `Content-Type: application/x-www-form-urlencoded`, exactly like the real tool.
- `401`/`403`/`404` keep the nginx-style bodies already used in Phase 2.
