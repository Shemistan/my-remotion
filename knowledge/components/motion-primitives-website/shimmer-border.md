# ShimmerBorder — `motion-primitives-website/shimmer-border`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Карточка-обёртка с рамкой 1 px, по которой вращается световая полоса
(линейный градиент с поворачивающимся углом).

## Когда использовать

Выделить кнопку-CTA, карточку тарифа, «новинку» в сетке.

## Фразы из озвучки

- «нажмите, чтобы начать»
- «самый популярный вариант»
- «новинка этого месяца»

## Визуальный стиль

`p-px`, `borderRadius` 12px; `linear-gradient(angle, transparent 40%,
shimmerColor 50%, transparent 60%)`, плитка 200 px; фон контента
`hsl(var(--surface))`.

## Входные данные

`ShimmerBorderProps`: `children`; `shimmerColor?`; `shimmerSize?`
(`'200px'`); `borderRadius?` (`'12px'`); `shimmerDuration?` (`'3s'`);
`background?`; `className?`.

## Анимации

keyframes `shimmer-spin` анимирует `@property --shimmer-angle` 0 →
360deg (в `<style jsx>`).

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/border-beam.tsx` — компонент

## Зависимости

`react`, `styled-jsx`, `@/lib/utils`; CSS `@property` (Chromium).

## Совместимость и адаптация

`adaptable`: `@property` и keyframes не нужны — угол прямо в style:
`background: linear-gradient(${360*((frame/fps)/3 % 1)}deg, …)`
(3 — `shimmerDuration` в секундах).

## Паттерны

`key-point-emphasis`
