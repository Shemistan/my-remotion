# Android — `magicui/android`

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

SVG-рамка Android-смартфона (корпус, кнопки сбоку, камера-«дырка»),
в экран которой вставляется скриншот или видео.

## Когда использовать

Показ мобильного приложения, экрана, сценария на Android; сравнение
двух платформ рядом с `iphone`. Для веба — `safari`.

## Фразы из озвучки

- «так приложение выглядит на Android»
- «всё в вашем смартфоне»
- «откройте приложение и попробуйте»

## Визуальный стиль

Плоская минималистичная рамка `#E5E5E5`/`#404040` (dark), экран
360×800 со скруглением 33/25, без бликов; 433×882 по умолчанию.

## Входные данные

- `width?` = `433`, `height?` = `882` (меняют `width/height/viewBox`, но
  внутренние пути рассчитаны на 433×882)
- `src?: string` — картинка экрана (`<image>` с `clipPath`)
- `videoSrc?: string` — видео в `<foreignObject>` (`autoPlay loop muted`)
- прочие `SVGProps<SVGSVGElement>`.

## Анимации

Нет. Видео играет само (`autoPlay loop`).

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/android.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/android.mdx` — документация

## Зависимости

React. Пакетов нет.

## Совместимость и адаптация

`adaptable`. Рамка — детерминированный SVG. Картинку грузить через
`staticFile` (SVG `<image>` не ждёт загрузку — добавить
`delayRender`/предзагрузку или класть `<Img>` абсолютно поверх под
экран). `videoSrc` не использовать: вместо `<video>` в
`foreignObject` — `OffthreadVideo` в абсолютном `div` под рамкой
(координаты экрана 9,14 / 360×800). `clipPath id="clip0_514_20855"`
глобальный — при двух телефонах переименовать. Анимации появления/
поворота телефона — по кадру снаружи.

## Паттерны

`comparison`, `spatial`
