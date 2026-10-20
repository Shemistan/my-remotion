# BentoGrid / BentoCard — `magicui/bento-grid`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Сетка «бенто» из карточек разного размера (3 колонки, ряды 22rem):
у каждой — фон-иллюстрация, иконка, заголовок, описание и ссылка-CTA.

## Когда использовать

Обзор возможностей продукта, «всё в одном», сводка фич, итоговый слайд
с ключевыми пунктами. Внутрь `background` часто кладут другие эффекты
(`marquee`, `animated-beam`, `globe`).

## Фразы из озвучки

- «всё, что нужно, — в одном месте»
- «вот ключевые возможности платформы»
- «шесть функций, которые экономят время»

## Визуальный стиль

Светлые карточки с мягкими тенями (dark: внутреннее свечение и
бордер `white/10`), скругление xl, серый текст; Apple-like.

## Входные данные

- `BentoGrid`: `children`, `className?` (переопределяет `grid-cols-3`, `auto-rows-[22rem]`)
- `BentoCard`: `name: string`, `className: string` (размер, напр. `col-span-2`),
  `background: ReactNode`, `Icon: ElementType`, `description: string`,
  `href: string`, `cta: string`.

## Анимации

Только hover: контент `-translate-y-10`, иконка `scale-75`, CTA
выезжает снизу и проявляется, подложка `bg-black/3`; `transition-all
duration-300`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/bento-grid.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/bento-grid.mdx` — документация

## Зависимости

`@radix-ui/react-icons` (`ArrowRightIcon`), shadcn `button`, `cn`.

## Совместимость и адаптация

`adaptable`. Статичная раскладка рендерится как есть. Для видео:
появление карточек stagger'ом по кадру (opacity/translateY/scale), а
hover-состояние «фокус на карточке» — тем же сдвигом/показом CTA по
кадру вместо `group-hover`. Кнопку-ссылку можно заменить текстом.

## Паттерны

`system-structure`, `comparison`, `sequence-steps`
