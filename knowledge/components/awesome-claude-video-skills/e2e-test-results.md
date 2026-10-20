# Tested end to end — `awesome-claude-video-skills/e2e-test-results`

| Поле | Значение |
|---|---|
| Репозиторий | `awesome-claude-video-skills` (`templates/remotion-components/awesome-claude-video-skills`) |
| Вид | doc |
| Категория | `knowledge-docs` |
| Совместимость с Remotion | unknown |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | CC0 1.0 (LICENSE) на сам список; у каждого проекта своя |

## Что визуализирует

Не рисует; раздел README «🧪 Tested end to end» и «Which one to install».

## Когда использовать

Решение «ставить ли внешний video-skill и какой». Бриф (2026-10-11):
15-секундное промо выдуманного приложения, 5 строк текста, 1920×1080,
30 fps, без ключей к видео/картинкам/голосу, Claude Code (Opus 5.5). 4
проверки: файл играет, длина и размер, все строки читаемы в кадрах дважды в
секунду, картинка движется. Итог по разделу: все 16 и Claude Code без skill
(4.4 мин) прошли; разница — время 2.0–23.5 мин, звук у 9 из 16, свой вид у
10 (на глаз). Рекомендации: explainroo (быстрее всех, свой вид), onetake
(одна непрерывная камера), remotion-dev/skills (надёжный рендер, но вид
близок к дефолту — нужна своя дизайн-идея). Предупреждения: hyperframes —
23.5 мин; motion-graphics (Barty-Bart) — под говорящую голову.

## Фразы из озвучки

- «промо для приложения за 15 секунд»
- «пять строк текста на экране»
- «ролик со звуком и своим стилем»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Нет.

## Исходники и документация

- `templates/remotion-components/awesome-claude-video-skills/README.md` — разделы «Which one to install», «Tested end to end»
- https://github.com/zhuyansen/agent-skills-hub/blob/main/ops/video-runs/RESULTS.md

## Зависимости

Нет.

## Совместимость и адаптация

`unknown`: недостаточно данных — ролики, промпты и скрипты прогона вне
репозитория.

## Паттерны

`comparison`
