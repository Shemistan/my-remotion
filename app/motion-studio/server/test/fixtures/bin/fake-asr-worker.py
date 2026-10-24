"""Фейковый ASR-воркер (Task 26) — только для юнит-тестов логики, не для e2e.

Аргументы — как у asr_worker.py ai-platform. Поведение задаёт `modes/<ключ>.json` рядом со
скриптом (тест копирует скрипт в tmp-«ai-platform»); ключ — каталог в пути `--audio` (id исходника),
поэтому режим у каждого теста свой и поздний воркер чужого теста его не прочитает. Нет файла —
обычный успешный вывод.
  stdout: [строки]       — печатать до работы (по умолчанию `PROGRESS 0.0 загрузка модели`)
  ignore_term: true      — игнорировать SIGTERM
  hang: true             — висеть (после stdout); сирота (родитель умер, ppid = 1) выходит сразу,
                           в любом случае — не дольше HANG_DEADLINE_S
  stderr: "…", exit: N   — написать в stderr и выйти с кодом N
  raw: "…"               — записать в --out этот текст как есть
  output: {…}            — записать этот JSON (duration "auto" — длительность wav)
  no_out: true           — выйти с 0, ничего не записав
Каждый вызов дописывает в `calls.jsonl` рядом: pid, ключ режима, argv, имена переменных окружения.
"""

import argparse
import json
import os
import signal
import sys
import time
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
# висящий воркер не переживает тест: жёсткий дедлайн, даже если родитель жив
HANG_DEADLINE_S = 120.0


def mode_for(audio: str) -> tuple[str, dict]:
    """Режим теста: `modes/<каталог из пути --audio>.json` (ближайший к файлу)."""
    for part in reversed(Path(audio).parts[:-1]):
        f = HERE / "modes" / f"{part}.json"
        if f.exists():
            return part, json.loads(f.read_text(encoding="utf-8"))
    return "", {}


def main() -> int:
    p = argparse.ArgumentParser()
    for a in ("--kind", "--model", "--audio", "--out"):
        p.add_argument(a, required=True)
    p.add_argument("--language", default="ru")
    p.add_argument("--splits", default="")
    p.add_argument("--hotwords", default="")
    p.add_argument("--aligner")
    args = p.parse_args()
    started = time.monotonic()
    key, cfg = mode_for(args.audio)
    with open(HERE / "calls.jsonl", "a", encoding="utf-8") as fh:
        fh.write(json.dumps({"pid": os.getpid(), "key": key, "argv": sys.argv[1:], "env": sorted(os.environ), "cwd": os.getcwd()}) + "\n")
    if cfg.get("ignore_term"):
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
    for line in cfg.get("stdout", ["PROGRESS 0.0 загрузка модели"]):
        print(line, flush=True)
    if cfg.get("hang"):
        # родитель (процесс теста) убит — выходим: иначе сирота висит после kill -9 vitest
        while os.getppid() != 1 and time.monotonic() - started < HANG_DEADLINE_S:
            time.sleep(0.1)
        return 3
    if "stderr" in cfg:
        sys.stderr.write(cfg["stderr"])
        sys.stderr.flush()
    if cfg.get("exit"):
        return int(cfg["exit"])
    if cfg.get("no_out"):
        return 0
    with wave.open(args.audio, "rb") as fh:
        duration = fh.getnframes() / fh.getframerate()
    if "raw" in cfg:
        Path(args.out).write_text(cfg["raw"], encoding="utf-8")
    else:
        out = cfg.get("output") or {
            "language": args.language,
            "duration": "auto",
            "elapsed_s": 0.5,
            "words": [{"w": "Привет.", "s": 0.12, "e": 0.5}, {"w": "Мир", "s": 0.6, "e": 0.9}, {"w": "пользователей.", "s": 3.2, "e": 3.9}],
        }
        if out.get("duration") == "auto":
            out["duration"] = round(duration, 3)
        Path(args.out).write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print("PROGRESS 100.0 кусок 1 из 1", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
