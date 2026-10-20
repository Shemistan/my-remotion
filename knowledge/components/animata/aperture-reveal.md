# ApertureReveal — `animata/aperture-reveal`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `transitions-scene` |
| Совместимость с Remotion | complex |
| Флаги | `engine:motion`, `user-events`, `dom`, `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Крупный заголовок с «окошком»-капсулой посередине; по мере прокрутки
слова расходятся, а фотография (или видео) раскрывается из окошка на весь
экран; затем внизу по словам проявляется подпись и появляется кнопка
действия.

## Когда использовать

Кинематографичный переход «из слов — в картинку»: раскрытие главного
кадра, смена главы, интро продукта. Один из самых «видео»-эффектов
библиотеки.

## Фразы из озвучки

- «за словами стоит реальная картина»
- «откроем вид целиком»
- «вот куда мы идём»

## Визуальный стиль

Земляной фон `#ebe9e4` (dark `#111112`), чернила `#141413`, акцент
`#ffcc00`, плотный гротеск clamp(2.25rem, 6.4cqw, 6.25rem), тёмная
вуаль на фото; спокойный editorial.

## Входные данные

Composable: `ApertureReveal` (`length = 3` — длина прокрутки в высотах
сцены, мин. 1.5; `viewportHeight?` — режим собственного скролл-бокса),
`.Media` (img/video внутри), `.Headline` (`as`), `.Lead`, `.Opening`,
`.Trail`, `.Caption`, `.Text` (string, по словам), `.Action`, `.Hint`.

## Анимации

`useScroll` → `scrollYProgress` → `--e` (раскрытие, ease-in-out cubic до
0.55) и `--q` (чтение подписи 0.6–0.92) как CSS-переменные; геометрию
окошка измеряет `getBoundingClientRect` + `ResizeObserver` в
`--aperture-*`; остальное — в `aperture-reveal.css`.

## Исходники и документация

- `templates/react-libriry/animata/animata/scroll/aperture-reveal.tsx` — компонент
- `templates/react-libriry/animata/animata/scroll/aperture-reveal.css` — стили по переменным
- `templates/react-libriry/animata/content/docs/scroll/aperture-reveal.mdx` — документация
- `templates/react-libriry/animata/animata/scroll/aperture-reveal.stories.tsx` — пример
- `templates/react-libriry/animata/app/demo/library/scroll/aperture-reveal-demo-001.tsx` — демо-сцена

## Зависимости

`motion`, `hooks/use-prefers-reduced-motion`, `@/lib/utils`.

## Совместимость и адаптация

`complex`, но удобный: вся сцена управляется одним прогрессом. Заменить
`useScroll` на `p = frame / durationInFrames`, вычислять `--e`/`--q` той
же формулой и ставить в style; трек высотой `length × viewport` и
`sticky` убрать. Измерение окошка оставить в `useLayoutEffect` с
`delayRender` до `document.fonts.ready`. `.Action`/`.Hint` — опционально.

## Паттерны

`transformation`, `key-point-emphasis`, `abstract-concepts`
