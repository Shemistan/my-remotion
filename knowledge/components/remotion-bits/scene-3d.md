# Scene3D (Scene3D + Step + StepResponsive) — `remotion-bits/scene-3d`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

CSS-3D «мир» в духе impress.js: на сцене расставлены шаги (`Step`) со своими
позицией, поворотом и масштабом, а камера перелетает от шага к шагу с
easing. Внутри шага контент может входить/уходить с переходами; элементы в
`StepResponsive` меняют свои свойства в зависимости от активного шага.

## Когда использовать

Презентация-путешествие по слайдам, полёт по карте/схеме, Ken Burns по
скриншотам, куб/карусель из граней, «камера отъезжает и показывает всю
картину». Для отдельных объектов в 3D без шагов — `element-3d`.

## Фразы из озвучки

- «перейдём к следующему шагу»
- «а теперь посмотрим на картину целиком»
- «от идеи — к прототипу — к запуску»
- «приблизимся к этой части»

## Визуальный стиль

HTML-элементы в `perspective` + `transform-style: preserve-3d`, матрицы
`matrix3d`; никакого WebGL. Плавные облёты камеры, корпоративно-презентационно.

## Входные данные

- `Scene3D`: `perspective?` (1000), `transitionDuration?` (30), `easing?`
  ("easeInOutCubic"), `activeStep?: number | string` (иначе по кадру),
  `stepDuration?` (иначе длительность композиции / число шагов), `width?`,
  `height?` (дизайн-размер для fitScale), `className?`, `style?`, `children`.
- `Step`: `id?`, `duration?`, `x y z scale scaleX scaleY scaleZ rotateX
  rotateY rotateZ` (AnimatedValue; берётся конечное значение), `rotateOrder?`
  ("xyz"), `transition?`/`exitTransition?` (Transform+Visual+Timing +
  `stagger`, `staggerDirection`), `className?`, `style?`, `children`.
- `StepResponsive`: `steps` (объект `{"step-0": {...}, "step-1..step-3": {...}}`
  или массив), `transition?: {duration?, delay?, easing?}`, `defaultProps?`,
  `animate?` (true), `centered?`, `style?`, `children` (один элемент); у шага
  `duration: number | "step"`. Хуки `useStepResponsive`, `useScene3D`,
  `useCamera`, `useActiveStep`.

## Анимации

Активный шаг по кадру (enter/exit по накопленным длительностям). Камера =
обратная матрица трансформа шага; между шагами `Transform3D.lerp` (позиция
lerp, поворот slerp) с easing. Переходы шагов и вложенных компонентов
считаются от `enterFrame` шага через `StepTimingContext`.

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/components/Scene3D/Scene3D.tsx` — контейнер/камера
- `templates/remotion-components/remotion-bits/src/components/Scene3D/Step.tsx` — шаг
- `templates/remotion-components/remotion-bits/src/components/Scene3D/StepResponsive.tsx` — реакция на шаг
- `templates/remotion-components/remotion-bits/src/components/Scene3D/context.ts` — хуки контекста
- `templates/remotion-components/remotion-bits/src/components/Scene3D/types.ts` — типы
- `templates/remotion-components/remotion-bits/docs/src/content/docs/reference/scene3d.mdx`, `.../reference/step.mdx` — справка
- `templates/remotion-components/remotion-bits/docs/src/bits/examples/scene-3d/3DBasic.tsx` — пример

## Зависимости

`remotion`; `three` (только математика: Matrix4/Quaternion/Euler, не WebGL);
внутренние `utils/transform3d`, `utils/interpolate3d`, `utils/motion`,
`utils/StepContext`.

## Совместимость и адаптация

`native`: камера — функция кадра. `useLayoutEffect(registerStep)` в Step
фактически ничего не меняет. Анимированные массивы в props шага не
анимируются (берётся значение при progress=1). CSS 3D в headless Chrome
рендерится, но сложные сцены с `blur` и многими слоями — тяжелее.

## Паттерны

`sequence-steps`, `spatial`, `system-structure`, `timeline`
