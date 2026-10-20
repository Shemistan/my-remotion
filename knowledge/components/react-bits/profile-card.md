# ProfileCard — `react-bits/profile-card`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `dom`, `user-events`, `svg` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Карточка профиля: большое фото с именем и должностью, голографическая
фольга, проступающая через узор (`iconUrl`), блик и зерно; снизу — мини-аватар,
@handle, статус «Online» и кнопка «Contact». Карточка наклоняется в 3D,
при intro сама поворачивается и успокаивается.

## Когда использовать

Представление спикера, автора, сотрудника, клиента-героя кейса,
«знакомьтесь — это Анна». Для коллекционного вида — `react-bits/holo-card`,
для 3D-бейджа на ремешке — `react-bits/lanyard`.

## Фразы из озвучки

- «Знакомьтесь, наш ведущий инженер»
- «Слово эксперту»
- «Автор этого исследования — Мария»

## Визуальный стиль

Тёмная/светлая рамка, плитка с градиентом, радиус 16, зелёная точка
статуса `#22c55e`; премиальный «карточный» стиль с голо-переливом.

## Входные данные

`avatarUrl=''`, `iconUrl`, `miniAvatarUrl`, `name='Javi A. Torres'`,
`title='Software Engineer'`, `handle='javicodes'`, `status='Online'`,
`statusColor='#22c55e'`, `contactText='Contact'`, `showUserInfo=true`,
`onContactClick`, `theme='dark'`, `backdropColor`, `radius=16`, `holo=0.8`,
`glare=0.5`, `enableTilt=true`, `tiltStrength=12`, `parallax=8`,
`enableMobileTilt=false`, `mobileTiltSensitivity=5`, `intro=true`, `className`.

## Анимации

rAF-пружины по осям `x/y` (−1…1) и «свет» `light` пишут CSS-переменные
`--pc-rotate-x/y`, `--pc-pointer-x/y`, `--pc-shift-x/y`, `--pc-light-x/y`,
`--pc-active`; вся картинка (наклон, блик, фольга) — CSS от них. Intro:
старт с `x=0.62, y=-0.55`, мягкая пружина 1,4 с к центру.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/ProfileCard/ProfileCard.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/ProfileCard/ProfileCard.css` — фольга, блик, наклон
- `templates/react-libriry/react-bits/src/ts-default/Components/ProfileCard/ProfileCard.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/ProfileCardDemo.jsx` — демо
- https://reactbits.dev/components/profile-card

## Зависимости

`@hugeicons/react`, `@hugeicons/core-free-icons`.

## Совместимость и адаптация

`adaptable`: картинка — функция трёх чисел. Рецепт intro:
`s = spring({frame, fps, config:{stiffness:24, damping:9}})`,
`x = 0.62*(1-s)`, `y = -0.55*(1-s)`, `light = 1 - s` (или свой путь
наклона), затем те же формулы `write()` в inline CSS-переменные корня.
rAF, pointer/deviceorientation убрать; `offsetWidth/Height` для `--pc-light-*`
задать из известных размеров. Фото — `staticFile`.

## Паттерны

`key-point-emphasis`
