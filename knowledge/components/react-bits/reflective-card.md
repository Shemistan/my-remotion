# ReflectiveCard — `react-bits/reflective-card`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events`, `async-data`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Металлическая ID-карта (имя, роль, бейдж «Verified», статус, номер,
отпечаток), в сатиновой поверхности которой отражается зацикленное видео
или камера пользователя; карта наклоняется, по ней скользит блик.

## Когда использовать

Верификация, доступ, «цифровой паспорт», premium-аккаунт, корпоративный
пропуск. Для плоского профиля — `react-bits/profile-card`; для 3D-бейджа
на ремешке — `react-bits/lanyard`.

## Фразы из озвучки

- «Ваша личность подтверждена»
- «Цифровой пропуск всегда с собой»
- «Доступ только для проверенных сотрудников»

## Визуальный стиль

Тёмный/светлый сатиновый металл, 320×500, радиус 24, зелёный статус
`#22c55e`, монохромное отражение (`grayscale=1`) с искажением `warp`.

## Входные данные

`name='Alexander Doe'`, `role='Senior Developer'`, `badge='Verified'`,
`status='Active'`, `statusColor='#22c55e'`, `idLabel='ID number'`,
`idValue='8901 2345 6789'`, `children`, `theme='dark'`, `videoSrc`,
`webcam=false`, `onWebcamError`, `tint='#ffffff'`, `metalness=1`,
`roughness=0.3`, `blurStrength=6`, `grayscale=1`, `warp=0.6`,
`warpScale=1`, `shine=1`, `bevel=3`, `glare=0.5`, `enableTilt=true`,
`tiltStrength=12`, `intro=true`, `width=320`, `height=500`, `radius=24`,
`className`, `style`.

## Анимации

WebGL2-конвейер из трёх проходов (захват окружения из видео/камеры, blur
по X/Y, «пластина» металла) с uniform-ами наклона, блика и указателя;
intro 1400 мс; кадры видео/камеры загружаются в текстуру в цикле рендера.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/ReflectiveCard/ReflectiveCard.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/ReflectiveCard/ReflectiveCard.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/Components/ReflectiveCard/ReflectiveCard.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/ReflectiveCardDemo.jsx` — демо
- https://reactbits.dev/components/reflective-card

## Зависимости

`@hugeicons/react`, `@hugeicons/core-free-icons`.

## Совместимость и адаптация

`complex`: WebGL + живое видео. `webcam` (getUserMedia) в рендере
недоступен — только `videoSrc`. Рецепт: видео синхронизировать с кадром
(`OffthreadVideo` нельзя напрямую отдать в текстуру — проще `<video>` с
`currentTime = frame/fps` и `delayRender` до `seeked`), затем на каждый кадр
`upload` → `renderEnv` → `renderPlate` с наклоном от кадра. Файл прочитан
частично (шейдеры, рендерер, props); тайминг intro и rAF-цикл подробно не
разобраны.

## Паттерны

`key-point-emphasis`
