// EN -> RU: запрос на английском должен находить русскоязычную KB.
// Значения нормализуются тем же tokenize, что и текст (усечение до 6, ё -> е).
export const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  chart: ["график"],
  growth: ["рост"],
  counter: ["счетчик"],
  number: ["число"],
  user: ["пользов"],
  architecture: ["архите"],
  diagram: ["схем"],
  node: ["узел"],
  edge: ["связ"],
  pulse: ["импуль"],
  beam: ["луч"],
  flow: ["поток"],
  kinetic: ["кинети"],
  typography: ["типогр", "текст"],
  card: ["карточ"],
  depth: ["объем", "глубин"],
};
