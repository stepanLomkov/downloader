/**
 * Всё, что печатается в консоль: шапка, строки результатов, сводка.
 *
 * Только рендер, без сети и без измерения.
 * Тайминги и байты приходят снаружи в готовом виде.
 */

import { bold, cyan, dim, green, red, yellow } from './colors.js';
import { fmtBytes, fmtMs, fmtSpeed, pad, padL } from './format.js';
import { stats } from './stats.js';

/** Ширина горизонтальной линии-разделителя (в символах, не в байтах). */
const RULE_WIDTH = 66;

/**
 * Возвращает отрисованную горизонтальную линию с отступом 2 пробела.
 * Один и тот же разделитель используется в шапке и в сводке,
 * чтобы колонки не «прыгали».
 */
export const rule = () => '  ' + dim('─'.repeat(RULE_WIDTH));

/**
 * Печатает шапку: заголовок, URL, N, пометку про измеряемые байты
 * и строку с названиями колонок.
 *
 * @param {URL} targetUrl — адрес ресурса
 * @param {number} n      — сколько запросов будет выполнено
 */
export function printHeader(targetUrl, n) {
  console.log();
  console.log('  ' + bold('◆ Замер скорости скачивания'));
  console.log(rule());
  console.log(`  ${dim(pad('URL', 13))} ${targetUrl.toString()}`);
  console.log(`  ${dim(pad('Запросы', 13))} ${n} (последовательно)`);
  console.log(`  ${dim(pad('Измеряем', 13))} байты по сети (accept-encoding: identity)`);
  console.log(rule());
  // Заголовки колонок: статус, размер, TTFB, время скачивания, скорость
  console.log(
    `  ${dim(padL('#', 3))}  ${dim(pad('Статус', 7))} ` +
    `${dim(padL('Размер', 10))} ${dim(padL('TTFB', 8))} ` +
    `${dim(padL('Скачивание', 10))} ${dim(padL('Скорость', 13))}`
  );
}

/**
 * Печатает строку результата по одному успешному запросу.
 *
 * Пометки:
 *   - `*` после номера — первый запрос (включает DNS + TCP/TLS handshake),
 *     сноска об этом печатается в printSummary;
 *   - `200 !` жёлтым — если фактически прочитано байт не столько,
 *     сколько заявил Content-Length (обрыв, chunked без CL и т.п.).
 *
 * @param {{idx:number, bytes:number, contentLength:number,
 *          ttfbMs:number, downloadMs:number}} r
 */
export function printRow(r) {
  const mismatch = r.contentLength > 0 && r.bytes !== r.contentLength;
  const rawStatus = mismatch ? '200 !' : '200';
  const status = (mismatch ? yellow : green)(pad(rawStatus, 7));
  const mark = r.idx === 1 ? '*' : ' ';

  console.log(
    `  ${padL(r.idx, 3)}${mark} ${status} ` +
    `${padL(fmtBytes(r.bytes), 10)} ${padL(fmtMs(r.ttfbMs), 8)} ` +
    `${padL(fmtMs(r.downloadMs), 10)} ${padL(fmtSpeed(r.bytes, r.downloadMs), 13)}`
  );
}

/**
 * Печатает строку ошибки для одного запроса.
 *
 * @param {number} idx    — номер итерации
 * @param {Error}  err    — ошибка запроса
 */
export function printError(idx, err) {
  const mark = idx === 1 ? '*' : ' ';
  console.log(`  ${padL(idx, 3)}${mark} ${red(pad('ОШИБКА', 7))} ${dim(err.message)}`);
}

/**
 * Печатает итоговую сводку по всем измерениям:
 *   - сколько выполнено / сколько было ошибок;
 *   - суммарный объём и wall-time;
 *   - общую пропускную способность (по download-only времени);
 *   - статистику по скорости между итерациями (mean/median/range);
 *   - статистику по TTFB;
 *   - сноску про `*` (первый запрос платит handshake).
 *
 * @param {Array} results — успешные измерения из measureOnce
 * @param {Array<{idx:number, message:string}>} errors — неуспешные
 */
export function printSummary(results, errors) {
  console.log(rule());

  // Если ни один запрос не удался — сообщаем и выходим
  if (!results.length) {
    console.log('  ' + red('Все запросы упали.'));
    console.log(rule());
    return;
  }

  // Суммарные величины по всем успешным итерациям
  const totalBytes = results.reduce((s, r) => s + r.bytes, 0);
  const wallMs = results.reduce((s, r) => s + r.totalMs, 0);
  const dlMs = results.reduce((s, r) => s + r.downloadMs, 0);

  // Скорость по каждой итерации отдельно — для описательной статистики
  const spdS = stats(results.map(r => r.bytes / (r.downloadMs / 1000)));

  // TTFB по каждой итерации — чтобы видеть разброс
  const ttfbS = stats(results.map(r => r.ttfbMs));

  // Общая пропускная способность считается по download-only времени,
  // чтобы не размывать её handshake'ом первого запроса
  const overallSpeed = totalBytes / (dlMs / 1000);
  const mbps = overallSpeed * 8 / 1e6;

  console.log('  ' + bold('Итого'));
  console.log(
    `  ${dim(pad('Выполнено', 24))} ` +
    `${results.length} / ${results.length + errors.length}` +
    (errors.length ? red(` (${errors.length} с ошибкой)`) : '')
  );
  console.log(
    `  ${dim(pad('Всего данных', 24))} ` +
    `${fmtBytes(totalBytes)} за ${fmtMs(wallMs)} общего времени`
  );
  console.log(
    `  ${dim(pad('Пропускная способность', 24))} ` +
    `${bold(fmtBytes(overallSpeed) + '/с')} ` +
    dim(`(${mbps.toFixed(1)} Мбит/с, только скачивание)`)
  );
  console.log();
  console.log(`  ${dim(pad('Скорость (сред.)', 24))} ${fmtBytes(spdS.mean)}/с`);
  console.log(`  ${dim(pad('Скорость (медиана)', 24))} ${fmtBytes(spdS.median)}/с`);
  console.log(
    `  ${dim(pad('Скорость (диапазон)', 24))} ` +
    `${fmtBytes(spdS.min)}/с – ${fmtBytes(spdS.max)}/с`
  );
  console.log();
  console.log(`  ${dim(pad('TTFB (сред.)', 24))} ${fmtMs(ttfbS.mean)}`);
  console.log(
    `  ${dim(pad('TTFB (диапазон)', 24))} ${fmtMs(ttfbS.min)} – ${fmtMs(ttfbS.max)}`
  );
  console.log(rule());
  console.log('  ' + dim('* первый запрос включает DNS + TCP/TLS handshake — TTFB у него выше'));
  console.log(rule());
}
