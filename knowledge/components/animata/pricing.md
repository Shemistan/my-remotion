# Pricing — `animata/pricing`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `user-events`, `raf` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Белая карточка выбора тарифа: сверху переключатель-капсула Monthly /
Yearly с ездящей подложкой, ниже список планов (название, бейдж «Popular»,
цена «/month» или «/year», радио-кружок), выбранный план обведён толстой
чёрной рамкой; внизу чёрная кнопка «Get Started».

## Когда использовать

Цены и тарифы, «выберите план», сравнение месячной и годовой оплаты.

## Фразы из озвучки

- «выберите подходящий тариф»
- «при годовой оплате — дешевле»
- «самый популярный план — Pro»

## Визуальный стиль

Монохромный zinc: белый, серая капсула, чёрная рамка выбора,
font-extrabold; пружины stiffness 300 / damping 30.

## Входные данные

`plans: {name, monthlyPrice: string, yearlyPrice: string, popular?}[]`
(обязателен), `width: "sm"|"md"|"lg"|"xl" = "lg"`,
`outerRadius: "normal"|"rounded"|"moreRounded" = "rounded"`,
`padding: "small"|"medium"|"large" = "medium"`. `onPlanSelect`,
`onCycleChange` объявлены в типе, но в коде не вызываются. Выбран по
умолчанию план с именем «Basic».

## Анимации

`motion`: `animate x` подложки цикла, `layoutId` рамки выбора,
`whileHover/whileTap`, scale радио-кружка; `AnimatedPrice` —
`requestAnimationFrame` 50 мс интерполяции цены при смене цикла.

## Исходники и документация

- `templates/react-libriry/animata/animata/section/pricing.tsx` — компонент
- `templates/react-libriry/animata/content/docs/section/pricing.mdx` — документация
- `templates/react-libriry/animata/animata/section/pricing.stories.tsx` — пример

## Зависимости

`motion`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: статичная карточка рендерится сразу. Для сюжета «переключили
на Yearly» — сделать `billingCycle`/`selectedPlan` пропсами из кадра,
подложку двигать `x` из `interpolate`, цену — `interpolate` между
числами вместо rAF; `motion.*` заменить обычными элементами.

## Паттерны

`comparison`, `quantities`
