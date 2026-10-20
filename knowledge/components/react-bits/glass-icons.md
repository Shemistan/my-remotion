# GlassIcons — `react-bits/glass-icons`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `icons-shapes` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `canvas`, `raf`, `dom`, `svg`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Сетка иконок-приложений из «жидкого стекла»: прозрачная плашка с
преломлением и бликом по краю поверх цветной градиентной подложки
(наклонённой, смещённой или круглой); иконки появляются по очереди со
stagger, подписи под ними.

## Когда использовать

«Работает с вашими инструментами», набор интеграций, экран приложений,
соцсети, док. Для бегущей ленты логотипов — искать `react-bits/logo-loop`.

## Фразы из озвучки

- «Подключается к Slack, Notion и Figma»
- «Все ваши приложения в одном месте»
- «Выберите сервис — и начнём»

## Визуальный стиль

Стиль Apple liquid glass: градиенты `blue|purple|red|indigo|orange|green|teal|pink|graphite|silver`,
плитка 82 px, отступ 66, 3 колонки, мягкие тени, тёмная/светлая тема.

## Входные данные

`items=[]` (`{icon, label, color, href, target, onClick, id, className}`),
`size=82`, `gap=66`, `columns=3`, `roundness=0.6`, `refraction=0.8`,
`bevel=0.6`, `dispersion=0`, `frost=0.2`, `shine=0.85`, `tint='#dfdfdf'`,
`tintOpacity=0.2`, `iconColor`, `plate='tilt'` (`tilt|offset|circle|none`),
`tilt=30`, `spread=0.5`, `hover='press'` (`lift|float|press|none`),
`parallax=1`, `labels='hover'` (`hover|always|none`), `intro=true`,
`theme='dark'`, `className`, `style`.

## Анимации

WebGL2 рисует стекло и подложки по позе `poseOf(state, settings)` (чистая
функция от прогресса входа `e`, hover `h`, нажатия `p`, наклона `x/y`);
rAF интегрирует пружины к целям; вход — `IntersectionObserver`, задержка
`i * 0.07` с. Без GPU — DOM-фолбэк с `backdrop-filter` и SVG
`feDisplacementMap`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/GlassIcons/GlassIcons.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/GlassIcons/GlassIcons.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/Components/GlassIcons/GlassIcons.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/GlassIconsDemo.jsx` — демо
- https://reactbits.dev/components/glass-icons

## Зависимости

Нет внешних пакетов (WebGL2, Canvas 2D для карт преломления).

## Совместимость и адаптация

`complex` (WebGL + пружины). Рецепт intro: для иконки `i`
`e = spring({frame: frame - start - i*0.07*fps, fps, config:{stiffness:60, damping:15.5}})`,
`h = p = x = y = 0`, затем `poseOf` → uniform-ы и `draw()` в `useEffect`
каждого кадра под `delayRender`; либо принудительно DOM-фолбэк (`gpu=false`)
и писать стили из `poseOf` в рендере — тогда остаётся только CSS/SVG.

## Паттерны

`system-structure`, `relationships`
