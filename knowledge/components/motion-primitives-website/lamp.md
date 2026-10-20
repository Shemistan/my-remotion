# Lamp — `motion-primitives-website/lamp`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `layout-templates` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Драматичная хиро-сцена «лампа» (Aceternity): два конических луча света
расходятся сверху, светящаяся линия и ореол раскрываются в ширину, под
ними — заголовок.

## Когда использовать

Интро, раскрытие названия продукта/главы, финальный «вау»-кадр; тёмная
тема.

## Фразы из озвучки

- «встречайте»
- «свет на главное»
- «и вот он — наш продукт»

## Визуальный стиль

Цвет лучей/ореола — `primary` темы, фон — `background` темы
(CSS-переменные); `conic-gradient` from 70°/290° at center top,
`blur-2xl/3xl`, `min-h-screen`.

## Входные данные

`LampProps`: `children?`; `className?`. Упрощённый вариант —
отдельная запись `lamp-container`.

## Анимации

`whileInView`: лучи `width 15rem → 30rem`, `opacity 0.5 → 1`; ореол
`8 → 16rem`; линия `15 → 30rem`; delay 0.3 с, 0.8 с, `easeInOut`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/lamp.tsx` — компонент (+ `LampContainer`)

## Зависимости

`framer-motion`, `tailwindcss` (утилита `bg-gradient-conic` и цвета
`primary`/`background` из `tailwind.config.ts`; `bg-gradient-conic` в
конфиге не найдена — без неё `--tw-gradient-stops` не применится),
`@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `whileInView` → `p = interpolate(frame, [0.3*fps, 1.1*fps], [0,1], {clamp, easing: Easing.inOut(Easing.ease)})`;
`width: ${15 + 15p}rem`, `opacity 0.5 + 0.5p` (ореол — `8 + 8p rem`);
conic-градиент задать inline явными цветами вместо
`bg-gradient-conic from-… via-…`; переменные темы заменить цветами.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
