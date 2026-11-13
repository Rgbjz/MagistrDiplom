"""Charts for the simulation study (docs/experiment/*.png).

Reads backend/scripts/simulation/out/*.csv produced by `npm run sim`.
    python scripts/simulation/plot.py
"""
import csv
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
DOCS = os.path.normpath(os.path.join(HERE, "..", "..", "..", "docs", "experiment"))
os.makedirs(DOCS, exist_ok=True)

plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11, "figure.dpi": 150})
COL = {"ADAPTIVE": "#2563eb", "CONTROL": "#9ca3af"}
TYPES = [("weak", "слабкі"), ("average", "середні"), ("strong", "сильні")]


def read(name):
    with open(os.path.join(OUT, name), encoding="utf-8") as f:
        return list(csv.DictReader(f))


def save(fig, name):
    fig.tight_layout()
    fig.savefig(os.path.join(DOCS, name))
    plt.close(fig)
    print("saved", name)


raw = read("raw_primary.csv")

# 1. Post-test distribution by learner type and group (box plot).
fig, ax = plt.subplots(figsize=(8, 4.5))
data, pos, colors = [], [], []
for i, (t, _) in enumerate(TYPES):
    for j, g in enumerate(["CONTROL", "ADAPTIVE"]):
        data.append([float(r["postExpected"]) for r in raw if r["type"] == t and r["policy"] == g])
        pos.append(i * 3 + j)
        colors.append(COL[g])
bp = ax.boxplot(data, positions=pos, widths=0.8, patch_artist=True, showfliers=False)
for patch, c in zip(bp["boxes"], colors):
    patch.set_facecolor(c)
ax.set_xticks([i * 3 + 0.5 for i in range(3)])
ax.set_xticklabels([label for _, label in TYPES])
ax.set_ylabel("Підсумковий тест (очікуваний бал)")
ax.set_title("Підсумковий тест за типом студента (модуль у поточному вигляді)")
ax.legend([bp["boxes"][0], bp["boxes"][1]], ["контрольна", "адаптивна"], loc="lower right")
save(fig, "post-test-by-type.png")

# 2. Per-seed effect sizes (20 replications).
seeds = read("per_seed.csv")
fig, ax = plt.subplots(figsize=(8, 4))
ds = [float(s["d"]) for s in seeds]
ax.scatter(range(1, len(ds) + 1), ds, color=COL["ADAPTIVE"], label="усі студенти")
ax.scatter(range(1, len(ds) + 1), [float(s["dWeak"]) for s in seeds], color="#dc2626", marker="x", label="слабкі")
ax.axhline(0, color="black", lw=0.8)
ax.set_xlabel("Повтор експерименту (seed)")
ax.set_ylabel("Cohen's d (адаптивна − контрольна)")
ax.set_title("Розмір ефекту в 20 незалежних повторах")
ax.legend()
save(fig, "effect-per-seed.png")

# 3. Ablations: d with 95 % CI, overall and by type.
abl = read("ablations.csv")
labels = {
    "module (deployed)": "модуль (поточний)",
    "evidence gate": "фільтр доказів",
    "soft gating (reviewCap = 2)": "м'яке блокування",
    "evidence gate + soft gating": "фільтр + м'яке блок.",
    "per-topic Elo mastery + gate": "Ело за темами + фільтр",
    "Elo mastery + gate + soft gating": "Ело + фільтр + м'яке",
}
fig, ax = plt.subplots(figsize=(9, 4.8))
y = list(range(len(abl)))[::-1]
for yi, r in zip(y, abl):
    d, lo, hi = float(r["d"]), float(r["dLo"]), float(r["dHi"])
    h_all = ax.errorbar(d, yi, xerr=[[d - lo], [hi - d]], fmt="o", color=COL["ADAPTIVE"], capsize=3)
    h_weak = ax.scatter(float(r["d_weak"]), yi - 0.2, color="#dc2626", marker="x")
    h_strong = ax.scatter(float(r["d_strong"]), yi + 0.2, color="#16a34a", marker="^")
ax.set_yticks(y)
ax.set_yticklabels([labels.get(r["scenario"], r["scenario"]) for r in abl])
ax.axvline(0, color="black", lw=0.8)
ax.set_xlabel("Cohen's d підсумкового тесту (95 % ДІ — для всіх)")
ax.set_title("Абляції: що змінює ефект адаптації")
ax.legend([h_all, h_weak, h_strong], ["усі (95 % ДІ)", "слабкі", "сильні"], loc="lower left", fontsize=9)
save(fig, "ablations.png")

# 4. Sensitivity: one panel per parameter, deployed vs improved variant.
sens = read("sensitivity.csv")
params = []
for r in sens:
    if r["param"] not in params:
        params.append(r["param"])
names = {
    "τ (mastery threshold)": "поріг засвоєння τ",
    "α (EWMA rate)": "швидкість моделі α",
    "learning rate ×": "швидкість навчання ×",
    "forgetting φ (1/min)": "забування φ, ×10⁻³ 1/хв",
    "time budget (min)": "бюджет часу, хв",
    "testing effect": "ефект тестування",
}
fig, axes = plt.subplots(2, 3, figsize=(12, 6.5), sharey=True)
for ax, p in zip(axes.flat, params):
    for scen, color, label in [
        ("module (deployed)", COL["CONTROL"], "поточний модуль"),
        ("evidence gate + soft gating", COL["ADAPTIVE"], "вдосконалений"),
    ]:
        rows = [r for r in sens if r["param"] == p and r["scenario"] == scen]
        scale = 1000 if p.startswith("forgetting") else 1
        xs = [float(r["value"]) * scale for r in rows]
        ax.plot(xs, [float(r["d"]) for r in rows], "o-", color=color, label=label)
        ax.fill_between(xs, [float(r["dLo"]) for r in rows], [float(r["dHi"]) for r in rows], color=color, alpha=0.15)
    ax.axhline(0, color="black", lw=0.8)
    ax.set_title(names.get(p, p))
axes[0][0].set_ylabel("Cohen's d")
axes[1][0].set_ylabel("Cohen's d")
axes[0][0].legend(fontsize=9)
fig.suptitle("Аналіз чутливості (8 повторів × 300 студентів на групу)")
save(fig, "sensitivity.png")

# 5. Action profile of the adaptive policy (what the module recommends).
acts = read("actions.csv")
keys = [("NEXT", "наступний урок"), ("REVIEW", "повторення"), ("RETRY_TEST", "перескладання"),
        ("CHALLENGE", "складніші питання"), ("PRACTICE", "практика"), ("SKIP_AHEAD", "пропуск")]
fig, ax = plt.subplots(figsize=(8, 4))
left = [0.0, 0.0, 0.0]
ad = [r for r in acts if r["policy"] == "ADAPTIVE"]
cmap = plt.get_cmap("tab10")
for i, (k, label) in enumerate(keys):
    vals = [float(r[k]) for r in ad]
    ax.barh([lbl for _, lbl in TYPES], vals, left=left, color=cmap(i), label=label)
    left = [a + b for a, b in zip(left, vals)]
ax.set_xlabel("Середня кількість дій за курс")
ax.set_title("Дії студентів адаптивної групи (поточний модуль)")
ax.legend(fontsize=8, loc="lower right")
save(fig, "adaptive-actions.png")
