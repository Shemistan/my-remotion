# RevealImageList — `animata/reveal-image`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-transition`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md); фото по умолчанию — Unsplash |

## Что визуализирует

Список услуг огромным font-black текстом (text-7xl): «Branding», «Web
design», «Illustration» под заголовком «Our services». При наведении слово
бледнеет, а рядом выпрыгивают две маленькие фотографии (вторая — со
сдвигом и поворотом 12°).

## Когда использовать

Перечисление услуг/направлений агентства с визуальным примером каждого.
Без интеракции — подсвечивать пункты по очереди.

## Фразы из озвучки

- «мы занимаемся брендингом, веб-дизайном и иллюстрацией»
- «вот примеры наших работ»
- «три направления — одна команда»

## Визуальный стиль

Крупная гротесковая типографика, мини-фото 64×80 со скруглением и тенью;
редакционно, агентски.

## Входные данные

Без props: элементы `{text, images: [ImageSource, ImageSource]}` зашиты в
`RevealImageList`; внутренний `RevealImageListItem({text, images})`.

## Анимации

`group-hover/reveal`: фото `scale-0 → 100`, `opacity 0 → 1`, вторая —
`translate 6, rotate-12`, текст `opacity-40`; `transition-all duration-500
delay-100/150`.

## Исходники и документация

- `templates/react-libriry/animata/animata/list/reveal-image.tsx` — компонент
- `templates/react-libriry/animata/content/docs/list/reveal-image.mdx` — документация
- `templates/react-libriry/animata/animata/list/reveal-image.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`cn`).

## Совместимость и адаптация

`adaptable`: вынести `items` в props, добавить `activeIndex` из кадра; для
активного пункта scale/opacity/rotate фото — `interpolate(frame -
activatedAt, [0, 15], …)` (0.5 с). Фото — локально.

## Паттерны

`sequence-steps`, `comparison`
