/*
 * Точка входа CLI.
 *
 * Сценарий:
 *   1. Разобрать argv (parseArgs).
 *   2. Создать keep-alive agent под протокол URL.
 *   3. Напечатать шапку.
 *   4. Сделать N последовательных замеров, печатая строку после каждого.
 *   5. Напечатать сводку. Выставить exit-code по числу ошибок.
 *
 * Ctrl+C корректно возвращает курсор и выходит с кодом 130.
 */

import { EXIT_BAD_ARGS, EXIT_FATAL, EXIT_INTERRUPTED } from './config.js';
import { parseArgs } from './cli.js';
import { createAgent } from './http.js';
import { measureOnce } from './measure.js';
import { printError, printHeader, printRow, printSummary } from './render.js';
import { CLEAR_LINE, HIDE_CURSOR, SHOW_CURSOR, isTTY, red } from './colors.js';

/**
 * Главный сценарий.
 * Возвращает управление после печати сводки;
 * exit-code устанавливается через process.exitCode (не process.exit),
 * чтобы stdout успел дотянуть буфер.
 */
async function main() {
  // ── 1. Аргументы ───────────────────────────────────────────────────────
  let targetUrl, n;
  try {
    ({ targetUrl, n } = parseArgs(process.argv));
  } catch (e) {
    console.error(red('Ошибка аргументов: ') + e.message);
    process.exit(EXIT_BAD_ARGS);
  }

  // ── 2. Keep-alive agent под протокол URL ───────────────────────────────
  const agent = createAgent(targetUrl);

  // ── 3. Шапка ───────────────────────────────────────────────────────────
  printHeader(targetUrl, n);

  // ── 4. Обработчик Ctrl+C, пока идут замеры ────────────────────────────
  const onSignal = () => {
    if (isTTY) process.stdout.write(SHOW_CURSOR);
    console.log('\n  ' + red('Прервано.'));
    process.exit(EXIT_INTERRUPTED);
  };
  process.on('SIGINT', onSignal);

  // Скрываем курсор на время работы — вернём перед сводкой/выходом
  if (isTTY) process.stdout.write(HIDE_CURSOR);

  // ── 5. Цикл последовательных замеров ──────────────────────────────────
  const results = []; // успешные измерения
  const errors = [];  // неуспешные: { idx, message }

  for (let i = 1; i <= n; i++) {
    try {
      const r = await measureOnce(targetUrl, agent, i);
      results.push(r);
      printRow(r);
    } catch (e) {
      if (isTTY) process.stdout.write(CLEAR_LINE); // стереть возможный live-бар
      errors.push({ idx: i, message: e.message });
      printError(i, e);
    }
  }

  // ── 6. Восстанавливаем терминал и снимаем обработчик ──────────────────
  if (isTTY) process.stdout.write(SHOW_CURSOR);
  process.removeListener('SIGINT', onSignal);

  // Освобождаем keep-alive сокеты — иначе Node не завершится
  agent.destroy();

  // ── 7. Сводка и exit-code ─────────────────────────────────────────────
  printSummary(results, errors);
  if (errors.length) process.exitCode = EXIT_FATAL;
}

// Запуск: если упадёт что-то необработанное — вернуть курсор и выйти
main().catch(e => {
  if (isTTY) process.stdout.write(SHOW_CURSOR);
  console.error(red('Фатальная ошибка: ') + e.message);
  process.exit(EXIT_FATAL);
});