/*
 * Одно измерение: один GET, полное чтение тела, сбор таймингов и байт.
 */

import { performance } from 'node:perf_hooks';
import { LIVE_REFRESH_MS } from './config.js';
import { httpGet } from './http.js';
import { CLEAR_LINE, cyan, dim, isTTY } from './colors.js';
import { fmtBytes, fmtSpeed, padL, renderBar } from './format.js';

/**
 * Делает один запрос к url и возвращает метрики по нему.
 *
 * Что меряем:
 *   totalMs    — от старта запроса до конца чтения тела (включая DNS/TLS)
 *   ttfbMs     — до первого байта (DNS + TCP + TLS + server latency)
 *   downloadMs — от первого байта до последнего (собственно скачивание)
 *
 * Именно downloadMs используется для расчёта скорости: иначе
 * handshake и server latency размывают «скорость скачивания» на маленьких файлах.
 *
 * Во время чтения (если stdout — терминал) рисует live-прогресс-бар,
 * throttle'ится до LIVE_REFRESH_MS, чтобы не жечь CPU.
 *
 * @param {URL} url        — целевой адрес
 * @param {http.Agent} agent — keep-alive агент
 * @param {number} idx     — номер итерации (для отображения #N)
 * @returns {Promise<{idx:number, bytes:number, contentLength:number,
 *                    totalMs:number, ttfbMs:number, downloadMs:number}>}
 * @throws {Error} если статус не 200 или сеть упала
 */
export async function measureOnce(url, agent, idx) {
  // t0 = момент старта запроса (до DNS/TCP/TLS)
  const t0 = performance.now();

  // Момент получения первого байта; 0 = ещё не было
  let tFirstByte = 0;

  // Сколько байт тела реально прочитали (сумма длин чанков)
  let bytes = 0;

  const res = await httpGet(url, agent);

  // Нас интересует только 200 OK — остальное считаем ошибкой запроса
  if (res.statusCode !== 200) {
    res.resume(); // дочитываем и выбрасываем тело, чтобы освободить сокет
    throw new Error(`HTTP ${res.statusCode}`);
  }

  // Content-Length — если сервер его отдал, используем для прогресс-бара
  // и для проверки «все ли байты дошли»
  const contentLength = Number(res.headers['content-length']) || 0;

  /**
   * Рисует одну строку live-прогресс-бара.
   * Вызывается throttle'ом из data-хендлера, не на каждый чанк.
   */
  const drawLive = () => {
    const elapsed = performance.now() - tFirstByte;
    const bar = contentLength > 0 ? renderBar(bytes / contentLength, 20) + '  ' : '';
    const size = contentLength > 0
      ? `${padL(fmtBytes(bytes), 9)} / ${fmtBytes(contentLength)}`
      : padL(fmtBytes(bytes), 16);
    process.stdout.write(
      CLEAR_LINE + `  ${dim('#' + idx)} ${bar}${size}  ${cyan(fmtSpeed(bytes, elapsed))}`
    );
  };

  // Отметка последней перерисовки — для throttle
  let lastDraw = 0;

  // Полное чтение тела с ожиданием 'end'
  await new Promise((resolve, reject) => {
    res.on('data', chunk => {
      if (!tFirstByte) tFirstByte = performance.now(); // самый первый чанк
      bytes += chunk.length;

      const now = performance.now();
      if (isTTY && now - lastDraw >= LIVE_REFRESH_MS) {
        lastDraw = now;
        drawLive();
      }
    });
    res.on('end', resolve);
    res.on('error', reject);
  });

  // Стираем live-строку, чтобы итоговая строка напечаталась чисто
  if (isTTY) process.stdout.write(CLEAR_LINE);

  const tEnd = performance.now();

  // На пустом теле первого байта не было — TTFB равен всему времени
  if (!tFirstByte) tFirstByte = tEnd;

  return {
    idx,
    bytes,
    contentLength,
    totalMs: tEnd - t0,
    ttfbMs: tFirstByte - t0,
    downloadMs: tEnd - tFirstByte,
  };
}
