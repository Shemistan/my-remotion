# DotPattern — `motion-primitives-website/dot-pattern`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Сетка точек (SVG `pattern`) с радиальным затуханием к краям; дети —
поверх.

## Когда использовать

Нейтральная подложка под карточки, схемы, UI-макеты, KPI — «чистый
технологичный фон». Это `DotPattern` из `premium-backgrounds.tsx`; версия
из `interactive/wavy-background.tsx` в базу не записана (см.
compatibility-файл).

## Фразы из озвучки

- «разберём по пунктам»
- «вот наши основные цифры»
- «чистый, понятный интерфейс»

## Визуальный стиль

Точки r 1 px, шаг 20 px, `currentColor` с opacity 0.3; маска —
`radialGradient` белый → чёрный.

## Входные данные

`DotPatternProps`: `dotRadius?` (1); `spacing?` (20); `color?`
(`'currentColor'`); `dotOpacity?` (0.3); `radialFade?` (true);
`children?`; `className?`.

## Анимации

Нет.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/premium-backgrounds.tsx` — компонент

## Зависимости

`react` (`useId`), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: чистый SVG, детерминирован. Дрейф — `x/y` у `pattern` по
кадру (`(frame*v) % spacing`); «проявление» — opacity маски по кадру.

## Паттерны

`system-structure`, `spatial`
