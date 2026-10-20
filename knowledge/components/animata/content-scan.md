# ContentScanner — `animata/content-scan`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | complex |
| Флаги | `engine:motion`, `timers`, `raf`, `dom`, `user-events`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Карточка «Free AI Content Detector»: блок текста, по которому слева
направо проходит сканирующая фиолетовая полоса со шлейфом; заданные
фразы подсвечиваются жёлтым, когда их пересекает сканер; снизу
докручивается «NN % AI Content Probability». Затем сканер возвращается.

## Когда использовать

«ИИ анализирует текст», проверка на плагиат/угрозы, сканирование
документа, поиск ключевых слов.

## Фразы из озвучки

- «система сканирует текст»
- «нашла подозрительные фрагменты»
- «вероятность ИИ-текста — сорок процентов»

## Визуальный стиль

Белая карточка с тенью, сканер `#887FF2` + градиент
`bg-custom-gradient` (из `@theme`), подсветка `#ffcc00`; технологично.

## Входные данные

`content: string`, `highlightWords: string[]` (обязательны),
`scanDuration = 3` (с), `reverseDuration = 1` (с).

## Анимации

Старт по кнопке «Start Scan»: `useAnimation().start({x})` (motion),
`setInterval`-тикер процента, `requestAnimationFrame`-цикл с
`getBoundingClientRect` сканера и фраз для подсветки; цифры процента —
бесконечный motion-«барабан»; текст вставляется через
`dangerouslySetInnerHTML`.

## Исходники и документация

- `templates/react-libriry/animata/animata/feature-cards/content-scan.tsx` — компонент
- `templates/react-libriry/animata/animata/feature-cards/content-scan.css` — стили подсветки
- `templates/react-libriry/animata/content/docs/feature-cards/content-scan.mdx` — документация
- `templates/react-libriry/animata/animata/feature-cards/content-scan.stories.tsx` — пример

## Зависимости

`motion`.

## Совместимость и адаптация

`complex`: всё состояние — в таймерах, промисах и DOM-измерениях.
Переписать: `x` сканера = `interpolate(frame, [s, s+3*fps, s+3.2*fps,
s+4.2*fps], [-87%, W, W, -87%])`; подсветка фразы — по заранее заданной
позиции (доля строки) или одному измерению в `useLayoutEffect` +
`delayRender`; процент — `Math.round(interpolate(...))`. Кнопку убрать.

## Паттерны

`cause-effect`, `key-point-emphasis`, `transformation`
