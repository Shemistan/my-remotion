# Circle Wipe — `free-remotion-templates/transition-circle-wipe`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `transitions-scene` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Ирисовый переход: из центра раскрывается круг с акцентным кольцом-кромкой,
сквозь него видна вторая сцена (свой радиальный фон, подпись и
дорисовывающаяся линия под ней); первая сцена тем временем медленно
наезжает.

## Когда использовать

Переход к новой главе, «фокус на главном», «а теперь заглянем внутрь».
Самодостаточная демо-композиция: сцены — подписи `fromLabel`/`toLabel` на
фоне. Для монтажа вынести сцены в `children` или переписать как
`TransitionPresentation` (аналог `@remotion/transitions` `iris`/`circle`).

## Фразы из озвучки

- «переходим к следующей части»
- «давайте сфокусируемся на главном»
- «а теперь заглянем внутрь»

## Визуальный стиль

Тёмно-синий `#0b0f1a`, индиго-акцент `#6366f1`, крупная подпись weight 800.
Чистый, техно. 1920×1080, 90 кадров; шрифт `-apple-system, "Segoe UI", Roboto, sans-serif`.

## Входные данные

`TransitionCircleWipeProps`: `backgroundColor` (`#0b0f1a`), `accentColor`
(`#6366f1`), `textColor` (`#eef2ff`), `fromLabel` («Scene 01»), `toLabel`
(«Scene 02»).

## Анимации

Все фазы — доли `durationInFrames` (шаблон сам перетаймится): ирис 0.16–0.66
`Easing.inOut(cubic)` через `clipPath: circle(r)`; SVG-кольцо утончается и
гаснет к концу; наезд первой сцены scale 1→1.035; линия под подписью
0.44–0.94 `Easing.out(cubic)`. Цвет второй сцены — смесь фона и акцента
(`mixHex`, только hex).

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/transition-circle-wipe/TransitionCircleWipe.tsx` — компонент
- `templates/remotion-components/free-remotion-templates/README.md` — каталог шаблонов

## Зависимости

`remotion` (`interpolate`, `Easing`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`. Цвета передавать в hex (иначе `mixHex` вернёт исходный цвет).

## Паттерны

`key-point-emphasis`, `transformation`, `sequence-steps`
