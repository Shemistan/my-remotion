# Particle System — `remotion-bits/particle-system`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Поле частиц из произвольных React-элементов (точки, эмодзи, конфетти,
слова, картинки), которые рождаются из точки/области, летят с начальной
скоростью и подчиняются поведениям: гравитация, сопротивление, дрожание,
изменение масштаба и прозрачности за жизнь.

## Когда использовать

Конфетти на достижение, снег/звёзды/светлячки как фон, фонтан, «поток
идей/данных», слова, летящие на камеру. Для цифрового дождя — `matrix-rain`.

## Фразы из озвучки

- «мы отпраздновали миллионного пользователя»
- «идеи сыплются со всех сторон»
- «тысячи запросов в секунду»
- «за окном тихо падает снег»

## Визуальный стиль

Сам ничего не рисует — вид частицы задаёт `children` спавнера (несколько
детей = варианты, выбираются по seed). Контейнер `AbsoluteFill`.

## Входные данные

- `<Particles>`: `startFrame?` (0, «прокрутить» симуляцию вперёд), `style?`,
  `className?`, `children` — только `<Spawner>`/`<Behavior>`.
- `<Spawner>`: `rate?` (частиц/кадр), `burst?` (сразу на кадре 0), `max?`,
  `id?`, `startFrame?`, `position?: {x,y,z}`, `area?: {width,height,depth?}`,
  `velocity?: {x,y,z?,varianceX?,varianceY?,varianceZ?}`, `lifespan?` (60),
  `lifespanVariance?`, `transition?` (StaggeredMotion-переход по возрасту
  частицы), `children`.
- `<Behavior>`: `gravity?: {x?,y?,z?,variance*}`, `drag?`, `dragVariance?`,
  `wiggle?: {magnitude, frequency? (0.5)}`, `wiggleVariance?`, `scale?:
  {start,end,startVariance?,endVariance?}`, `opacity?: number[]` (только
  массив из 2 значений; объектная форма игнорируется),
  `opacityStartVariance?`, `opacityEndVariance?`, `handler?` (свой).

## Анимации

`simulateParticles` на каждом кадре заново: число рождённых = burst +
floor(frame·rate), для живых — «реплей» Эйлера от рождения до текущего
возраста; все случайности — `random(seed)` из remotion. Позиция/поворот/масштаб
— `translate3d … rotate … scale`, плюс opacity; дети-`StaggeredMotion`
получают `cycleOffset = age`.

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/components/ParticleSystem/Particles.tsx` — контейнер
- `templates/remotion-components/remotion-bits/src/components/ParticleSystem/Spawner.tsx` — источник
- `templates/remotion-components/remotion-bits/src/components/ParticleSystem/Behavior.tsx` — поведения
- `templates/remotion-components/remotion-bits/src/utils/particles/simulator.ts` — симуляция
- `templates/remotion-components/remotion-bits/docs/src/content/docs/reference/particle-system.mdx` — справка
- `templates/remotion-components/remotion-bits/docs/src/bits/examples/particle-system/ParticlesSnow.tsx` — пример

## Зависимости

`remotion` (`AbsoluteFill`, `useCurrentFrame`, `useVideoConfig`, `random`);
внутренние `utils/particles`, `StaggeredMotion`.

## Совместимость и адаптация

`native`: состояние не хранится, кадр воспроизводим. Цена — O(частицы ×
возраст) на кадр: при большом `rate`·`lifespan` рендер замедляется; держать
`max`/`lifespan` умеренными. Координаты от левого верхнего угла — центр
задавать через `position` (например `rect.cx`). `drag` без variance не
гасит скорость по z.

## Паттерны

`quantities`, `abstract-concepts`, `key-point-emphasis`
