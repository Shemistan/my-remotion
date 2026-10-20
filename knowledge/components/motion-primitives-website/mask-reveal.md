# MaskReveal — `motion-primitives-website/mask-reveal`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Изображение или блок раскрывается маской `clip-path`: шторкой слева
направо, снизу вверх, по диагонали или расширяющимся кругом.

## Когда использовать

Появление фото, скриншота, продукта, карточки; «раскрываем результат»;
круг — для акцента на центре.

## Фразы из озвучки

- «и вот как это выглядит»
- «раскроем результат»
- «посмотрите на новый интерфейс»

## Визуальный стиль

`overflow-hidden`; 1.2 с, кривая `[0.76, 0, 0.24, 1]` — резкий старт и
мягкий финиш.

## Входные данные

`MaskRevealProps`: `children`; `maskType?: 'horizontal'|'vertical'|
'diagonal'|'circle'` (`'horizontal'`); `delay?` (0); `className?`.

## Анимации

`whileInView` (once): horizontal `inset(0 100% 0 0) → inset(0 0% 0 0)`;
vertical `inset(100% 0 0 0) → inset(0%…)`; diagonal — `polygon`;
circle — `circle(0% → 100% at 50% 50%)`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/transitions/page-transition.tsx` — компонент

## Зависимости

`framer-motion`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `whileInView` убрать;
`p = interpolate(frame, [delay*fps, (delay + 1.2)*fps], [0,1], {clamp, easing: Easing.bezier(0.76, 0, 0.24, 1)})`;
`clipPath` строкой: `inset(0 ${100*(1-p)}% 0 0)`, `circle(${100p}% at 50% 50%)`
и т.д. Картинки внутри — `Img` из remotion.

## Паттерны

`key-point-emphasis`, `transformation`
