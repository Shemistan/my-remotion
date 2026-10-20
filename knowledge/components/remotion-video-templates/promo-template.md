# PromoTemplate — `remotion-video-templates/promo-template`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-video-templates` (`templates/remotion-components/remotion-video-templates`) |
| Вид | template |
| Категория | `layout-templates` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE) |

## Что визуализирует

Промо продукта из трёх типов сцен: хук («Introducing», название, слоган,
акцентная черта), 1–3 сцены фич (номер, заголовок, описание слева +
скриншот справа с Ken Burns) и финальный CTA на тёмном фоне с кнопкой-пилюлей.
Между сценами — slide справа и fade перед CTA.

## Когда использовать

Анонс продукта/фичи, демо SaaS, рекламный ролик 10–12 с. Если нужна одна
сцена с фичами без скриншотов — брать списки/stagger-компоненты.

## Фразы из озвучки

- «представляем новый инструмент»
- «во-первых, вы просто описываете задачу»
- «попробуйте бесплатно уже сегодня»

## Визуальный стиль

Светлый SaaS-стиль: белый/`zinc50`, Inter 800, акцент `#2563EB`, карточка
скриншота со скруглением 24 и тенью; CTA — `palette.ink`. 1920×1080, 30 fps.

## Входные данные

zod `promoTemplateSchema`: `productName` («Morph»), `tagline`, `features:
{title, description}[]` (1..3), `screenshots: string[]` (файлы в `public/`,
по индексу с повтором; по умолчанию `screenshot-1.svg`, `screenshot-2.svg`),
`cta`, `accentColor: zColor()`.
`promoTemplateCalculateMetadata`: 70 + N×90 + 80 − (N+1)×20 (N=3 → 340).

## Анимации

`TransitionSeries` с `slide({direction: "from-right"})` и `fade()`,
`linearTiming(20)`; в сценах `spring(SNAPPY)` (opacity, translate, scale,
`scaleX` черты); скриншот — `spring(GENTLE, 90)` → scale 1.12→1.02 и drift
−18→18 px.

## Исходники и документация

- `templates/remotion-components/remotion-video-templates/src/templates/PromoTemplate/PromoTemplate.tsx`
- `templates/remotion-components/remotion-video-templates/public/screenshot-1.svg` — плейсхолдер

## Зависимости

`remotion` (`Img`, `staticFile`), `@remotion/transitions` (+ `/fade`,
`/slide`), `zod`, `@remotion/zod-types`, `lib/springs`, `lib/colors`, `lib/fonts`.

## Совместимость и адаптация

`native`. Свои скриншоты — в `public/`. Длительности сцен — константы
модуля (HOOK/FEATURE/CTA/TRANSITION), не props.

## Паттерны

`sequence-steps`, `key-point-emphasis`
