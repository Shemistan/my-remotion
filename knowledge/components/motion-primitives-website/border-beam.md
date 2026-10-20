# BorderBeam — `motion-primitives-website/border-beam`

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

Размытый градиентный «луч» (круг `size` px), бегущий по периметру
карточки внутри её рамки.

## Когда использовать

Подсветить карточку, тариф или блок, о котором говорят; «система
активна». Аналог `motion-primitives/border-trail` (там маска по
бордеру, здесь размытое пятно внутри `overflow: hidden`). В
`cards/glow-card.tsx` есть одноимённый компонент — не путать.

## Фразы из озвучки

- «обратите внимание на этот блок»
- «рекомендуемый тариф»
- «система работает непрерывно»

## Визуальный стиль

Круг 200 px, `linear-gradient(to right, colorFrom, colorTo)`, blur
`size/4`, opacity 0.8; цвета по умолчанию — `hsl(var(--primary))` /
`hsl(var(--accent))` (переменные темы).

## Входные данные

`BorderBeamProps`: `size?` (200); `duration?` (12, с); `delay?` (0);
`colorFrom?`; `colorTo?`; `borderWidth?` (1.5); `className?`. Родитель
— `relative` со скруглением.

## Анимации

`offset-path: rect(0% 100% 100% 0% round 0)`, keyframes
`border-beam-travel` (`offset-distance 0 → 100%`) в `<style jsx>`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/border-beam.tsx` — компонент (+ `ShimmerBorder`, `GlowingBorder`)

## Зависимости

`react`, `styled-jsx`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `animation` убрать,
`offsetDistance: \`${(((frame/fps - delay) / duration) % 1) * 100}%\``;
цвета задать явно (переменных темы в Remotion нет).

## Паттерны

`key-point-emphasis`, `comparison`
