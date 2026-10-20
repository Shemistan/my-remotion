# CameraBlur / TrailBlur — `remotion-boilerplate/motion-blur`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-boilerplate` (`templates/remotion-components/remotion-boilerplate`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | UNLICENSED (package.json, README); файла LICENSE нет — только референс идей |

## Что визуализирует

Обёртки над `@remotion/motion-blur`: `CameraBlur` — плёночное размытие
движения всего содержимого; `TrailBlur` — «шлейф» из полупрозрачных копий.

## Когда использовать

Быстрые влёты текста/объектов, где нужен «киношный» smear; эффект скорости.
Сам компонент — тонкая обёртка: можно напрямую использовать
`CameraMotionBlur`/`Trail` из официального пакета.

## Фразы из озвучки

- «молниеносно»
- «на полной скорости»
- «всё происходит очень быстро»

## Визуальный стиль

Зависит от содержимого; shutterAngle 90 — резко, 180 — плёнка, 360 — максимум.

## Входные данные

`CameraBlur`: `children`, `shutterAngle?` (180), `samples?` (10).
`TrailBlur`: `children`, `layers?` (5), `lagInFrames?` (0.1),
`trailOpacity?` (0.7). Глобальный флаг `MOTION_BLUR_ENABLED = true`.

## Анимации

Нет своих: размывает анимацию детей, которые обязаны вызывать
`useCurrentFrame` **внутри** обёртки.

## Исходники и документация

- `templates/remotion-components/remotion-boilerplate/src/components/MotionBlur.tsx`
- `templates/remotion-components/remotion-boilerplate/README.md` — раздел «Motion Blur»

## Зависимости

`@remotion/motion-blur` 4.0.434.

## Совместимость и адаптация

`native`. Время рендера растёт пропорционально `samples`/`layers`.
UNLICENSED: без явной лицензии переиспользование кода юридически не
разрешено — только как референс идей (брать официальный пакет напрямую).

## Паттерны

`transformation`, `key-point-emphasis`
