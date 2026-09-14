#!/usr/bin/env python3
"""One-off backfill: hash all legacy plaintext User.token rows (v1.7.2 audit).
Sets tokenHash = sha256(token) and blanks the plaintext column."""
import sqlite3, hashlib

DB = "/home/z/my-project/db/custom.db"
c = sqlite3.connect(DB)
rows = c.execute("SELECT id, token FROM User WHERE token IS NOT NULL AND token != ''").fetchall()
migrated = 0
for uid, tok in rows:
    h = hashlib.sha256(tok.encode()).hexdigest()
    clash = c.execute("SELECT id FROM User WHERE tokenHash = ?", (h,)).fetchone()
    if clash:
        # same credential already hashed — just drop the plaintext
        c.execute("UPDATE User SET token = NULL WHERE id = ?", (uid,))
    else:
        c.execute("UPDATE User SET tokenHash = ?, token = NULL WHERE id = ?", (h, uid))
    migrated += 1
c.commit()
left = c.execute("SELECT COUNT(*) FROM User WHERE token IS NOT NULL AND token != ''").fetchone()[0]
print(f"migrated={migrated}  plaintext_remaining={left}")
