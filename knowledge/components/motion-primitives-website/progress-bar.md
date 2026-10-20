# ProgressBar — `motion-primitives-website/progress-bar`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `numbers-counters` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Горизонтальная полоса прогресса, пружинно заполняющаяся до значения;
опционально подпись «Progress N %», свечение и бегущие диагональные
полосы.

## Когда использовать

Прогресс проекта/загрузки/выполнения плана, «готово на 65 %», доля от
целого в одной строке; несколько полос — простое сравнение.

## Фразы из озвучки

- «мы выполнили план на 65 процентов»
- «загрузка почти завершена»
- «до цели осталась треть»

## Визуальный стиль

Высота `sm` 1.5 / `md` 2.5 / `lg` 4 (Tailwind), `rounded-full`, фон
`bg-muted`, полоса `bg-primary` (переменные темы); glow
`shadow-[0_0_12px_currentColor]`.

## Входные данные

`ProgressBarProps`: `value: number`; `max?` (100); `color?`
(`'bg-primary'`); `size?: 'sm'|'md'|'lg'` (`'md'`); `showLabel?` (false);
`variant?: 'spring'|'smooth'|'bounce'` (`'spring'`); `glow?` (false);
`striped?` (false); `className?`.

## Анимации

`useSpring(0)` → `width %`; пружины: spring 100/20/0.8, smooth 50/30/1,
bounce 300/15/0.5; полосы — `animate-[shimmer_1s_linear_infinite]`
(keyframes `shimmer`). Подпись показывает целевой процент сразу, не
анимированно.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/progress.tsx` — компонент (+ `StepIndicator`, `CircularProgress`)
- `templates/react-libriry/motion-primitives-website/src/lib/component-registry.ts` — запись «Progress Bar»

## Зависимости

`framer-motion`, `tailwindcss`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `w = percentage * spring({frame: frame - s, fps, config: {stiffness: 100, damping: 20, mass: 0.8}})`
→ `width: ${w}%`; подпись — `Math.round(w)` для синхронного счёта;
полосы — `backgroundPosition` от кадра; цвета темы заменить.

## Паттерны

`quantities`, `growth-decline`, `comparison`
