# Text3DFlip — `magicui/text-3d-flip`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Каждая буква — грань маленького 3D-кубика; волной (stagger) кубики
поворачиваются на 90°, показывая вторую грань (можно другим цветом/
стилем), как табло-перевёртыш.

## Когда использовать

Смена состояния слова («было → стало»), акцент на названии, переход
между подписями в одном месте. Исходно запускается hover'ом — в видео
триггер переносится на кадр.

## Фразы из озвучки

- «переворачиваем представление о …»
- «одно движение — и всё иначе»
- «новая сторона продукта»

## Визуальный стиль

3D-перспектива на уровне символа (`transform-3d`, `backface-hidden`),
пружина damping 30 / stiffness 300; стиль граней — `textClassName` и
`flipTextClassName`.

## Входные данные

- `children: ReactNode` (текст извлекается рекурсивно), `as?` = `"p"`
- `className?`, `textClassName?`, `flipTextClassName?`
- `staggerDuration?` = `0.05` (с)
- `staggerFrom?: "first"|"last"|"center"|number|"random"` = `"first"`
- `transition?` = `{ type: "spring", damping: 30, stiffness: 300 }`
- `rotateDirection?: "top"|"right"|"bottom"|"left"` = `"right"`

## Анимации

`onMouseEnter` → `useAnimate()` анимирует `.text-3d-flip-char` к
`rotateX/rotateY(±90deg)` с задержкой по индексу, затем мгновенно
сбрасывает к 0. Графемы режутся `Intl.Segmenter`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/text-3d-flip.tsx` — компонент (default export)
- `templates/react-libriry/magicui/apps/www/content/docs/components/text-3d-flip.mdx` — документация

## Зависимости

`motion` (`useAnimate`), `cn`.

## Совместимость и адаптация

`adaptable`. Убрать `onMouseEnter`/`useAnimate`; в `CharBox` передать
угол `a = 90·spring({frame: frame - start - delay_i·fps, fps,
config:{damping:30, stiffness:300}})` и подставить в transform
контейнера символа. `staggerFrom: "random"` заменить на `random(seed)`.

## Паттерны

`transformation`, `key-point-emphasis`
