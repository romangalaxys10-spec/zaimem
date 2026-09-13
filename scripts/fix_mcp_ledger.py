path = "/home/z/my-project/src/lib/zaimem/mcp.ts"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

# Fix 1: ledger write — normalize sessionId to "" instead of null
old1 = '''      const sessionId = str("session_id") ?? null;
      const page = await db.ledgerPage.upsert({
        where: { userId_sessionId_path: { userId, sessionId: sessionId ?? "", path } },
        update: { content: finalContent, updatedAt: new Date() },
        create: { userId, sessionId, path, content: finalContent },
      });'''
new1 = '''      // normalize: empty string = global page (avoids null-in-unique-index issues)
      const sidW = str("session_id") ?? "";
      const page = await db.ledgerPage.upsert({
        where: { userId_sessionId_path: { userId, sessionId: sidW, path } },
        update: { content: finalContent, updatedAt: new Date() },
        create: { userId, sessionId: sidW, path, content: finalContent },
      });'''
assert old1 in src, "ledger write block not found"
src = src.replace(old1, new1)

# Fix 2: ledger read — same normalization
old2 = '''      const sessionId = str("session_id") ?? null;
      const page = await db.ledgerPage.findUnique({
        where: { userId_sessionId_path: { userId, sessionId: sessionId ?? "", path } },
      });'''
new2 = '''      const sidR = str("session_id") ?? "";
      const page = await db.ledgerPage.findUnique({
        where: { userId_sessionId_path: { userId, sessionId: sidR, path } },
      });'''
assert old2 in src, "ledger read block not found"
src = src.replace(old2, new2)

with open(path, "w", encoding="utf-8") as f:
    f.write(src)

print("OK - both ledger blocks normalized")
