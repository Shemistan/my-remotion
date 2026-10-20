# ParticleMorph — `motion-primitives-website/particle-morph`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `engine:three`, `webgl` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Облако из тысяч светящихся частиц, которое плавно перетекает из одной
3D-формы в другую: сфера → куб → тор → спираль, медленно вращаясь.

## Когда использовать

Трансформация, «из хаоса — форма», эволюция продукта, данные
складываются в структуру; эффектная заставка.

## Фразы из озвучки

- «данные превращаются в знания»
- «одна форма перетекает в другую»
- «продукт эволюционирует»

## Визуальный стиль

5000 частиц размером 0.03, `AdditiveBlending`, opacity 0.8; цвет — от
«направления» темы сайта (`useTheme().direction`: cyberpunk бирюзовый,
kinetic фиолетовый, luxury золотой, иначе оранжевый); камера `[0,0,5]`.

## Входные данные

`ParticleMorphProps`: `shapes?: ('sphere'|'cube'|'torus'|'spiral')[]`
(все четыре); `particleCount?` (5000); `speed?` (1); `size?` (0.03);
`className?`.

## Анимации

`useFrame(delta)`: `progress += delta*speed*0.2`, smoothstep-интерполяция
позиций текущей и следующей формы в буфере; вращение
`rotation.y += delta*0.1`. Формы sphere/cube/torus генерируются с
`Math.random`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/three/particle-morph.tsx` — компонент
- `templates/react-libriry/motion-primitives-website/src/lib/component-registry.ts` — запись «Particle Morph»

## Зависимости

`@react-three/fiber`, `three`, `@/lib/theme` (`useTheme` — нужен
провайдер темы сайта; вне него — проверить поведение).

## Совместимость и адаптация

`complex` (но переработка небольшая): `ThreeCanvas` из `@remotion/three`;
`p = frame/fps*speed*0.2`, `k = floor(p) % n`, `t = p % 1`, позиции —
smoothstep между `shapes[k]` и `shapes[k+1]` в рендере/`useEffect([frame])`;
`rotation.y = frame/fps*0.1`; генерацию форм засеять `random(seed)`;
`useTheme` заменить prop `color`.

## Паттерны

`transformation`, `abstract-concepts`
