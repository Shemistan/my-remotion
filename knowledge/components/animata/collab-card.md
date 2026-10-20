# CollabCard — `animata/collab-card`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Карточка 3:2 «мультиплеер» в стиле Figma: тёмный холст с цветными
бликами, строка «Live · 4 editing» с пульсирующей точкой и стопкой
аватаров `+2`, крупное «hello!» в пунктирной рамке выделения, под ним
«editing Dylan & Evan» — цветные плашки, а вокруг двигаются курсоры
коллег с «кликами»-вспышками.

## Когда использовать

Совместная работа, «команда редактирует вместе», real-time, коллаборация,
SaaS-функция. Всё масштабируется через container query units (`cqi`).

## Фразы из озвучки

- «работайте вместе в реальном времени»
- «вся команда в одном документе»
- «видно, кто что редактирует»

## Визуальный стиль

Тёмный продуктовый, Figma-палитра (`#A259FF`, `#FF7262`, `#1ABCFE`,
`#0ACF83`, синий `#0D99FF` рамки).

## Входные данные

`CollabCardProps`: `greeting?` (`"hello!"`), `eyebrow?` (`"Now in
multiplayer"`), `intro?` (`"editing"`), `conjunction?` (`"&"`), `trailing?`
(`""`), `liveLabel?` (`"Live · 4 editing"`), `presenceColors?: string[]`
(4 цвета), `extraCount?` (2), `collaborators?: [Collaborator, Collaborator]`
(`{name, pill, pillText?, cursor}` — Tailwind-классы; Dylan/Evan),
`backgroundUrl?`, `className?`.

## Анимации

`collab-card.css`: `collab-host` 9 с (курсор хоста путешествует по
карточке), `collab-first`/`collab-second` 5.5 с (покачивание, второй с
delay 0.8 с), `collab-burst` 5.5 с (вспышки, delay 1.1/2.7 с), `collab-ping`
2.4 с — все `infinite`.

## Исходники и документация

- `templates/react-libriry/animata/animata/card/collab-card.tsx` — компонент
- `templates/react-libriry/animata/animata/card/collab-card.css` — keyframes
- `templates/react-libriry/animata/content/docs/card/collab-card.mdx` — документация
- `templates/react-libriry/animata/animata/card/collab-card.stories.tsx` — пример

## Зависимости

`@/lib/utils`, Tailwind v4 (`@container`, `cqi`), co-located CSS.

## Совместимость и адаптация

Чистый CSS-цикл: для каждого анимированного элемента `animationDelay:
(−frame/fps + исходный delay)+'s'`, `animationPlayState: 'paused'` — кадры
детерминированы. Либо переписать траекторию курсора хоста как
`interpolate` по четырём ключам keyframes.

## Паттерны

`relationships`, `system-structure`
