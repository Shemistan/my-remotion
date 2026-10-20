# TextFlip — `animata/text-flip`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Фраза «Coding is …», где последнее слово в окне перелистывается вверх по
списку (fantastic → love → fire → awesome → fantastic) с лёгким «перелётом».

## Когда использовать

Перебор ценностей/выгод в одной фразе: «Наш сервис — быстрый / удобный /
надёжный».

## Фразы из озвучки

- «это быстро, удобно и надёжно»
- «наш продукт — это …»
- «для кого угодно: дизайнеров, разработчиков, маркетологов»

## Визуальный стиль

`text-3xl font-semibold`, слово `text-blue-400`; цикл 8 с.

## Входные данные

Props нет. Слова зашиты `["fantastic","love","fire","awesome","fantastic"]`,
префикс «Coding is». Высота окна — максимум `offsetHeight` слов, измеряется
в `useEffect` через временные `span`.

## Анимации

`animate-flip-words` = `flip-words 8s infinite` (`styles/globals.css`):
`translateY` −112 % → −100 % → −212 % → … → −400 % (ступени с перелётом
на 10/35/60/85 %).

## Исходники и документация

- `templates/react-libriry/animata/animata/text/text-flip.tsx` — компонент
- `templates/react-libriry/animata/styles/globals.css` — `@keyframes flip-words`
- `templates/react-libriry/animata/content/docs/text/text-flip.mdx` — документация
- `templates/react-libriry/animata/animata/text/text-flip.stories.tsx` — пример

## Зависимости

Tailwind v4 (тема animata), `react`.

## Совместимость и адаптация

Вынести слова/префикс в props; высоту окна задать фиксированным
`line-height` вместо измерения; `translateY` вычислять из `(frame/fps) % 8`
по ключам keyframes (или negative `animationDelay` + `paused`).

## Паттерны

`transformation`, `sequence-steps`
