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
        ("v1", COL["CONTROL"], "v1"),
        ("v2", "#93c5fd", "v2"),
        ("v3", COL["ADAPTIVE"], "v3"),
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
fig.suptitle("Аналіз чутливості: d (адаптивна − контрольна), 8 повторів × 300 студентів на групу")
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

# 6. v1 vs v2 vs control on held-out seeds: post-test and completion by type.
sub = read("v2_subgroups_heldout.csv")
fig, axes = plt.subplots(1, 2, figsize=(11, 4.2))
for ax, metric, ylabel in [
    (axes[0], "postExpected", "Підсумковий тест (очікуваний бал)"),
    (axes[1], "completed", "Частка тих, хто завершив курс"),
]:
    x = range(len(TYPES))
    ctrl = [float(next(r for r in sub if r["version"] == "v2" and r["type"] == t and r["metric"] == metric)["meanC"]) for t, _ in TYPES]
    v1 = [float(next(r for r in sub if r["version"] == "v1" and r["type"] == t and r["metric"] == metric)["meanA"]) for t, _ in TYPES]
    v2 = [float(next(r for r in sub if r["version"] == "v2" and r["type"] == t and r["metric"] == metric)["meanA"]) for t, _ in TYPES]
    wbar = 0.27
    ax.bar([i - wbar for i in x], ctrl, wbar, color=COL["CONTROL"], label="контрольна")
    ax.bar(list(x), v1, wbar, color="#93c5fd", label="адаптивна v1")
    ax.bar([i + wbar for i in x], v2, wbar, color=COL["ADAPTIVE"], label="адаптивна v2")
    ax.set_xticks(list(x))
    ax.set_xticklabels([lbl for _, lbl in TYPES])
    ax.set_ylabel(ylabel)
    if metric == "postExpected":
        ax.set_ylim(0.5, 0.82)
axes[0].legend(fontsize=9, loc="upper left")
fig.suptitle("v1 і v2 проти контрольної групи (перевірочні повтори 11–20)")
save(fig, "v1-v2-control.png")

# 7. Calibration of the learner model and effect sizes, v1 vs v2.
import json  # noqa: E402

summ = json.load(open(os.path.join(OUT, "summary.json"), encoding="utf-8"))
cal = summ["v2"]["heldOut"]["calibration"]
held = summ["v2"]["heldOut"]
fig, axes = plt.subplots(1, 2, figsize=(10, 3.8))
axes[0].bar(["v1", "v2"], [cal["v1"]["pooledCorrAdaptive"], cal["v2"]["pooledCorrAdaptive"]], color=["#93c5fd", COL["ADAPTIVE"]])
axes[0].set_ylabel("r (оцінка засвоєння vs справжні знання)")
axes[0].set_title("Точність моделі студента")
for i, key in enumerate(["v1", "v2"]):
    axes[0].text(i, cal[key]["pooledCorrAdaptive"] + 0.01, f"{cal[key]['pooledCorrAdaptive']:.2f}\nRMSE {cal[key]['rmseAdaptive']:.3f}", ha="center", fontsize=9)
axes[0].set_ylim(0, 0.6)
labels_m = [("postExpected", "підсумк. тест"), ("gain", "приріст"), ("completed", "завершення")]
for j, (ver, color) in enumerate([("v1", "#93c5fd"), ("v2", COL["ADAPTIVE"])]):
    ds = [held[ver][m]["d"] for m, _ in labels_m]
    lo = [held[ver][m]["d"] - held[ver][m]["dLo"] for m, _ in labels_m]
    hi = [held[ver][m]["dHi"] - held[ver][m]["d"] for m, _ in labels_m]
    axes[1].errorbar([k + (j - 0.5) * 0.25 for k in range(3)], ds, yerr=[lo, hi], fmt="o", color=color, capsize=3, label=ver)
axes[1].axhline(0, color="black", lw=0.8)
axes[1].set_xticks(range(3))
axes[1].set_xticklabels([lbl for _, lbl in labels_m])
axes[1].set_ylabel("Cohen's d проти контролю (95 % ДІ)")
axes[1].set_title("Ефект на перевірочних повторах")
axes[1].legend(fontsize=9)
save(fig, "v1-v2-calibration-effects.png")


# 8. v1 / v2 / v3 vs control on the fresh seeds 20–39 and in the robustness model.
def effects(name):
    rows = read(name)
    out = {}
    for ver in ["v1", "v2", "v3"]:
        for m in ["postExpected", "gain", "completed"]:
            r = next(x for x in rows if x["version"] == ver and x["metric"] == m)
            out[(ver, m)] = (float(r["d"]), float(r["dLo"]), float(r["dHi"]))
    return out


fig, axes = plt.subplots(1, 2, figsize=(11, 4), sharey=True)
mets = [("postExpected", "підсумк. тест"), ("gain", "приріст"), ("completed", "завершення")]
vcol = {"v1": "#cbd5e1", "v2": "#93c5fd", "v3": COL["ADAPTIVE"]}
for ax, (name, title) in zip(
    axes,
    [("v3_eval_vs_control.csv", "Основна модель (повтори 20–39)"),
     ("v3_robustness_vs_control.csv", "Альтернативна модель (стійкість)")],
):
    eff = effects(name)
    for j, ver in enumerate(["v1", "v2", "v3"]):
        xs = [k + (j - 1) * 0.25 for k in range(3)]
        ds = [eff[(ver, m)][0] for m, _ in mets]
        lo = [eff[(ver, m)][0] - eff[(ver, m)][1] for m, _ in mets]
        hi = [eff[(ver, m)][2] - eff[(ver, m)][0] for m, _ in mets]
        ax.errorbar(xs, ds, yerr=[lo, hi], fmt="o", color=vcol[ver], capsize=3, label=ver)
    ax.axhline(0, color="black", lw=0.8)
    ax.set_xticks(range(3))
    ax.set_xticklabels([lbl for _, lbl in mets])
    ax.set_title(title)
axes[0].set_ylabel("Cohen's d проти контролю (95 % ДІ)")
axes[0].legend(fontsize=9)
save(fig, "v3-fresh-and-robustness.png")
