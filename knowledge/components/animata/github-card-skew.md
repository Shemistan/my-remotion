# GithubCardSkew — `animata/github-card-skew`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `numbers-counters` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `dom`, `css-transition`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Карточка-статистика: огромное «55%», подпись «Developer preference for
GitHub Copilot» и источник «Stack Overflow 2023 Survey»; карточка
наклоняется в 3D за курсором (до 4°/6°).

## Когда использовать

Один факт-статистика с источником: «55 % разработчиков…». Отличный
«стат-слайд»; наклон воспроизвести по кадру.

## Фразы из озвучки

- «больше половины разработчиков выбирают …»
- «по данным опроса 2023 года»
- «55 процентов — это много»

## Визуальный стиль

Тёмная карточка `rounded-3xl bg-zinc-700 p-10`, `font-mono text-6xl`.

## Входные данные

`className?`. Число, подпись и источник зашиты — вынести в props.

## Анимации

`useMousePosition` → `calculateCardRotation` (`maxRotationX 4`, `maxRotationY
6`) → `--x/--y` в `perspective(400px) rotateX rotateY`; transition 50 мс,
сброс по `setTimeout(300)`/mouseleave.

## Исходники и документация

- `templates/react-libriry/animata/animata/card/github-card-skew.tsx` — компонент
- `templates/react-libriry/animata/content/docs/card/github-card-skew.mdx` — документация
- `templates/react-libriry/animata/animata/card/github-card-skew.stories.tsx` — пример

## Зависимости

`@/hooks/use-mouse-position`, `@/lib/utils`.

## Совместимость и адаптация

`rotateX/rotateY` из кадра (лёгкое покачивание `sin(frame/fps)·4°` или
наклон на входе), число — адаптированный `animata/counter` или
`remotion-bits/animated-counter`.

## Паттерны

`quantities`, `key-point-emphasis`
