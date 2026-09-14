#!/usr/bin/env python3
"""Merge cover (page 0) + body into the final audit report PDF."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

def normalize(page):
    w, h = float(page.mediabox.width), float(page.mediabox.height)
    if abs(w - A4_W) > 0.2 or abs(h - A4_H) > 0.2:
        page.scale_to(A4_W, A4_H)
    return page

COVER = "/home/z/my-project/scripts/report_assets/zaimem-audit-cover.pdf"
BODY = "/home/z/my-project/scripts/report_assets/zaimem-audit-body.pdf"
OUT = "/home/z/my-project/download/ZaiMem-Security-Audit-Report.pdf"

writer = PdfWriter()
writer.add_page(normalize(PdfReader(COVER).pages[0]))
for p in PdfReader(BODY).pages:
    writer.add_page(normalize(p))
writer.add_metadata({
    "/Title": "ZaiMem Security Audit Report",
    "/Author": "Z.ai",
    "/Creator": "Z.ai",
    "/Subject": "Full security and cybersecurity audit of the ZaiMem MCP server (v1.7.1 to v1.7.2)",
})
with open(OUT, "wb") as f:
    writer.write(f)
print("final:", OUT, "pages:", len(writer.pages))
