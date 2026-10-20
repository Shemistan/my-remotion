# TextRoll — `motion-primitives/text-roll`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives` (`templates/react-libriry/motion-primitives`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENCE.md, © 2024 ibelick) |

## Что визуализирует

Слово «перекатывается» по буквам, как табло/барабан: каждая буква
поворачивается по `rotateX` на 90° и сменяется своей копией снизу, буквы
идут волной слева направо.

## Когда использовать

Акцент на одном слове или коротком заголовке, «щелчок» смены состояния,
интро бренда. Для смены одного слова на другое — `text-loop`.

## Фразы из озвучки

- «встречайте — новая версия»
- «и всё это одним кликом»
- «переворачиваем привычный подход»

## Визуальный стиль

3D-перспектива (`perspective:10000px`, `preserve-3d`,
`backface-visibility:hidden`), механичный, «табло».

## Входные данные

`TextRollProps`: `children: string`; `duration?` (0.5, с);
`getEnterDelay?` (`i => i*0.1`), `getExitDelay?` (`i => i*0.1 + 0.2`);
`transition?` (`{ ease: 'easeIn' }`); `variants?: {enter: {initial, animate}, exit: {initial, animate}}`
(по умолчанию enter `rotateX 0→90`, exit `rotateX 90→0`);
`onAnimationComplete?`; `className?`.

## Анимации

Для каждой буквы два `motion.span`: верхний уходит `rotateX 0→90`
(`transform-origin 50% 25%`), нижний приходит `rotateX 90→0`
(`50% 100%`), задержки по индексу. Одноразовая анимация на mount.

## Исходники и документация

- `templates/react-libriry/motion-primitives/components/core/text-roll.tsx` — компонент
- `templates/react-libriry/motion-primitives/app/docs/text-roll/page.mdx` — документация
- `templates/react-libriry/motion-primitives/app/docs/text-roll/text-roll-basic.tsx` — пример

## Зависимости

`motion` (`motion/react`).

## Совместимость и адаптация

`adaptable`: таймеров нет, только вход на mount. Для буквы `i`:
`pe = interpolate(frame, [d_enter(i)*fps, (d_enter(i)+duration)*fps], [0,1], {clamp, easing: Easing.in(Easing.ease)})`,
верхний span `rotateX(90*pe)`, нижний — `rotateX(90*(1-px))`, где `px` —
такой же прогресс, но с задержкой `getExitDelay(i)`. Разметку и 3D-классы
оставить.

## Паттерны

`key-point-emphasis`, `transformation`
