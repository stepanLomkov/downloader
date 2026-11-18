/**
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
 * Кэш агентов по протоколу: 'http:' → http.Agent, 'https:' → https.Agent.
 *
 * Зачем кэш, а не один агент под исходный URL:
 * редирект может сменить протокол (http → https и наоборот), а агент,
 * созданный под один протокол, несовместим с модулем другого —
 * Node бросает ERR_INVALID_PROTOCOL. Держим по агенту на каждый
 * реально встреченный протокол, создаём лениво.
 */
const agents = new Map();

/**
 * Возвращает keep-alive Agent для указанного протокола.
 * Создаёт при первом обращении, потом переиспользует.
 *
 * keepAlive: true — переиспользуем сокет между итерациями. Именно это
 * даёт низкий TTFB у запросов #2..#N: DNS, TCP и TLS handshake платит
 * только первый запрос. Без keepAlive каждая итерация платила бы
 * полную цену соединения, и «первый медленнее» бы не наблюдалось.
 *
 * @param {'http:'|'https:'} protocol
 * @returns {http.Agent|https.Agent}
 */
function getAgent(protocol) {
  let agent = agents.get(protocol);
  if (!agent) {
    const opts = { keepAlive: true };
    agent = protocol === 'https:' ? new https.Agent(opts) : new http.Agent(opts);
    agents.set(protocol, agent);
  }
  return agent;
}

/**
 * Уничтожает все созданные агенты и очищает кэш.
 * Вызывать один раз в конце программы — иначе keep-alive сокеты
 * не дадут процессу завершиться (event loop держится за открытые handle).
 */
export function destroyAgents() {
  for (const a of agents.values()) a.destroy();
  agents.clear();
}

/**
 * Выполняет GET-запрос и возвращает IncomingMessage с потоком тела.
 *
 * Отличия от голого mod.get:
 *   - ручной разбор редиректов (3xx + Location), максимум MAX_REDIRECTS;
 *   - на «пропущенных» ответах вызываем res.resume(),
 *     иначе сокет не освободится и keep-alive-агент зависнет;
 *   - явный accept-encoding: identity для честных wire-байт;
 *   - агент выбирается под ПРОТОКОЛ ТЕКУЩЕГО url, а не исходного —
 *     это делает безопасным редирект с изменением протокола;
 *   - явная проверка протокола на каждом хопе: если редирект увёл
 *     на ftp://, получим понятную ошибку, а не «Protocol ftp: not supported».
 *
 * @param {URL} url              — целевой адрес
 * @param {number} redirectsLeft — сколько редиректов ещё разрешено
 * @returns {Promise<http.IncomingMessage>}
 */
export function httpGet(url, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    // Явно поддерживаем только http/https — и на первом хопе, и после редиректа
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return reject(new Error(`неподдерживаемый протокол: ${url.protocol}`));
    }

    const mod = url.protocol === 'https:' ? https : http;
    const agent = getAgent(url.protocol); // ← под текущий протокол, не под исходный

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
        // Location может быть относительным — резолвим относительно текущего URL.
        // Если Location — protocol-relative (//host/path) или абсолютный
        // с другим протоколом, next.protocol будет соответствующим,
        // и следующий httpGet возьмёт правильный агент.
        const next = new URL(res.headers.location, url);
        return httpGet(next, redirectsLeft - 1).then(resolve, reject);
      }
      resolve(res);
    });

    req.on('error', reject);
  });
}