# Phase 3 — Plan (Cryptography & Breaking the Cipher)

Approved by the user ("כן, תתחיל את Phase 3"). Same working agreement: small verifiable steps,
Conventional Commits, the quality gate green after every step, no plaintext flags in the build.

## Principle

Real primitives wherever it is reasonable. `md5sum`/`sha1sum`/`sha256sum` compute genuine digests,
and `openssl enc -aes-256-cbc` produces the real OpenSSL `Salted__` container with EVP_BytesToKey
derivation — a file produced in the game decrypts with real `openssl` on a real machine. Only `gpg`
is simulated (a real implementation is out of scope), and its man page says so plainly.

New dependency: `@noble/ciphers` (AES-CBC), alongside the existing `@noble/hashes` (md5/sha1 come
from its `legacy` module).

## Progress

- [x] 1. Crypto utilities (digests, hash identification, OpenSSL container, GPG stand-in)
- [x] 2. Commands (md5sum/sha1sum/sha256sum/sha512sum, xxd, tr, openssl, john, gpg)
- [x] 3. Chapter 3 content (4 levels + solvability and anti-shortcut tests)
- [x] 4. Scoring screen (`summary`, run-complete, rank)
- [x] 5. README, Definition-of-Done pass, Phase 3 report

## Steps

1. **Crypto utilities** (`src/engine/crypto/`) — digests, hash identification, OpenSSL
   EVP_BytesToKey + AES-256-CBC container, simplified GPG keyring. Pure, unit-tested.
2. **Commands** — `md5sum`, `sha1sum`, `sha256sum` (with `-c`), `xxd` (`-p`, `-r`, `-l`, `-s`), `tr`
   (`-d`, `-s`, ranges, so ROT13 works), `openssl` (`enc`, `dgst`, `rand`), `john`, `gpg`.
   Every one with `--help`, a man page and tests.
3. **Chapter 3 content** — four levels, each with `solution.ts` and solvability + anti-shortcut
   tests; replaces the Chapter 3 stubs.
4. **Scoring screen** — an end-of-run summary (per level: time, hints, score) once every level is
   captured, in the terminal and the side panel.
5. **Wrap-up** — README, Definition-of-Done pass, Phase 3 report.

## Chapter 3 — Breaking the Cipher (draft)

| #   | Level             | Teaches                                                        |
| --- | ----------------- | -------------------------------------------------------------- |
| 8   | Fingerprints      | `sha256sum -c` to find the one tampered file; `xxd` to read it  |
| 9   | The Wordlist      | identify a hash type, crack it with `john` and a wordlist       |
| 10  | Sealed Archive    | `openssl enc -d -aes-256-cbc` with the recovered passphrase     |
| 11  | Signed and Sealed | `gpg` import a private key, decrypt the message, verify a sig   |

Rotation/substitution ciphers (`tr 'A-Za-z' 'N-ZA-Mn-za-m'` for ROT13) appear inside these levels
rather than as a level of their own — it is a one-liner, not a puzzle.

## Fidelity conventions (new)

- `md5sum`/`shaNsum` print `<hex>  <file>` (two spaces), `-c` prints `file: OK` / `file: FAILED`
  and a `WARNING: 1 computed checksum did NOT match` summary on stderr, exit 1 on mismatch.
- `xxd` prints `00000000: 4e6f 7661 436f 7270 ...  NovaCorp ...` — offset, 8 space-separated
  2-byte groups, then the ASCII gutter with `.` for non-printables.
- `openssl enc` writes `Salted__` + 8 salt bytes + ciphertext; a wrong password gives
  `bad decrypt` / `error:...:bad decrypt`, exit 1.
- `john` prints the cracked `password (user)` lines and `Session completed`, and `--show` re-prints
  earlier results from the pot file.
