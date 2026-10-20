# SplitFlapText — `react-bits/split-flap-text`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `raf`, `timers` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Механическое табло вылетов (split-flap): ряд плиток, каждая щёлкает
несколькими случайными символами и останавливается на нужном; фразы
сменяются по кругу. Каскад слева, справа, от центра или в случайном порядке;
блик на падающих флапах; минималистичный стиль без плиток.

## Когда использовать

Путешествия, расписание, статус («ГОТОВ К ЗАПУСКУ»), объявление результата,
ретро-табло. Для барабанов на голом тексте — `react-bits/shuffle`.

## Фразы из озвучки

- «Посадка на рейс начинается»
- «Статус изменился: всё готово к запуску»
- «Следующая остановка — новый рынок»

## Визуальный стиль

Тёмные плитки `#111827`, светлый текст `#f8fafc`, радиус 8, зазор 6, шрифт
52px; ретро-механика, щелчок 0,12 с на флап, каскад 0,06 с.

## Входные данные

`words=['LAUNCH READY','SYNC ONLINE','SIGNAL LIVE']`, `text` (одна фраза),
`flipDuration=0.12`, `stagger=0.06`, `cycleDelay=2400` (мс), `charset='alphanumeric'`
(`alpha|alphanumeric|numeric|своя строка`), `flipsPerChar=8`, `tileColor='#111827'`,
`textColor='#f8fafc'`, `tileRadius=8`, `gap=6`, `fontSize=52`, `loop=true`,
`padTo=12`, `align='left'` (`left|center|right`), `intro=true`, `glare=0`,
`depth=0.5`, `order='left'` (`left|right|center|random`), `tileStyle='board'`
(`board|minimal`), `className`, `style`, `...props`.

## Анимации

rAF считает `step = floor((elapsed - start_i) / flipMs)` для каждой плитки и
пишет `current/next` в state; сам переворот половинок — CSS `@keyframes`
(`split-flap-front/back`, тени, блик, в minimal — `clip-path`), перезапускаемые
сменой `key`. Смена фраз — `setTimeout(holdMs + duration)`; символы
промежуточных флапов — `Math.random`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/SplitFlapText/SplitFlapText.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/SplitFlapText/SplitFlapText.css` — плитки и keyframes
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/SplitFlapText/SplitFlapText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/SplitFlapTextDemo.jsx` — демо
- https://reactbits.dev/text-animations/split-flap-text

## Зависимости

Нет внешних пакетов (React + CSS).

## Совместимость и адаптация

`adaptable`: расписание детерминировано по времени. Рецепт: по кадру
`elapsed = frame/fps*1000 - phraseStart`, для плитки `i`
`step = floor((elapsed - cascade_i*staggerMs)/flipMs)`; символ шага —
`charset[floor(random(\`${phrase}-${i}-${step}\`)*len)]`; доля флипа
`p = ((elapsed - …) % flipMs)/flipMs` → `animationDelay: -p*flipDuration s` +
`animationPlayState: 'paused'` у флапов (или `rotateX` по `interpolate`).
Индекс фразы — по накопленной длительности `holdMs + duration`. rAF и
`setTimeout` убрать.

## Паттерны

`transformation`, `key-point-emphasis`
