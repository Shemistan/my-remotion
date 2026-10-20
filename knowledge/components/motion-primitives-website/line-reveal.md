# LineReveal — `motion-primitives-website/line-reveal`

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

Блок из строк (дети с классом `.line`), которые по очереди поднимаются на
50 px и проявляются; в режиме `scrub` — строки «загораются» от 0.2 до 1
по мере прокрутки.

## Когда использовать

Абзац или список из нескольких строк, манифест, титры «по строке». Для
посимвольного — `character-reveal`.

## Фразы из озвучки

- «вот что мы поняли за этот год»
- «первое… второе… третье…»
- «прочитаем манифест команды»

## Визуальный стиль

`overflow-hidden`, строки размечает пользователь (`<div class="line">`);
`power3.out`, 0.8 с, stagger 0.1 с.

## Входные данные

`LineRevealProps`: `children: ReactNode` (строки с классом `line`);
`scrub?` (false); `className?`.

## Анимации

GSAP `fromTo('.line', {y: 50, opacity: 0}, {y: 0, opacity: 1, stagger: 0.1,
duration: 0.8, ease: 'power3.out', scrollTrigger})`; при `scrub` —
`opacity 0.2 → 1` по ScrollTrigger на каждую строку.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/text/text-reveal.tsx` — компонент

## Зависимости

`gsap`, `gsap/ScrollTrigger`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: GSAP здесь — одиночный tween, без timeline. Заменить на
явный рендер строк из массива и стиль по кадру:
`p_i = interpolate(frame, [s + i*0.1*fps, s + (i*0.1 + 0.8)*fps], [0,1], {clamp, easing: Easing.out(Easing.cubic)})`,
`opacity: p_i`, `translateY(${50*(1-p_i)}px)`. `querySelectorAll`,
ScrollTrigger и `ScrollTrigger.getAll().kill()` (он убивает чужие
триггеры) удалить. Режим `scrub` — тот же прогресс, `opacity 0.2 → 1`.

## Паттерны

`sequence-steps`, `key-point-emphasis`
