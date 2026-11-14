"""Charts for docs/performance.md from perf/results/*.json (matplotlib).

Usage: python perf/charts.py   (writes docs/performance/*.png)
"""
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parent
RES = ROOT / "results"
OUT = ROOT.parent / "docs" / "performance"
OUT.mkdir(parents=True, exist_ok=True)

plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "figure.dpi": 150})

NAMES = {
    "health": "Health-check",
    "catalog": "Каталог (анонімно)",
    "student": "Студент",
    "teacher": "Викладач",
    "chat": "Чат (REST)",
    "file": "Файл 200 КБ",
}


def load(name):
    return json.loads((RES / f"{name}.json").read_text())


def throughput_and_latency():
    data = load("load-local")["scenarios"]
    fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4))
    for key, sc in data.items():
        c = [r["connections"] for r in sc["levels"]]
        a.plot(c, [r["rps"] for r in sc["levels"]], marker="o", label=NAMES.get(key, key))
        b.plot(c, [r["p99"] for r in sc["levels"]], marker="o", label=NAMES.get(key, key))
    a.set(title="Пропускна здатність", xlabel="Одночасні з’єднання", ylabel="Запитів/с")
    b.set(title="Затримка p99", xlabel="Одночасні з’єднання", ylabel="мс", yscale="log")
    for ax in (a, b):
        ax.grid(alpha=0.3)
        ax.set_xscale("log")
        ax.set_xticks([1, 10, 25, 50, 100], ["1", "10", "25", "50", "100"])
    a.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT / "load-local.png")


def teacher_before_after():
    before = load("load-local-before")["scenarios"]
    after = load("load-local")["scenarios"]
    fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4))
    for key, color in (("teacher", "tab:red"), ("student", "tab:blue")):
        for src, style, label in ((before, "--", "до"), (after, "-", "після")):
            lv = src[key]["levels"]
            c = [r["connections"] for r in lv]
            a.plot(c, [r["rps"] for r in lv], style, marker="o", color=color, label=f"{NAMES[key]} — {label}")
            b.plot(c, [r["p50"] for r in lv], style, marker="o", color=color, label=f"{NAMES[key]} — {label}")
    a.set(title="Пропускна здатність до/після оптимізації", xlabel="З’єднання", ylabel="Запитів/с")
    b.set(title="Медіана затримки до/після", xlabel="З’єднання", ylabel="мс", yscale="log")
    for ax in (a, b):
        ax.grid(alpha=0.3)
        ax.set_xscale("log")
        ax.set_xticks([1, 10, 25, 50, 100], ["1", "10", "25", "50", "100"])
    a.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT / "before-after-scenarios.png")


def endpoints_scaled():
    before = {e["name"]: e for e in load("endpoints-before")["endpoints"]}
    after = {e["name"]: e for e in load("endpoints-after")["endpoints"]}
    names = [n for n in before if n in after]
    labels = {
        "catalog": "Каталог",
        "dashboard": "Кабінет студента",
        "course": "Курс",
        "adaptiveMe": "Адаптація: мій прогрес",
        "recommendations": "Рекомендації",
        "chatMessages": "Повідомлення чату",
        "gradebook": "Журнал оцінок",
        "analytics": "Аналітика курсу",
        "adaptiveOverview": "Адаптація: огляд",
    }
    fig, ax = plt.subplots(figsize=(9, 4.5))
    y = range(len(names))
    ax.barh([i + 0.2 for i in y], [before[n]["seqP50"] for n in names], 0.4, label="до", color="#e57373")
    ax.barh([i - 0.2 for i in y], [after[n]["seqP50"] for n in names], 0.4, label="після", color="#4c8bf5")
    ax.set_yticks(list(y), [labels.get(n, n) for n in names])
    ax.set_xscale("log")
    ax.set(title="Медіана відповіді, 1 000 студентів на курс (1 користувач)", xlabel="мс (логарифмічна шкала)")
    for i, n in enumerate(names):
        ax.text(after[n]["seqP50"], i - 0.2, f" {after[n]['seqP50']}", va="center", fontsize=8)
        ax.text(before[n]["seqP50"], i + 0.2, f" {before[n]['seqP50']}", va="center", fontsize=8)
    ax.legend()
    ax.grid(axis="x", alpha=0.3)
    fig.tight_layout()
    fig.savefig(OUT / "endpoints-1000-students.png")


def realtime_and_flow():
    sock = load("socket-local")["levels"]
    flow = load("flow-local")["levels"]
    fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4))
    k = [r["senders"] for r in sock]
    a.plot(k, [r["deliveryP50"] for r in sock], marker="o", label="p50")
    a.plot(k, [r["deliveryP95"] for r in sock], marker="o", label="p95")
    a.plot(k, [r["deliveryP99"] for r in sock], marker="o", label="p99")
    a.set(title="Чат Socket.IO: доставка повідомлення", xlabel="Одночасні відправники", ylabel="мс")
    u = [r["users"] for r in flow]
    b.plot(u, [r["submitP50"] for r in flow], marker="o", label="надсилання тесту p50")
    b.plot(u, [r["submitP95"] for r in flow], marker="o", label="надсилання тесту p95")
    b.plot(u, [r["startP50"] for r in flow], marker="o", label="старт тесту p50")
    b2 = b.twinx()
    b2.bar(u, [r["flowsPerSec"] for r in flow], alpha=0.15, color="gray", width=0.8)
    b2.set_ylabel("Проходжень тесту/с (стовпці)")
    b.set(title="Проходження тесту (старт → надсилання)", xlabel="Одночасні студенти", ylabel="мс")
    for ax in (a, b):
        ax.grid(alpha=0.3)
        ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT / "realtime-and-tests.png")


def production():
    prod = load("prod")["scenarios"]
    fig, ax = plt.subplots(figsize=(6.5, 3.8))
    for key, rows in prod.items():
        c = [r["connections"] for r in rows]
        ax.plot(c, [r["p50"] for r in rows], marker="o", label=f"{NAMES.get(key, key)} p50")
        ax.plot(c, [r["p90"] for r in rows], "--", marker="o", label=f"{NAMES.get(key, key)} p90")
    ax.set(title="Хмара (Render free + Neon): затримка", xlabel="Одночасні з’єднання", ylabel="мс")
    ax.grid(alpha=0.3)
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT / "production.png")


if __name__ == "__main__":
    throughput_and_latency()
    teacher_before_after()
    endpoints_scaled()
    realtime_and_flow()
    production()
    print("charts in", OUT)
