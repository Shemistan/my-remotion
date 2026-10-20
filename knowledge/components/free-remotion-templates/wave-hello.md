# Waving Hello — `free-remotion-templates/wave-hello`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `icons-shapes` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

SVG-человечек выезжает снизу, слегка покачивается и машет правой рукой;
справа выезжает крупное приветствие и подзаголовок.

## Когда использовать

Начало ролика, приветствие, онбординг нового пользователя, «знакомьтесь».
Для логотипного интро — шаблоны Logo & Brand.

## Фразы из озвучки

- «привет! рады вас видеть»
- «добро пожаловать в команду»
- «давайте знакомиться»

## Визуальный стиль

Светло-голубой фон `#e0f2fe`, жёлтая «кожа», синее тело; дружелюбный
плоский стиль; системный sans-serif. В Root: 1080×1080, 90 кадров.

## Входные данные

`WaveHelloProps`: `backgroundColor` (`#e0f2fe`), `skinColor` (`#fbbf24`),
`bodyColor` (`#3b82f6`), `accentColor` (`#1d4ed8`), `textColor`, `title`
(«Hello!»), `subtitle` («Welcome aboard»).

## Анимации

Вход: `spring` (damping 12) → смещение по Y. После входа — покачивание
`sin((frame-18)*0.22)`. Рука с кадра 10: угол `interpolate(sin((frame-10)*0.3),
[-1,1], [-25,50])` вокруг плеча. Текст: `spring` с кадра 30, translateX 50→0.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/wave-hello/WaveHello.tsx`
- `templates/remotion-components/free-remotion-templates/README.md`

## Зависимости

`remotion`, `react`.

## Совместимость и адаптация

`native`, адаптации не нужны. Покачивание включается по условию
`charIn >= 0.99`, поэтому возможен микро-скачок в момент включения.

## Паттерны

`key-point-emphasis`
