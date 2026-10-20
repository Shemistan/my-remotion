# NoiseTexture — `magicui/noise-texture`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Слой мелкого зернистого шума (фрактальная турбулентность, обесцвеченная
и приглушённая) поверх фона или карточки — «плёночная» фактура.

## Когда использовать

Подложка, убирающая «пластиковость» градиентов; кинематографичное
зерно на заставке. Самостоятельного смысла не несёт — всегда слой.

## Фразы из озвучки

- «немного атмосферы старого кино»
- «живая фактура вместо плоского фона»
- «тёплый, аналоговый вайб»

## Визуальный стиль

Серый шум, `opacity-50` (dark: 0.75), контраст `slope`; статичный.

## Входные данные

- `frequency?` = `0.4` (`baseFrequency`), `octaves?` = `6` (`numOctaves`)
- `slope?` = `0.15`, `noiseOpacity?` = `0.6`
- `className?`, прочие атрибуты `svg`.

## Анимации

Нет. SVG `filter`: `feTurbulence type=fractalNoise stitchTiles=stitch`
→ `feColorMatrix saturate 0` → `feComponentTransfer linear slope`, id
фильтра — `useId()`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/noise-texture.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/noise-texture.mdx` — документация

## Зависимости

React, `cn`.

## Совместимость и адаптация

`adaptable`, адаптации не нужны: детерминированный статичный SVG.
Для «живого» зерна — менять атрибут `seed` у `feTurbulence` по кадру
(`seed={Math.floor(frame/2)}`, потребуется добавить prop). Большие
полноэкранные фильтры могут замедлить рендер.

## Паттерны

`abstract-concepts`
