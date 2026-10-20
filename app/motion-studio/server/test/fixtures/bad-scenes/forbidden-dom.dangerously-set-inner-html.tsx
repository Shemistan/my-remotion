// Плохая сцена: ровно одно нарушение (правило — префикс имени файла).
export const Scene = () => <div dangerouslySetInnerHTML={{ __html: "<b>x</b>" }} />;
