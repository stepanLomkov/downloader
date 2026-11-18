/**
 * Описательная статистика по массиву чисел.
 * Используется в итоговой сводке: скорость (mean/median/min/max) и TTFB.
 */

/**
 * Считает среднее, медиану, минимум и максимум по массиву.
 *
 * Медиана считается корректно и для чётного, и для нечётного числа
 * элементов (для чётного — среднее двух центральных).
 *
 * @param {number[]} values — непустой массив чисел
 * @returns {{mean:number, median:number, min:number, max:number}|null}
 *          null, если массив пуст
 */
export function stats(values) {
  if (!values.length) return null;

  // Копия, чтобы не мутировать исходный массив сортировкой
  const sorted = [...values].sort((a, b) => a - b);

  // Среднее арифметическое
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  // Медиана: для нечётного — центральный элемент,
  // для чётного — среднее двух центральных
  const median = sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  return {
    mean,
    median,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}