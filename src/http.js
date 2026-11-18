/*
 * Тонкая обёртка над нативным http/https.
 *
 * Почему не fetch:
 *   - fetch (undici) по умолчанию шлёт accept-encoding: gzip, deflate, br
 *     и распаковывает тело — тогда «скачанные байты» и «время скачивания»
 *     относятся не к wire-трафику, а к тому, что уже распаковано в JS.
 *   - Нам нужны честные wire-байты, поэтому явно просим identity.
 */

import http from 'node:http';
import https from 'node:https';
import { MAX_REDIRECTS, USER_AGENT } from './config.js';

/**
 * Создаёт keep-alive Agent, соответствующий протоколу URL.
 *
 * Зачем keep-alive:
 *   - первый запрос платит DNS + TCP + TLS handshake;
 *   - все последующие переиспользуют уже открытый сокет,
 *     поэтому TTFB «чистых» запросов становится заметно ниже.
 *   - maxSockets: 1 — гарантирует, что запросы идут последовательно
 *     по одному сокету (это же и по смыслу задачи).
 *
 * @param {URL} url — целевой адрес
 * @returns {http.Agent|https.Agent}
 */
export function createAgent(url) {
  const opts = { keepAlive: true, maxSockets: 1 };
  return url.protocol === 'https:' ? new https.Agent(opts) : new http.Agent(opts);
}

/**
 * Выполняет GET-запрос и возвращает IncomingMessage с потоком тела.
 *
 * Отличия от голого mod.get:
 *   - ручной разбор редиректов (3xx + Location), максимум MAX_REDIRECTS;
 *   - на «пропущенных» ответах вызываем res.resume(),
 *     иначе сокет не освободится и keep-alive-агент зависнет;
 *   - явный accept-encoding: identity для честных wire-байт.
 *
 * @param {URL} url            — целевой адрес
 * @param {http.Agent} agent   — keep-alive агент из createAgent()
 * @param {number} redirectsLeft — сколько редиректов ещё разрешено
 * @returns {Promise<http.IncomingMessage>}
 */
export function httpGet(url, agent, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;

    const req = mod.get(url, {
      agent,
      headers: {
        'accept-encoding': 'identity', // не даём серверу сжать тело
        'user-agent': USER_AGENT,
      },
    }, res => {
      // Редирект: если есть Location и лимит не исчерпан — идём дальше
      const isRedirect = res.statusCode >= 300 && res.statusCode < 400;
      if (isRedirect && res.headers.location) {
        res.resume(); // сбрасываем тело, чтобы освободить сокет
        if (redirectsLeft <= 0) {
          return reject(new Error('слишком много редиректов'));
        }
        // Location может быть относительным — резолвим относительно текущего URL
        const next = new URL(res.headers.location, url);
        return httpGet(next, agent, redirectsLeft - 1).then(resolve, reject);
      }
      resolve(res);
    });

    req.on('error', reject);
  });
}