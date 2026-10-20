# CelebrationConfetti — `motion-primitives-website/celebration-confetti`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Полноэкранный дождь конфетти: 80 цветных квадратиков и кружков падают
сверху вниз с вращением и боковым дрейфом, постепенно исчезая.

## Когда использовать

Праздник, достижение, запуск, «мы сделали это», рекорд, финал ролика.

## Фразы из озвучки

- «поздравляем — цель достигнута»
- «мы запустились!»
- «миллионный пользователь»

## Визуальный стиль

Цвета: `hsl(var(--primary))`, `hsl(var(--accent))`, `#FFD700`,
`#FF6B6B`, `#4ECDC4`, `#45B7D1`; размеры 4–14 px; `easeIn`, 2–4 с.

## Входные данные

`CelebrationProps`: `active?` (false — без него ничего не рендерится);
`particleCount?` (80); `className?`.

## Анимации

motion: `y -20 → 110vh`, `x` случайный → случайный (vw), `rotate 0 →
до 720`, `opacity 1 → 0`; `duration 2–4 с`, `delay 0–0.5 с`. Все
параметры — `Math.random()` прямо в рендере (пересчитываются при каждом
ререндере).

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/confetti.tsx` — компонент (+ `ConfettiButton`)

## Зависимости

`framer-motion`, `tailwindcss`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: параметры частицы `i` — `random(\`cf-${i}-x0\`)` и т.д. из
remotion; `t = clamp((frame/fps - delay_i)/dur_i)`, `ease = t*t`
(easeIn) → `top: ${-20 + ease*(1.1*H + 20)}px`,
`left: lerp(x0, x1, ease)`, `rotate(rot_i*ease)`, `opacity 1 - t`;
`fixed` заменить на `absolute` внутри `AbsoluteFill`, `vw/vh` — на
`width/height` из `useVideoConfig`; цвета темы — явные.

## Паттерны

`key-point-emphasis`, `cause-effect`
