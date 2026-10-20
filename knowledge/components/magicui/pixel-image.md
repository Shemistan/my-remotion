# PixelImage — `magicui/pixel-image`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Картинка собирается из прямоугольных «пикселей»-плиток, проявляющихся
в случайном порядке; затем ч/б изображение наливается цветом.

## Когда использовать

Эффектное появление фото, портрета, обложки или скриншота; тема
«картина складывается из деталей», «оживление» (ч/б → цвет).

## Фразы из озвучки

- «из мелочей складывается картина»
- «и вот он — наш герой»
- «прошлое оживает в цвете»

## Визуальный стиль

Сетка 6×4 (или 8×8, 8×3, 4×6, 3×8, своя до 16×16), фото со
скруглением 2.5rem, fade 1 с, цвет через 1.3 с.

## Входные данные

- `src: string` (обязателен)
- `grid?: "6x4"|"8x8"|"8x3"|"4x6"|"3x8"` = `"6x4"`; `customGrid?: {rows, cols}` (1–16)
- `grayscaleAnimation?` = `true`
- `pixelFadeInDuration?` = `1000`, `maxAnimationDelay?` = `1200`, `colorRevealDelay?` = `1300` (мс)

## Анимации

Каждая плитка — копия `img` с `clipPath: polygon(…)`, CSS
`transition` opacity с `transitionDelay = Math.random()·maxDelay`;
цвет — `setTimeout(colorRevealDelay)` → `grayscale-0` с `transition:
filter`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/pixel-image.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/pixel-image.mdx` — документация

## Зависимости

React, `cn`. Размер зашит: `h-72 w-72 md:h-96 md:w-96`.

## Совместимость и адаптация

`adaptable`. Задержки — `random(\`px-${i}\`)·maxDelay`; opacity плитки
= `interpolate(ms(frame), [d_i, d_i + fade], [0, 1], clamp)`, фильтр
`grayscale(${1 - interpolate(ms, [colorDelay, colorDelay + fade],
[0, 1])})`. `<img>` → `<Img>` из remotion (ждёт загрузку), размер
контейнера сделать prop.

## Паттерны

`transformation`, `key-point-emphasis`
