# BadgeOverlay — `remotion-motion-graphics-skill/badge-overlay`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-motion-graphics-skill` (`templates/remotion-components/remotion-motion-graphics-skill`) |
| Вид | example |
| Категория | `layout-templates` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, README) |

## Что визуализирует

Скруглённая пилюля-бейдж в левом верхнем углу (внутри безопасного поля): слева
пульсирующая красная точка, справа жирная подпись. Въезжает пружиной с
масштабом от левого края, в конце уходит с уменьшением. Фон композиции
прозрачный.

## Когда использовать

Метка поверх футажа: «LIVE», «новое», рубрика, тег темы. Экспорт с альфой в
монтажку. Для полноэкранного заголовка — TitleCard из scaffold, для имени
спикера — LowerThird (кода в репозитории нет).

## Фразы из озвучки

- «в прямом эфире»
- «новая рубрика»
- «эксклюзивно для подписчиков»

## Визуальный стиль

Плоский, чистый: цвет `badgeColor`, радиус `height*0.06`, отступы
`height*0.014 / 0.028`, точка `#e0525c` диаметром `height*0.018`, текст
`fontWeight 700`, `fontSize height*0.028`.

## Входные данные

`label`, `badgeColor`, `textColor` (тип `Props` в документе не раскрыт —
по использованию: строка и два CSS-цвета). Внешние константы проекта:
`SAFE_MARGIN` (`config.ts`, 0.05), `FONT_FAMILY` (`fonts.ts`).

## Анимации

```tsx
const enter = spring({frame, fps, config: {damping: 14, stiffness: 120}});
const pulse = 0.6 + 0.4 * Math.abs(Math.sin((frame / fps) * Math.PI));
// exit: последние 0.5 с, Easing.in(Easing.quad), clamp
opacity: enter * (1 - exit), transform: `scale(${enter * (1 - 0.3 * exit)})`
```

## Исходники и документация

- `templates/remotion-components/remotion-motion-graphics-skill/skills/remotion-motion-graphics/references/patterns.md` — раздел «Transparent overlay»
- `…/references/scaffold.md` — config/fonts, регистрация
- `…/references/traps.md` — почему нельзя фон на корне

## Зависимости

`remotion` (`AbsoluteFill`, `spring`, `interpolate`, `Easing`,
`useCurrentFrame`, `useVideoConfig`).

## Совместимость и адаптация

`native`. Код внутри Markdown — перенести в `.tsx`, объявить `Props`,
`SAFE_MARGIN`, `FONT_FAMILY`. Корневой `AbsoluteFill` без `backgroundColor`;
`remotion.config.ts` с PNG; рендер `--codec=prores --prores-profile=4444
--pixel-format=yuva444p10le --image-format=png`.

## Паттерны

`key-point-emphasis`
