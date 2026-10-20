# ImagesReveal — `animata/images-reveal`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `user-events`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md); фото по умолчанию — Unsplash |

## Что визуализирует

Веер из 5 квадратных фотографий в белых рамках, наложенных внахлёст и
повёрнутых под разными углами (8°, −15°, −5°, 10°, −5°); при монтировании
они по очереди «выпрыгивают» с масштаба 0.2. Заголовок «Airbnb Image
Reveal».

## Когда использовать

«Воспоминания, путешествия, галерея работ», коллаж-превью. Для сетки без
поворотов — `animata/photo-booth`.

## Фразы из озвучки

- «тысячи мест, где можно остановиться»
- «вот лишь несколько наших работ»
- «каждая поездка — новая история»

## Визуальный стиль

Полароидные белые рамки 6px, rounded-2xl, shadow-xl, пружинный вход;
тёплый «лайфстайл».

## Входные данные

Без props: массив `cards` (`src` Unsplash URL, `angle`) и заголовок зашиты
в файле.

## Анимации

`motion.img` с `variants`: `hidden {opacity 0, scale 0.2}` → `visible
{opacity 1, scale 1, rotate: angle}`, `delay: index*0.1`, spring
(stiffness 150, damping 20, mass 0.5); `whileHover` выпрямляет фото.

## Исходники и документация

- `templates/react-libriry/animata/animata/image/images-reveal.tsx` — компонент
- `templates/react-libriry/animata/content/docs/image/images-reveal.mdx` — документация
- `templates/react-libriry/animata/animata/image/images-reveal.stories.tsx` — пример

## Зависимости

`motion`.

## Совместимость и адаптация

`adaptable`: заменить `motion.img` на `<Img>` со style из
`spring({frame: frame - i*3, fps, config: {stiffness:150, damping:20,
mass:0.5}})` → scale 0.2→1, opacity, rotate 0→angle. Вынести `cards` и
заголовок в props, фото положить в `public/` (`staticFile`).

## Паттерны

`sequence-steps`, `key-point-emphasis`
