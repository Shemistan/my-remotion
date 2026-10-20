# BoldCopy — `animata/bold-copy`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Двухслойная надпись капсом шрифтом Tourney: крупная бледная «тень» слова
(foreground/15) и поверх — меньшая яркая копия; по hover верхняя копия
вырастает, тень бледнеет.

## Когда использовать

Статичная композиция «слово + эхо» для титра раздела; эффект роста —
по кадру как «укрупнение» ключевого слова.

## Фразы из озвучки

- «одно слово, которое всё объясняет»
- «запомните это»
- «крупным планом»

## Визуальный стиль

Плакатный, контрастный, uppercase, Google-шрифт Tourney.

## Входные данные

`text: string` (по умолчанию `"animata"`), `size?: "sm" | "md" | "xl"`
(`"xl"`), `className?`, `textClassName?`, `backgroundTextClassName?`.
Пресеты размеров — Tailwind-классы с `group-hover/bold:` вариантами.

## Анимации

Только hover: `transition-all duration-300` у верхнего слоя (font-size
меняется), `transition-all` + opacity 50% у тени.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/bold-copy.tsx` — компонент
- `templates/react-libriry/animata/content/docs/text/bold-copy.mdx` — документация
- `templates/react-libriry/animata/animata/text/bold-copy.stories.tsx` — пример

## Зависимости

`next/font/google` (`Tourney`), `@/lib/utils`.

## Совместимость и адаптация

Hover-анимацию воспроизвести по кадру: интерполировать `fontSize` верхнего
слоя (например md: 1.25rem → 2.25rem) и opacity тени из `frame`. Шрифт —
через `@remotion/google-fonts` вместо `next/font`.

## Паттерны

`key-point-emphasis`
