# GlowEffect — `motion-primitives/glow-effect`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives` (`templates/react-libriry/motion-primitives`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENCE.md, © 2024 ibelick) |

## Что визуализирует

Размытое цветное свечение под карточкой/кнопкой: вращающийся
conic-градиент, пульсация, «дыхание», смена цвета, горизонтальный перелив
или статичный градиент.

## Когда использовать

Подложка-ореол под ключевым объектом (карточка продукта, цифра, логотип),
«энергия», «магия», премиальный акцент. Не путать с курсорными эффектами:
здесь курсор не используется, хотя описание в реестре говорит обратное.

## Фразы из озвучки

- «вот наш флагманский продукт»
- «всё самое важное — в одном месте»
- «добавим немного магии»

## Визуальный стиль

`absolute inset-0`, Tailwind-blur (`blur-xs … blur-xl` или число px),
цвета по умолчанию `#FF5733 #33FF57 #3357FF #F1C40F`; linear 5 с.

## Входные данные

`GlowEffectProps`: `colors?` (4 цвета выше); `mode?: 'rotate'|'pulse'|
'breathe'|'colorShift'|'flowHorizontal'|'static'` (`'rotate'`);
`blur?: number|'softest'|'soft'|'medium'|'strong'|'stronger'|'strongest'|'none'`
(`'medium'`); `scale?` (1); `duration?` (5); `transition?`; `className?`,
`style?`.

## Анимации

motion `animate` по массиву фонов: rotate — `conic-gradient(from 0deg → 360deg)`;
pulse — radial-градиенты по цветам + scale `[1, 1.1, 1]` + opacity
`[0.5, 0.8, 0.5]`; breathe — scale `[1, 1.05, 1]`; colorShift/flowHorizontal
— смена градиентов, `repeatType: 'mirror'`.

## Исходники и документация

- `templates/react-libriry/motion-primitives/components/core/glow-effect.tsx` — компонент
- `templates/react-libriry/motion-primitives/app/docs/glow-effect/page.mdx` — документация
- `templates/react-libriry/motion-primitives/app/docs/glow-effect/glow-effect-card-background.tsx` — пример

## Зависимости

`motion`, `@/lib/utils` (`cn`), Tailwind blur-классы.

## Совместимость и адаптация

`adaptable`: `t = (frame % (duration*fps)) / (duration*fps)`; rotate —
`background: conic-gradient(from ${360*t}deg at 50% 50%, …)`; pulse/breathe
— `m = 0.5 - 0.5*cos(2πt)` (mirror) → scale/opacity; смена градиентов —
выбрать пару соседних цветов по `t` и смешать `interpolateColors`.
Blur-класс заменить на `filter: blur(Npx)`.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
