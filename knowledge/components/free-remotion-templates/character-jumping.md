# Jumping Character — `free-remotion-templates/character-jumping`

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

Простой SVG-персонаж (голова, тело, ноги, глаза, улыбка) прыгает несколько
раз со squash-and-stretch, тень на земле сжимается в полёте, в верхней точке
вокруг кружат искры; внизу подпись.

## Когда использовать

Радость, победа, «поехали!», мотивация, лёгкий игривый акцент между
серьёзными блоками. Для делового тона — не подходит.

## Фразы из озвучки

- «ура, у нас получилось!»
- «поехали!»
- «команда на подъёме»

## Визуальный стиль

Светло-голубой фон, голубой персонаж `#0ea5e9`, жёлтые искры; детский
плоский стиль; системный sans-serif. В Root: 1080×1080, 120 кадров.

## Входные данные

`CharacterJumpingProps`: `backgroundColor` (`#e0f2fe`), `characterColor`,
`shadowColor`, `accentColor`, `groundColor`, `label` («Let's Go!»),
`textColor`, `jumpCount: number` (3).

## Анимации

Период прыжка `round((DURATION_FRAMES - 8) / jumpCount)` с кадра 8;
высота — парабола `-4t²+4t`; растяжение по Y в полёте, сжатие при приземлении
(`interpolate` по высоте). Вход: `spring` снизу. Подпись: `spring` с кадра 4.
Искры при `rawJump > 0.88`, вращение по `frame*0.2`.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/character-jumping/CharacterJumping.tsx`
- `templates/remotion-components/free-remotion-templates/README.md`

## Зависимости

`remotion`, `react`.

## Совместимость и адаптация

`native`. Период считается от константы `DURATION_FRAMES = 120`, а не от
`useVideoConfig().durationInFrames` — при другой длине композиции заменить.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
