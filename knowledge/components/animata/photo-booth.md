# PhotoBooth — `animata/photo-booth`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Светло-серая панель с сеткой квадратных фото 110×110 (2 колонки, с `sm:` —
4), скруглённые углы; при наведении фото увеличивается до 125%.

## Когда использовать

Галерея/портфолио, «команда», набор продуктов. Для эффектного веера —
`animata/images-reveal`.

## Фразы из озвучки

- «вот наша команда»
- «посмотрите на коллекцию»
- «восемь работ за один месяц»

## Визуальный стиль

`bg-gray-100`, rounded-lg, gap-5, нейтрально и аккуратно.

## Входные данные

`collections: string[]` — URL изображений (обязателен); `className?`
применяется к каждому `img`; прочие `HtmlHTMLAttributes<div>`.

## Анимации

Только hover: `hover:scale-125` (`transition-transform duration-500`).

## Исходники и документация

- `templates/react-libriry/animata/animata/image/photo-booth.tsx` — компонент
- `templates/react-libriry/animata/content/docs/image/photo-booth.mdx` — документация
- `templates/react-libriry/animata/animata/image/photo-booth.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`cn`).

## Совместимость и адаптация

`adaptable`: статичная сетка. Для видео — stagger-вход фото по кадру и
«наведение» как поочерёдное scale 1→1.25 у активного индекса
(`Math.floor(frame / step)`). `img` → `<Img>` remotion.

## Паттерны

`comparison`, `sequence-steps`
