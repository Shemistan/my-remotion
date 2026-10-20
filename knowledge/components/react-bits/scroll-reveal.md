# ScrollReveal — `react-bits/scroll-reveal`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:gsap`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Абзац/цитата, слова (буквы или строки) которой проявляются по очереди:
из почти прозрачного (`baseOpacity=0.1`) и размытого — в чёткий текст,
опционально с подъёмом из-под маски, 3D-переворотом или «выпрыгиванием»,
короткой вспышкой акцентного цвета; весь блок слегка доворачивается из
наклона `baseRotation` в 0.

## Когда использовать

Цитата, тезис или манифест, который диктор читает вслух — слова
проявляются в темпе речи. Подходит для длинного текста (2–4 строки).
Для короткого заголовка — `split-text`/`blur-text`.

## Фразы из озвучки

- «как сказал наш первый клиент…»
- «запомните одну простую мысль»
- «вот что мы поняли за десять лет»

## Визуальный стиль

Спокойный, редакционный: полужирный текст `clamp(1.6rem, 4vw, 3rem)`,
мягкое размытие, поворот на 3°.

## Входные данные

`children` (строка — делится на слова/буквы), `scrollContainerRef?`,
`enableBlur=true`, `baseOpacity=0.1`, `baseRotation=3`, `blurStrength=4`,
`baseOffset=0`, `stagger=0.05`, `smoothing=0`, `splitBy='words'`
(`words|chars|lines`), `effect='fade'` (`fade|rise|flip|scale`),
`mode='scrub'` (`scrub|enter`), `duration=0.8`, `highlightColor=''`,
`containerClassName=''`, `textClassName=''`,
`rotationEnd='bottom bottom'`, `wordAnimationEnd='bottom bottom'`.

## Анимации

GSAP анимирует один объект `state.p` 0→1 (ScrollTrigger scrub или
`gsap.to` при входе в `mode='enter'`), а `render()` вызывает чистую
`paintPiece(piece, t, look)`: `t = clamp01((p * total - order[i] *
stagger) / span)` → opacity, `translateY`/`rotateX`/`scale`, blur, цвет.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/ScrollReveal/ScrollReveal.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/ScrollReveal/ScrollReveal.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/ScrollReveal/ScrollReveal.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/ScrollRevealDemo.jsx` — демо
- https://reactbits.dev/text-animations/scroll-reveal

## Зависимости

`react`, `gsap` (+ `gsap/ScrollTrigger`).

## Совместимость и адаптация

`adaptable`, несмотря на скролл: вся картинка — чистая функция
прогресса. Рецепт: удалить ScrollTrigger/`gsap.matchMedia`, взять
`p = interpolate(frame, [start, end], [0, 1], {extrapolateRight:
'clamp'})`, для каждого куска вычислить `t` той же формулой и
применить стили `paintPiece` в рендере; поворот блока —
`interpolate(frame, …, [baseRotation, 0])` с easeOut. Для
`splitBy='lines'` строки измерить один раз через `offsetTop`.

## Паттерны

`key-point-emphasis`, `sequence-steps`
