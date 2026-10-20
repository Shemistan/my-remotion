# Ripple — `magicui/ripple`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Концентрические круги, расходящиеся от центра, мягко «дышат»
(сжимаются и разжимаются волной) — как круги на воде или сигнал
радара за центральным элементом.

## Когда использовать

Подложка за логотипом, иконкой, кнопкой-призывом: «сигнал», «трансляция»,
«центр притяжения», «влияние расходится». Сам контент кладётся поверх.

## Фразы из озвучки

- «всё начинается с одного центра»
- «сигнал расходится всё дальше»
- «влияние, которое ощущают все»

## Визуальный стиль

8 кругов от 210 px с шагом 70 px, opacity 0.24 и убывает на 0.03,
заливка `foreground/25`, рамка `foreground`, маска к низу; 2 с ease.

## Входные данные

- `mainCircleSize?` = `210`, `mainCircleOpacity?` = `0.24`, `numCircles?` = `8`
- `className?`, атрибуты `div`.

## Анимации

Класс `animate-ripple` → `ripple var(--duration,2s) ease calc(var(--i,
0)·.2s) infinite`; `@keyframes ripple`: `scale(1) → scale(0.9) →
scale(1)` с `translate(-50%,-50%)`. Inline `animationDelay: i·0.06s`
перебивает задержку из shorthand.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/ripple.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/registry/registry-ui.ts` — `@keyframes ripple`
- `templates/react-libriry/magicui/apps/www/content/docs/components/ripple.mdx` — документация

## Зависимости

Tailwind v4 (`mask-[…]`, переменные темы `--foreground`), `cn`.

## Совместимость и адаптация

`adaptable`. На каждый круг `animationDelay: \`${i·0.06 - frame/fps}s\``
+ `animationPlayState: 'paused'`, либо `scale = 1 - 0.05·(1 -
cos(2π·(t - 0.06i)/2))` прямо в `transform`.

## Паттерны

`key-point-emphasis`, `cause-effect`
