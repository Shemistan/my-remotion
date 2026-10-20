# HeroSectionTextHover — `animata/hero-section-text-hover`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | example |
| Категория | `layout-templates` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Hero «Embark on Uncharted Adventures and Feel Alive» с иконкой карты и
жёлтой кнопкой: при наведении на ключевую фразу она окрашивается
(sky-400 / orange-500), а вокруг неё «выпрыгивают» 4 эмодзи (🪂🏖️🚁🏯 /
🦝🍜🏝️💎) с поворотами и упругим перелётом.

## Когда использовать

Путешествия, приключения, «откройте для себя»; любой титр, где ключевое
слово «обрастает» иконками. Hover-анимацию воспроизвести по кадру.

## Фразы из озвучки

- «отправляйтесь навстречу приключениям»
- «почувствуйте себя живым»
- «весь мир — в одном приложении»

## Визуальный стиль

Светлый, рамка `rounded-2xl border-gray-200`, текст `md:text-2xl font-bold`,
эмодзи `md:text-4xl`; easing `cubic-bezier(0.5,1.8,0.4,1)` (перелёт).

## Входные данные

Объявлены `destinations?`, `treasures?: {emoji, position}[]`, но
компонент их не читает — массивы зашиты внутри; реально используется только
`className?`.

## Анимации

`group-hover/hero`: opacity слоя эмодзи (`transition-opacity`), у каждого
эмодзи `transition-transform duration-300` — сдвиг/поворот (классы в
`position`) и `scale-110`.

## Исходники и документация

- `templates/react-libriry/animata/animata/hero/hero-section-text-hover.tsx` — компонент
- `templates/react-libriry/animata/content/docs/hero/hero-section-text-hover.mdx` — документация
- `templates/react-libriry/animata/animata/hero/hero-section-text-hover.stories.tsx` — пример

## Зависимости

`lucide-react` (`Map`), `@/lib/utils`.

## Совместимость и адаптация

Прогресс `p` по кадру для каждой группы (сначала первая фраза, потом
вторая): opacity слоя = p, transform эмодзи = интерполяция от исходной
позиции к hover-позиции (rotate/translate из классов) с
`Easing.bezier(0.5,1.8,0.4,1)`. Подключить реальные props вместо зашитых
массивов.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
