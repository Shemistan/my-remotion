# CaseStudyCard — `animata/case-study-card`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Карточка-«книжка» 208×240: обложка с фоном-картинкой, категорией,
заголовком и логотипом; по hover обложка приоткрывается (`rotateY(−30°)`
от левого края), а сзади выезжает зелёная закладка «CLICK TO READ».

## Когда использовать

Кейс клиента, история успеха, «откроем отчёт». Hover-анимацию
воспроизвести по кадру.

## Фразы из озвучки

- «посмотрим на кейс клиента»
- «откроем эту историю»
- «подробности — внутри»

## Визуальный стиль

Журнальный: тёмная вуаль `bg-black/70` поверх фото, заголовок
`text-red-300`, закладка `bg-green-600`.

## Входные данные

`CaseStudyCardProps` (+ атрибуты `div`): `title?`, `category?`, `image?`
(URL фона), `logo?` (URL), `link?` (href), `type?: "content" |
"simple-image"` (текст+картинка или только картинка).

## Анимации

`transition-transform duration-500 ease-out` обложки
`group-hover/study:transform-[rotateY(-30deg)]` (perspective 1000px);
закладка `-translate-x-10 → 0` + `rotate-[5deg]` за 300 мс.

## Исходники и документация

- `templates/react-libriry/animata/animata/card/case-study-card.tsx` — компонент
- `templates/react-libriry/animata/content/docs/card/case-study-card.mdx` — документация
- `templates/react-libriry/animata/animata/card/case-study-card.stories.tsx` — пример

## Зависимости

`react`, `@/lib/utils`.

## Совместимость и адаптация

`rotateY(−30·p deg)` обложки и `translateX(−40 + 40·p px) rotate(5p deg)`
закладки из кадра; картинки — `staticFile`. `<a>` убрать.

## Паттерны

`key-point-emphasis`, `spatial`
