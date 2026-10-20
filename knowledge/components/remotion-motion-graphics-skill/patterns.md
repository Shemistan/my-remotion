# Working patterns — `remotion-motion-graphics-skill/patterns`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-motion-graphics-skill` (`templates/remotion-components/remotion-motion-graphics-skill`) |
| Вид | doc |
| Категория | `knowledge-docs` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, README) |

## Что визуализирует

Не рисует; документ с рабочими шаблонами кода для моушн-графики.

## Когда использовать

Новый графический элемент — копировать форму, а не вспоминать API. Разделы:

- **скелет композиции**: `xxxSchema` (zod, `zColor()` даёт пипетку в Studio),
  `xxxDefaultProps`, компонент, регистрация в `Root.tsx`; размеры от
  `height`/`width`;
- **enter/hold/exit**: `enter = spring({frame, fps, config: {damping: 14, stiffness: 120}})`,
  `exit` — последние 0.5 с с `Easing.in(Easing.quad)`; opacity/scale/y из пары;
- **spring**: damping 8–12 бодро, 20+ гладко, 200 без перелёта; антиципация;
- **stagger**: `delay = i * 4`, выход тем же порядком, `inline-block`;
- **прозрачный оверлей** — пример `remotion-motion-graphics-skill/badge-overlay`;
- **анимированное число**: `spring` damping 200 за `sec(1.2)`, `Math.round`,
  поп `1 + 0.08 * pop * (1 - pop)`, tabular-nums;
- **auto-fit**: `fitText` из `@remotion/layout-utils`, потолок `height*0.12`;
- **звук**: `<Sequence from={sec(0.5)}><Audio … volume={0.6}/></Sequence>`,
  `volume` функцией кадра;
- **шрифты**: Google или локальный, один общий модуль `fonts.ts`;
- **сцены**: `<Series>`, перекрытие `offset={-sec(0.3)}` или
  `@remotion/transitions`; постоянный фон — вне `Series`.

## Фразы из озвучки

- «число докручивается до итога и подпрыгивает»
- «три пункта появляются один за другим»
- «название выезжает и уезжает в конце»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

См. выше.

## Исходники и документация

- `templates/remotion-components/remotion-motion-graphics-skill/skills/remotion-motion-graphics/references/patterns.md`

## Зависимости

`remotion`, `zod`, `@remotion/zod-types`, `@remotion/google-fonts`,
`@remotion/fonts`, `@remotion/layout-utils`, `@remotion/transitions`.

## Совместимость и адаптация

Нет; документ. Шаблоны используют `config.ts` (`CANVAS`, `sec`,
`SAFE_MARGIN`) и `fonts.ts` (`FONT_FAMILY`) из `scaffold`. Примечание: здесь
`Audio` импортируется из `remotion`, а официальные skills советуют
`@remotion/media`.

## Паттерны

`quantities`, `sequence-steps`, `key-point-emphasis`
