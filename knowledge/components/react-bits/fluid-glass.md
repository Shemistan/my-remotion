# FluidGlass — `react-bits/fluid-glass`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Объёмный стеклянный объект (линза, капля, куб, капсула, тор, призма,
алмаз), который преломляет и дисперсирует ваш заголовок, картинку или
видео под ним; плавает, вращается и «перетекает» из формы в форму.

## Когда использовать

Эффектный hero-кадр, «посмотрите внимательнее», линза-увеличитель над
ключевым словом, абстрактная заставка AI/tech-продукта.

## Фразы из озвучки

- «Посмотрим на это под другим углом»
- «Присмотритесь внимательнее»
- «Прозрачность — наш главный принцип»

## Визуальный стиль

Фотореалистичное стекло с хроматической дисперсией (`dispersion=0.35`),
отражениями и тенью; размер 260 px, текст по умолчанию «Look closer.».

## Входные данные

`text='Look closer.'`, `textColor`, `fontFamily`, `fontWeight=600`,
`fontSize`, `src` (картинка или видео), `fit='cover'`,
`background='transparent'`, `shape='torus'`
(`lens|blob|cube|pill|torus|prism|diamond`), `shapes` (цикл морфинга),
`size=260`, `refraction=1`, `dispersion=0.35`, `reflection=1`, `frost=0`,
`color='#ffffff'`, `tint=0`, `shadow=0.5`, `elevation=0.4`,
`interaction='follow'`, `smoothness=0.5`, `wobble=0.5`, `spin=0.3`,
`idle=true`, `morphOnClick=true`, `onShapeChange`, `position=[0.5, 0.5]`,
`intro=true`, `maxDevicePixelRatio=2`, `className`, `style`, `children`.

## Анимации

Сырой WebGL2 (рейтрейсинг формы во фрагментном шейдере); в простое объект
дрейфует по `driftAt(clock)` (сумма синусов), вращается (`SPIN` по формам),
морфинг — `slerp` кватернионов и `smoother`-кривая; курсор тянет объект.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/FluidGlass/FluidGlass.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/FluidGlass/FluidGlass.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/Components/FluidGlass/FluidGlass.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/FluidGlassDemo.jsx` — демо
- https://reactbits.dev/components/fluid-glass

## Зависимости

Нет внешних пакетов (WebGL2).

## Совместимость и адаптация

`complex`: шейдер + свой цикл рендера. Рецепт: время (`clock`) брать как
`frame/fps`, позицию — `driftAt(frame/fps, size)` при `idle`, морфинг —
по расписанию кадров вместо клика; на каждый кадр выставлять uniform-ы и
рисовать в `useEffect` под `delayRender`. Медиа (`src`, особенно видео)
синхронизировать с кадром (`OffthreadVideo`/seek) и дождаться загрузки.
Файл прочитан частично (шейдерная часть и цикл не разобраны построчно).

## Паттерны

`abstract-concepts`, `key-point-emphasis`
