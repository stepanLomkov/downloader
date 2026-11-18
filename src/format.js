/**
 * Чистые хелперы форматирования: байты, время, скорость, отступы,
 * ASCII-прогресс-бар. Не зависят от состояния терминала и не печатают.
 */

/**
 * Форматирует количество байт в человекочитаемую строку.
 * Пороги — 1024 (KB) и 1048576 (MB), как принято для «двоичных» единиц.
 *
 * @param {number} b — число байт
 * @returns {string}  например "5.42 МБ", "812.3 КБ", "954 Б"
 */
export const fmtBytes = b => {
  if (b >= 1048576) return (b / 1048576).toFixed(2) + ' МБ';
  if (b >= 1024) return (b / 1024).toFixed(1) + ' КБ';
  return b + ' Б';
};

/**
 * Форматирует длительность: миллисекунды до 1000, дальше — секунды.
 *
 * @param {number} ms — миллисекунды
 * @returns {string}  например "412 мс", "1.82 с"
 */
export const fmtMs = ms => (ms >= 1000 ? (ms / 1000).toFixed(2) + ' с' : Math.round(ms) + ' мс');

/**
 * Считает скорость (байт в секунду) и форматирует как "<размер>/с".
 * При нулевом или отрицательном времени возвращает прочерк,
 * чтобы не получить Infinity/NaN в выводе.
 *
 * @param {number} bytes — сколько байт скачано
 * @param {number} ms    — за сколько миллисекунд
 * @returns {string}      например "5.49 МБ/с"
 */
export const fmtSpeed = (bytes, ms) => (ms > 0 ? fmtBytes(bytes / (ms / 1000)) + '/с' : '—');

/**
 * Дополняет строку пробелами справа до ширины n.
 * ВАЖНО: применять до покраски — иначе padEnd считает байты ANSI-кодов
 * и колонки разъезжаются. Сначала pad, потом color.
 */
export const pad = (s, n) => String(s).padEnd(n);

/**
 * Дополняет строку пробелами слева до ширины n.
 * Используется для выравнивания чисел вправо.
 */
export const padL = (s, n) => String(s).padStart(n);

/**
 * Рисует ASCII-прогресс-бар из символов █ (заполнено) и ░ (пусто).
 * fraction принудительно зажимается в [0, 1],
 * чтобы при рассинхроне Content-Length не нарисовать "рогатый" бар.
 *
 * @param {number} fraction — доля от 0 до 1
 * @param {number} width    — ширина бара в символах
 * @returns {string}         например "[██████░░░░░░░░░░░░░░]"
 */
export const renderBar = (fraction, width) => {
  const pct = Math.max(0, Math.min(1, fraction || 0));
  const filled = Math.round(pct * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
};