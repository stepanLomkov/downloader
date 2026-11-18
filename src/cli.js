/*
 * Разбор и валидация аргументов командной строки.
 *
 * Контракт: функция бросает Error при некорректных данных —
 * вызывающий код (index.js) сам решает, как реагировать
 * (печатать usage и выходить с кодом 2). Так cli.js остаётся тестируемым.
 */

import { DEFAULT_N } from './config.js';

/**
 * Парсит process.argv и возвращает нормализованные параметры запуска.
 *
 * Поддерживаемые формы:
 *   node src/index.js <url>           — N = DEFAULT_N
 *   node src/index.js <url> <n>       — N = n
 *
 * @param {string[]} argv — обычно process.argv
 * @returns {{targetUrl: URL, n: number}}
 * @throws {Error} если URL отсутствует, невалиден или не http(s),
 *                 либо N не является положительным числом
 */
export function parseArgs(argv) {
  // argv[0] = путь к node, argv[1] = путь к скрипту, argv[2] = URL, argv[3] = N
  const rawUrl = argv[2];
  const rawN = argv[3];

  // URL обязателен — без него работать не с чем
  if (!rawUrl) {
    throw new Error('Использование: node src/index.js <url> [n=10]');
  }

  // N — опционален, по умолчанию DEFAULT_N
  const n = rawN === undefined ? DEFAULT_N : Number(rawN);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`N должно быть положительным числом, получено: ${rawN}`);
  }

  // Валидация URL: конструктор URL выкенет ошибку, если строка не парсится
  let targetUrl;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    throw new Error(`Невалидный URL: ${rawUrl}`);
  }

  // Поддерживаем только http/https — file://, ftp:// и прочее отсекаем
  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    throw new Error(`Поддерживается только http/https, получено: ${targetUrl.protocol}`);
  }

  return { targetUrl, n };
}
