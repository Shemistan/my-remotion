# GradientReveal — `motion-primitives-website/gradient-reveal`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:gsap`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Текст «заливается» слева направо: фон-градиент, обрезанный по буквам
(`bg-clip-text`), растёт по `background-size` от 0 до 100 %.

## Когда использовать

Цитата или вывод, который «прочитывается» синхронно с диктором —
заливка идёт по мере произнесения; выделение ключевого предложения.

## Фразы из озвучки

- «и это самое важное, что нужно запомнить»
- «прочитайте эту фразу ещё раз»
- «вот наш главный принцип»

## Визуальный стиль

По умолчанию `from-white to-white` на `text-transparent` — на тёмном
фоне белая заливка; без подложки незаполненная часть невидима (нужно
добавить серый базовый цвет).

## Входные данные

`GradientRevealProps`: `text: string`; `className?`.

## Анимации

GSAP `fromTo(backgroundSize '0% 100%' → '100% 100%', ease 'none')` со
`scrollTrigger {start 'top 80%', end 'top 30%', scrub: true}` — прогресс
только от прокрутки.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/text/text-reveal.tsx` — компонент

## Зависимости

`gsap`, `gsap/ScrollTrigger`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: скролл заменить кадром —
`backgroundSize: \`${interpolate(frame, [s, e], [0, 100], {clamp})}% 100%\``
в inline-style; GSAP и ScrollTrigger удалить. Добавить второй слой
текста серым цветом под заливкой, чтобы непрочитанное было видно.

## Паттерны

`key-point-emphasis`, `transformation`
