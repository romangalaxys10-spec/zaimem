#!/usr/bin/env python3
"""Set GitHub Actions secrets for the Vercel auto-deploy pipeline (Task 12).

Usage: VERCEL_TOKEN=vcp_... python3 scripts/set-vercel-secrets.py
(The Vercel token is supplied via env — GitHub push protection blocks hardcoded tokens.)
"""
import base64
import json
import os
import subprocess
import sys

from nacl import encoding, public

REPO = "romangalaxys10-spec/zaimem"
VERCEL_TOKEN = os.environ["VERCEL_TOKEN"]  # never hardcode; export before running
ORG_ID = "team_kySCrU1jp0BBI2srgQ9vTTMw"
PROJECT_ID = "prj_UMGlyYzT8CPz0zvE5SOeaLJjKwoS"


def gh(url: str):
    token = subprocess.run(
        ["git", "remote", "get-url", "origin"], capture_output=True, text=True, cwd="/home/z/my-project"
    ).stdout.strip()
    token = token.split("x-access-token:")[1].split("@")[0]
    out = subprocess.run(
        ["curl", "-s", "-H", f"Authorization: Bearer {token}", url],
        capture_output=True, text=True,
    ).stdout
    return json.loads(out)


def put_secret(name: str, value: str, pk_obj: public.PublicKey) -> str:
    sealed = public.SealedBox(pk_obj).encrypt(value.encode())
    token = subprocess.run(
        ["git", "remote", "get-url", "origin"], capture_output=True, text=True, cwd="/home/z/my-project"
    ).stdout.strip()
    token = token.split("x-access-token:")[1].split("@")[0]
    body = json.dumps({"encrypted_value": base64.b64encode(sealed).decode(), "key_id": KEY_ID})
    res = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", "PUT",
         "-H", f"Authorization: Bearer {token}",
         "-H", "Content-Type: application/json",
         "-d", body, f"https://api.github.com/repos/{REPO}/actions/secrets/{name}"],
        capture_output=True, text=True,
    ).stdout
    return res


pk_resp = gh(f"https://api.github.com/repos/{REPO}/actions/secrets/public-key")
KEY_ID = pk_resp["key_id"]
pk_obj = public.PublicKey(pk_resp["key"].encode(), encoding.Base64Encoder())
print(f"repo public key: {KEY_ID}")

for name, value in [
    ("VERCEL_TOKEN", VERCEL_TOKEN),
    ("VERCEL_ORG_ID", ORG_ID),
    ("VERCEL_PROJECT_ID", PROJECT_ID),
]:
    status = put_secret(name, value, pk_obj)
    print(f"{name}: HTTP {status} {'OK' if status == '201' or status == '204' else 'FAIL'}")
    if status not in ("201", "204"):
        sys.exit(1)

print("all secrets set")
