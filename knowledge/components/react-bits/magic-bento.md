# MagicBento — `react-bits/magic-bento`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `raf`, `timers`, `dom`, `svg`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Bento-сетка карточек фич (4 колонки, карточки 1×1 и 2×2), в каждой —
живая мини-иллюстрация: рисующийся график, дашборд, совместная работа,
пайплайн автоматизации, хаб интеграций с «пакетами» по линиям, тумблеры
безопасности. Светящаяся граница и прожектор у курсора, волна по клику.

## Когда использовать

Обзор возможностей продукта одним экраном: «аналитика, автоматизация,
интеграции, безопасность — всё в одном». Для списка строк — `react-bits/animated-list`.

## Фразы из озвучки

- «Всё, что нужно команде, — в одной платформе»
- «Аналитика, автоматизация и интеграции из коробки»
- «Безопасность корпоративного уровня»

## Визуальный стиль

Тёмный SaaS-лендинг: поверхность `#1a1820→#121116`, радиус 20, зазор 12,
высота ряда 200; спокойная графика в тон, акцент `glowColor`.

## Входные данные

`items` (по умолчанию 6: `{title, description, visual, colSpan, rowSpan}`,
`visual` = `analytics|dashboard|collaboration|automation|integration|security`),
`columns=4`, `rowHeight=200`, `gap=12`, `radius=20`, `theme='dark'`,
`glowColor`, `textAutoHide=true`, `enableBorderGlow=true`,
`enableSpotlight=true`, `spotlightRadius=300`, `enableStars=false`,
`particleCount=24`, `enableTilt=false`, `enableMagnetism=false`,
`clickEffect=true`, `intro=true`, `disableAnimations=false`, `onItemClick`,
`className`, `style`.

## Анимации

Иллюстрации — CSS `@keyframes` (`magic-bento-draw`, `-fade`, `-grow`,
`-pop`, `-run`, `-check`, `-rail`, `-switch-*` и др.), перезапуск через
`getAnimations()`; intro — каскад со stagger 80 мс (`data-intro`,
таймеры); rAF ведёт свечение/прожектор/наклон от курсора и волну клика.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/MagicBento/MagicBento.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/MagicBento/MagicBento.css` — keyframes иллюстраций
- `templates/react-libriry/react-bits/src/ts-default/Components/MagicBento/MagicBento.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/MagicBentoDemo.jsx` — демо
- https://reactbits.dev/components/magic-bento

## Зависимости

`@hugeicons/react`, `@hugeicons/core-free-icons`.

## Совместимость и адаптация

`adaptable`: сетка и иллюстрации — DOM/SVG + CSS-анимации. Рецепт: для всех
анимированных узлов `animationPlayState: 'paused'`,
`animationDelay: -(frame/fps - startOf(card))s` (по rules.md); intro-каскад —
`opacity/translate` по `interpolate(frame - i*0.08*fps, …)`; `enableSpotlight`,
tilt, magnetism, click-волну отключить (или задать путь прожектора из кадра).
Файл прочитан частично (props, иллюстрации, начало движка); точные имена
keyframes и тайминги — в CSS.

## Паттерны

`system-structure`, `comparison`
