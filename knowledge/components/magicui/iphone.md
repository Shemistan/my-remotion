# Iphone — `magicui/iphone`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Рамка iPhone с Dynamic Island (SVG поверх), а экран — HTML-слой со
скриншотом или видео, обрезанный по скруглённому экрану.

## Когда использовать

Показ мобильного приложения/экрана iOS, сторис, вертикального видео
внутри телефона; пара с `android` для сравнения платформ.

## Фразы из озвучки

- «приложение всегда у вас в кармане»
- «посмотрим, как это работает на iPhone»
- «три касания — и заказ оформлен»

## Визуальный стиль

Плоский корпус `#E5E5E5`/`#404040`, кнопки, «остров» `#F5F5F5`;
пропорции 433:882, экран 389.5×843.5 с радиусом 55.75; без бликов.

## Входные данные

- `src?: string` — картинка экрана (`object-cover object-top`)
- `videoSrc?: string` — видео (`autoPlay loop muted playsInline`, приоритет над `src`)
- `className?`, `style?`, атрибуты `div`. Ширина — `w-full` контейнера,
  высота из `aspectRatio`.

## Анимации

Нет. В корневом `registry.json` этот компонент значится как
`iphone-15-pro` (`iphone-15-pro.tsx`), но такого файла в исходниках нет —
актуальный компонент `iphone.tsx`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/iphone.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/iphone.mdx` — документация

## Зависимости

React. Пакетов нет.

## Совместимость и адаптация

`adaptable`. Экран — обычный `div` в процентах от рамки: `<img>` →
`<Img src={staticFile(…)}>`, `<video>` → `<OffthreadVideo>` (или
`<Video>`) — синхронно с кадром. Внутрь экрана можно положить
любую Remotion-сцену вместо картинки. `mask id="screenPunch"`
глобальный — при нескольких телефонах уникализировать.

## Паттерны

`comparison`, `spatial`
