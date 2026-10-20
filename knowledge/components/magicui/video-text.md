# VideoText — `magicui/video-text`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | adaptable |
| Флаги | `dom`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Огромные буквы, внутри которых играет видео (океан, огонь, город):
видео видно только сквозь маску текста.

## Когда использовать

Титул или заставка, где слово и картинка — одно целое: «ОКЕАН»,
«ГОРОД», название места или бренда. Для статичной картинки внутри
текста хватит `background-clip: text`.

## Фразы из озвучки

- «добро пожаловать в океан»
- «это место нужно увидеть»
- «энергия большого города»

## Визуальный стиль

Кинематографичный: жирный sans-serif (по умолчанию `20vw`), маска по
центру, видео `object-cover` на всю площадь контейнера.

## Входные данные

- `src: string` (обязателен), `children: ReactNode` (текст маски)
- `autoPlay?` = `true`, `muted?` = `true`, `loop?` = `true`, `preload?` = `"auto"`
- `fontSize?: string|number` = `20` (число → `vw`), `fontWeight?` = `"bold"`
- `textAnchor?` = `"middle"`, `dominantBaseline?` = `"middle"`, `fontFamily?` = `"sans-serif"`
- `as?` = `"div"`, `className?`

## Анимации

Собственной анимации нет: SVG `<text>` сериализуется в data-URL и
идёт в `mask-image`; движение даёт `<video autoPlay loop>`. Маска
пересобирается на `window.resize`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/video-text.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/video-text.mdx` — документация
- `templates/react-libriry/magicui/apps/www/registry/example/video-text-demo.tsx` — пример (видео с `cdn.magicui.design`)

## Зависимости

React, `cn`. Пакетов нет.

## Совместимость и адаптация

`adaptable`. Заменить `<video>` на `<OffthreadVideo src={staticFile(…)}>`
из `remotion` (синхронизация с кадром), маску считать один раз без
`resize`-слушателя; размер шрифта лучше в px, а не `vw`. Шрифт маски
подгрузить заранее — иначе data-URL SVG возьмёт fallback.

## Паттерны

`key-point-emphasis`, `spatial`
