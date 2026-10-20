# MusicWidget — `animata/music-widget`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md); обложка `public/widget/music.jpg` — лицензия не указана |

## Что визуализирует

Виджет плеера 208×208: обложка 80px, название трека и исполнитель,
кнопки назад / play-pause / вперёд; в режиме воспроизведения рядом с
обложкой пульсируют три ноты.

## Когда использовать

Mockup музыкального сервиса/подкаста, «включаем плейлист», «сейчас
играет».

## Фразы из озвучки

- «сейчас играет ваш любимый трек»
- «нажмите play — и поехали»
- «музыка для работы»

## Визуальный стиль

Градиент indigo-200 → indigo-700 (dark: indigo-900/950), белые
иконки lucide, rounded-3xl.

## Входные данные

`className?`, `tracks?: {title, artist}[]` (по умолчанию Rick Astley /
Roxette / A-ha), `coverUrl = absoluteUrl("/widget/music.jpg")`,
`defaultPlaying = false`.

## Анимации

Ноты при `playing`: tw-animate-css `animate-in zoom-in repeat-infinite
direction-alternate-reverse duration-1000` с delay 0/300/500 мс. Кнопки
меняют индекс трека/состояние по клику.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/music-widget.tsx` — виджет
- `templates/react-libriry/animata/public/widget/music.jpg` — обложка
- `templates/react-libriry/animata/content/docs/widget/music-widget.mdx` — документация
- `templates/react-libriry/animata/animata/widget/music-widget.stories.tsx` — пример

## Зависимости

`lucide-react`, `@/lib/utils` (`absoluteUrl`).

## Совместимость и адаптация

`adaptable`: `playing` и индекс трека — из кадра/props; пульсацию нот —
`scale` из `interpolate` пинг-понгом вместо `animate-in`. Обложку —
`staticFile`; реальные названия песен и артистов заменить.

## Паттерны

`key-point-emphasis`
