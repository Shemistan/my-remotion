# Ken Burns Effect (bit) — `remotion-bits/bit-ken-burns`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `media` |
| Совместимость с Remotion | native |
| Флаги | `external-service` |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Слайд-шоу из трёх фотографий на весь кадр: каждая медленно наезжает или
отъезжает (scale) со смещением по x/y, слайды сменяются через cross-fade.

## Когда использовать

Фото-истории, документальные вставки, «вспомним, как всё начиналось»,
атмосферные фоны под закадровый голос. Для стены картинок —
`scrolling-images`; для мозаики — `bit-mosaic-reframe`.

## Фразы из озвучки

- «всё началось в небольшом гараже»
- «посмотрите на эти места»
- «годы спустя город изменился»

## Визуальный стиль

Чёрный фон (`className="bg-black"` — Tailwind), фото 177,78×100 vmin
`object-fit: cover`, плавные медленные движения; 300 кадров, 1920×1080.

## Входные данные

Без props: три URL `https://picsum.photos/seed/{1,2,4}/1920/1080` и
параметры движения в каждом `Step` (`scale` [1.1,1.4] / [1.3,1.1] /
[1.0,1.2], сдвиг x или y ≈4,6–5,6 vmin, `duration` 100). Константа
`IMAGE_URL` объявлена, но не используется.

## Анимации

`Scene3D` (`stepDuration` 60, `transitionDuration` 60), три `Step` по 100
кадров с z 0/−10/−20; вход `opacity [0,1]`, выход `opacity [1,0]`; внутри —
`StaggeredMotion` со scale и x/y за 100 кадров.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/scene-3d/KenBurns.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/ken-burns.mdx` — документация

## Зависимости

`remotion` (`AbsoluteFill`, `Img`), `remotion-bits` (`Scene3D`, `Step`,
`StaggeredMotion`, `useViewportRect`). См. `remotion-bits/scene-3d`.

## Совместимость и адаптация

`native` (используется `Img` из remotion, рендер ждёт загрузку). Картинки с
внешнего picsum.photos — нужна сеть при рендере; заменить на свои файлы
через `staticFile()`. `bg-black` заменить на `style={{background:'black'}}`
без Tailwind.

## Паттерны

`timeline`, `transformation`, `key-point-emphasis`
