# ProgressiveBlur — `motion-primitives/progressive-blur`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives` (`templates/react-libriry/motion-primitives`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENCE.md, © 2024 ibelick) |

## Что визуализирует

Плавно нарастающее размытие к краю (снизу, сверху, слева, справа) поверх
картинки или контента — эффект «матового стекла» у кромки, как в
интерфейсах Apple/Linear.

## Когда использовать

Подложка под подпись поверх фото/видео, мягкий край у прокручиваемого
списка, затемнённо-размытый низ кадра под lower third. Сам по себе не
анимирован.

## Фразы из озвучки

- «на фото — наша команда»
- «вот как это выглядит в жизни»
- «а внизу — краткое описание»

## Визуальный стиль

`blurLayers` слоёв `absolute inset-0`, у каждого `backdrop-filter:
blur(index*blurIntensity px)` и `mask-image: linear-gradient(angle, …)`
со «ступенькой» непрозрачности.

## Входные данные

`ProgressiveBlurProps`: `direction?: 'top'|'right'|'bottom'|'left'`
(`'bottom'`); `blurLayers?` (8, минимум 2); `blurIntensity?` (0.25);
`className?`; остальные `HTMLMotionProps<'div'>` прокидываются на каждый
слой.

## Анимации

Собственной анимации нет. В примерах `progressive-blur-hover` /
`-slider` анимацию дают внешние motion-props/hover.

## Исходники и документация

- `templates/react-libriry/motion-primitives/components/core/progressive-blur.tsx` — компонент
- `templates/react-libriry/motion-primitives/app/docs/progressive-blur/page.mdx` — документация
- `templates/react-libriry/motion-primitives/app/docs/progressive-blur/progressive-blur-basic.tsx` — пример

## Зависимости

`motion` (только как `motion.div`), `@/lib/utils` (`cn`).

## Совместимость и адаптация

`adaptable`: рендер детерминирован; `motion.div` можно заменить на `div`.
Если нужно «проявить» размытие — умножать `blurIntensity` или opacity
слоёв на прогресс `interpolate(frame, …)`. `backdrop-filter` в
headless Chromium работает, но тяжёл для рендера — проверить скорость.

## Паттерны

`key-point-emphasis`, `spatial`
