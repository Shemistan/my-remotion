# ProductFeatures — `animata/product-features`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | example |
| Категория | `layout-templates` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `user-events`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Промо-секция магазина: заголовок и подзаголовок всплывают снизу, кнопка
CTA, затем три фото-карточки товаров с бейджем категории и подписью
веером: центральная поднимается, боковые прилетают с боков с поворотом
±6°.

## Когда использовать

Демонстрация 3 продуктов/фич/тарифов, витрина, «три направления». Тексты и
картинки зашиты — переделать в props.

## Фразы из озвучки

- «три продукта, которые вы полюбите»
- «наша новая коллекция»
- «выбирайте любой вариант»

## Визуальный стиль

Тёплый e-commerce: `bg-orange-50`, заголовок `text-orange-600 font-black`,
карточки `h-64 w-48 rounded-2xl` с фото и градиентом.

## Входные данные

Props нет. Внутренний `FeatureCard`: `feature: {title, category, imageUrl}`,
`zIndexOffset?`, + `HTMLMotionProps` (`initial`, `animate`). Картинки — URL
`assets.lummi.ai`.

## Анимации

motion: header/button `y 100→0, opacity 0→1` (0.5 с); карточки `type:
"spring"` с delay 0.4 (центр), 0.6 (правая, `x −192 → −30`, rotate +6), 0.8
(левая, `x 192 → 30`, rotate −6), scale 0.9 → 0.95; hover — `useSpring`
scale 1 → 1.1 и z-index. На мобиле — `whileInView`.

## Исходники и документация

- `templates/react-libriry/animata/animata/hero/product-features.tsx` — компонент
- `templates/react-libriry/animata/content/docs/hero/product-features.mdx` — документация
- `templates/react-libriry/animata/animata/hero/product-features.stories.tsx` — пример

## Зависимости

`motion` (`motion`, `useSpring`, `useTransform`).

## Совместимость и адаптация

Вход — только mount-анимации: заменить на `spring({frame: frame − delay·fps,
fps})` и интерполяцию x/y/rotate/scale; hover-ветку и мобильную `whileInView`
удалить. Фото — локально через `staticFile`.

## Паттерны

`comparison`, `key-point-emphasis`
