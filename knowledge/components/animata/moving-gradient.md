# MovingGradient — `animata/moving-gradient`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Контейнер с белым фоном и полупрозрачным (opacity 15%) переливающимся
градиентом yellow-500 → yellow-700 → pink-500, который медленно ездит
туда-обратно.

## Когда использовать

Тёплая «живая» подложка для карточки, цитаты, CTA. Используется внутри
`animata/bento-gradient` (там `animated={false}`).

## Фразы из озвучки

- «и вот самое интересное»
- «тёплое предложение для наших клиентов»
- «всё начинает меняться»

## Визуальный стиль

Едва заметный тёплый градиент поверх белого; длина фона 300%, цикл 3 с
alternate.

## Входные данные

`MovingGradientProps extends ComponentPropsWithoutRef<"div">`:
`animated = true`, `gradientClassName?` (переопределить цвета/opacity
Tailwind-классами), `className?`, `children`.

## Анимации

Tailwind `animate-bg-position` (`bg-position 3s infinite alternate`:
background-position 0%→100%), keyframes в `styles/globals.css`.

## Исходники и документация

- `templates/react-libriry/animata/animata/background/moving-gradient.tsx` — компонент
- `templates/react-libriry/animata/styles/globals.css` — keyframes `bg-position`
- `templates/react-libriry/animata/content/docs/background/moving-gradient.mdx` — документация
- `templates/react-libriry/animata/animata/background/moving-gradient.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`cn`), Tailwind v4 + `--animate-bg-position`.

## Совместимость и адаптация

`adaptable`: передать `animated={false}` и задать inline
`backgroundPosition: `${p}% 50%`` где `p` — пинг-понг из кадра
(`interpolate(frame % (6*fps), [0, 3*fps, 6*fps], [0, 100, 0])`).

## Паттерны

`key-point-emphasis`, `abstract-concepts`
