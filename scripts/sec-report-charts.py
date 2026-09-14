#!/usr/bin/env python3
"""Audit report charts — donut (severity mix) + horizontal bar (findings by area).
Follows typesetting/charts.md: donut hole 0.65, no top/right spines, dashed grid,
legend outside plot area, muted palette-family colors."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.font_manager as fm
fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
import matplotlib.pyplot as plt
plt.rcParams['font.sans-serif'] = ['DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

OUT = "/home/z/my-project/scripts/report_assets"
import os
os.makedirs(OUT, exist_ok=True)

# Palette (cascade, muted semantic variants for severity)
C_CRIT, C_HIGH, C_MED, C_LOW = "#914942", "#a38241", "#46819e", "#b9ccd5"
C_TEXT, C_MUTED, C_GRID = "#1e2022", "#71777a", "#b9ccd5"

# ── Chart 1: severity donut ────────────────────────────────────────────────
sev = [("Critical", 2, C_CRIT), ("High", 3, C_HIGH), ("Medium", 5, C_MED), ("Low", 4, C_LOW)]
fig, ax = plt.subplots(figsize=(7.0, 3.4), constrained_layout=True)
values = [s[1] for s in sev]
colors_ = [s[2] for s in sev]
wedges, _ = ax.pie(
    values, colors=colors_, startangle=90, counterclock=False,
    wedgeprops=dict(width=0.35, edgecolor="white", linewidth=2),
)
ax.text(0, 0.06, "14", ha="center", va="center", fontsize=26, fontweight="bold", color=C_TEXT)
ax.text(0, -0.24, "findings", ha="center", va="center", fontsize=10, color=C_MUTED)
labels = [f"{name} — {n}" for name, n, _ in sev]
ax.legend(wedges, labels, loc="center left", bbox_to_anchor=(1.02, 0.5),
          frameon=False, fontsize=11, handlelength=1.0, handleheight=1.0)
ax.set(aspect="equal")
fig.savefig(f"{OUT}/severity_donut.png", dpi=200)
plt.close(fig)

# ── Chart 2: findings by area (horizontal bar) ─────────────────────────────
areas = [
    ("HTTP hardening & config", 3, C_MED),
    ("Auth & credential mgmt", 4, C_CRIT),
    ("Supply chain (deps)", 2, C_HIGH),
    ("API abuse resistance", 2, C_HIGH),
    ("Runtime & resources", 1, C_MED),
    ("Transport & access (CORS)", 1, C_MED),
    ("Information disclosure", 1, C_MED),
]
areas.sort(key=lambda x: x[1])
names = [a[0] for a in areas]
vals = [a[1] for a in areas]
cols = [a[2] for a in areas]
fig, ax = plt.subplots(figsize=(7.0, 3.2), constrained_layout=True)
bars = ax.barh(names, vals, color=cols, height=0.62, edgecolor="none")
for sp in ("top", "right", "left"):
    ax.spines[sp].set_visible(False)
ax.spines["bottom"].set_color(C_GRID)
ax.spines["bottom"].set_linewidth(0.8)
ax.tick_params(axis="y", length=0, labelsize=10.5, colors=C_TEXT)
ax.tick_params(axis="x", labelsize=9, colors=C_MUTED)
ax.set_xticks([0, 1, 2, 3, 4])
ax.grid(axis="x", linestyle="--", linewidth=0.5, alpha=0.2, color=C_TEXT)
ax.set_axisbelow(True)
for b, v in zip(bars, vals):
    ax.text(v + 0.07, b.get_y() + b.get_height() / 2, str(v),
            va="center", ha="left", fontsize=10.5, color=C_TEXT, fontweight="bold")
ax.set_xlim(0, 4.6)
fig.savefig(f"{OUT}/area_bar.png", dpi=200)
plt.close(fig)
print("charts written:", os.listdir(OUT))
