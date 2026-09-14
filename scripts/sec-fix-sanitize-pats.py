#!/usr/bin/env python3
"""
Security fix C1 — remove real GitHub PATs from e2e scripts.

Replaces every ghp_... literal in scripts/e2e-test.ts and
scripts/e2e-github-unit.ts with a deterministic, local-only dummy token:
  - e2e-test.ts line ~268 ("pair with invalid PAT"): any unknown token gets
    401 from GitHub (or 502 when offline) — check tolerates both.
  - e2e-test.ts import block: runs against a LOCAL mock GitHub server that
    ignores the PAT value — only needs >= 20 chars.
  - e2e-github-unit.ts: local mock compares equality; all occurrences get
    the same dummy, so behaviour is unchanged.
"""
import re, pathlib, sys

ROOT = pathlib.Path("/home/z/my-project")
DUMMY = "ghp_zaimem_e2e_local_only_0000000000"  # 36 chars, fake, local-only
PAT_RE = re.compile(r"ghp_[A-Za-z0-9_]{20,}")

changed = {}
for rel in ["scripts/e2e-test.ts", "scripts/e2e-github-unit.ts"]:
    p = ROOT / rel
    src = p.read_text()
    matches = PAT_RE.findall(src)
    out = PAT_RE.sub(DUMMY, src)
    # annotate: make the local-only nature explicit right at first use site
    p.write_text(out)
    changed[rel] = len(matches)

# guard: no ghp_ tokens remain anywhere in scripts/ or src/ (dummy excepted)
leftover = []
for p in list(ROOT.glob("scripts/*.ts")) + list((ROOT / "src").rglob("*.ts*")):
    hits = [m for m in PAT_RE.findall(p.read_text(errors="ignore")) if m != DUMMY]
    if hits:
        leftover.append((str(p), hits[:3]))

print("replaced:", changed)
print("leftover real-looking tokens:", leftover or "NONE")
sys.exit(1 if leftover else 0)
