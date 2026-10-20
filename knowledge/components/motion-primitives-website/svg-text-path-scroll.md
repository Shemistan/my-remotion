# SvgTextPathScroll — `motion-primitives-website/svg-text-path-scroll`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:gsap`, `svg`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Жирный текст, повторённый через « • », бегущий по волнистой кривой
(`textPath`); сдвиг вдоль кривой привязан к прокрутке.

## Когда использовать

Бегущая лента-слоган по волне, «поток», декоративный заголовок раздела,
тема движения и пути. В видео сдвиг идёт от кадра.

## Фразы из озвучки

- «всё находится в постоянном движении»
- «поток данных не останавливается»
- «наш путь — это волна»

## Визуальный стиль

Кривая по умолчанию — двойная S-волна в `viewBox 0 0 800 400`;
`fontSize` 24, `letterSpacing 0.05em`, `fill currentColor`.

## Входные данные

`SvgTextPathScrollProps`: `text: string`; `path?` (две кубические
волны); `fontSize?` (24); `fill?`; `repeat?` (3); `speed?` (1);
`width?` (`'100%'`), `height?` (300), `viewBox?` (`'0 0 800 400'`);
`className?`.

## Анимации

ScrollTrigger (`scrub 0.5`) → `startOffset = -progress*100*speed %`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/svg/animated-svg.tsx` — компонент

## Зависимости

`gsap`, `gsap/ScrollTrigger`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: ScrollTrigger удалить, `startOffset={\`${-((frame/fps)*K*speed) % 100}%\`}`
(K — % в секунду) прямо в JSX `textPath`; для бесшовной ленты увеличить
`repeat`.

## Паттерны

`abstract-concepts`, `timeline`
