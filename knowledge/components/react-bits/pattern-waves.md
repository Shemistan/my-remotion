# PatternWaves — `react-bits/pattern-waves`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `engine:other`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Движущаяся поверхность, «напечатанная» растром: точки, квадраты, плюсы,
контурные линии или символы ASCII (`glyph`), чей размер/яркость следует
волне (`silk` — складки ткани, `swell` — параллельные валы, `ripple` —
кольца).

## Когда использовать

Фон в стиле печати/полутона/терминала: технологии, данные, «код». Пресеты
`silk | ocean | pond | lines | terminal | mesh` дают разные настроения.

## Фразы из озвучки

- «данные текут, как волны»
- «за каждой точкой — реальный пользователь»
- «сигнал проходит сквозь шум»

## Визуальный стиль

Один цвет знаков (`color = '#ffffff'`) на фоне (`backgroundColor`),
растушёвка `fade = 'edges' | 'center' | 'bottom' | 'top' | 'none'`.

## Входные данные

`preset = 'silk'` (задаёт `pattern`, `wave`, `spacing`, `markSize`, `depth`,
`light`, `shine`, `contrast`, `speed`, `scale`, `direction` — каждый можно
переопределить), `color = '#ffffff'`, `backgroundColor = '#000000'`,
`opacity`, `fade`, `fadeSize`, `characters = '.:-=+*#%@'`,
`interactive = true`, `cursorSize = 50`, `cursorStrength = 0.6`,
`intro = true`, `paused = false`. Полный список — PropTable демо.

## Анимации

OGL: `Renderer`, `Program`, `Mesh`, `Triangle`, `RenderTarget`, `Texture`;
шейдерное время в rAF, курсор продавливает поверхность.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/PatternWaves/PatternWaves.jsx` (+ `PatternWaves.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/PatternWaves/PatternWaves.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/PatternWavesDemo.jsx`

## Зависимости

`ogl`

## Совместимость и адаптация

`complex`: рецепт R1 (вариант OGL — `program.uniforms.uTime.value` из
кадра, `renderer.render` в эффекте), `interactive={false}`, `intro={false}`.

## Паттерны

`abstract-concepts`, `quantities`
