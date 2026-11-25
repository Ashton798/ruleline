import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {StringDecoder} from 'node:string_decoder';
import {isAddress, parseUnits} from 'ethers';

const TOKEN = '0x96E9530cc78599b115a0e5e5873a2E88F661a977';
const MAX_BODY_BYTES = 8000;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const decimal = value => typeof value === 'string' && value.length <= 100 && /^\d+(?:\.\d{1,18})?$/.test(value);
const sameAddress = (a, b) => a.toLowerCase() === b.toLowerCase();
const invalidRule = 'AI 无法确认该规则，请明确指定账户、单笔转出、RCAMP 的大于等于阈值和暂停测试金库。';

function configuration(env) {
  let url;
  try {
    const raw = env.AI_BASE_URL;
    if (typeof raw !== 'string' || raw !== raw.trim() || /[?#\s\\]/.test(raw) || !/^https?:\/\//i.test(raw)) throw new Error();
    const authority = raw.match(/^https?:\/\/([^/]+)/i)?.[1];
    if (!authority || authority.includes('@')) throw new Error();
    url = new URL(raw);
    if (url.username || url.password || url.search || url.hash || !url.hostname) throw new Error();
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error();
  } catch {
    return {configured: false, provider: '', endpoint: ''};
  }
  const secret = typeof env.AI_API_KEY === 'string' ? env.AI_API_KEY : '';
  const safe = value => !secret || !value.toLowerCase().includes(secret.toLowerCase());
  const hostname = safe(url.hostname) ? url.hostname : '';
  const name = typeof env.AI_PROVIDER === 'string' && /^[\p{L}\p{N} ._-]{1,40}$/u.test(env.AI_PROVIDER)
    && safe(env.AI_PROVIDER) ? env.AI_PROVIDER : hostname;
  return {
    configured: Boolean(env.AI_API_KEY && env.AI_MODEL),
    provider: name,
    endpoint: safe(url.origin) ? url.origin : '',
    completionUrl: url.href.replace(/\/$/, '') + '/chat/completions',
  };
}

function parseModelJson(output) {
  if (typeof output !== 'string' || output.length > 4000) throw new Error('invalid model response');
  const trimmed = output.trim();
  const fenced = trimmed.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

function validAmount(value, positive = false) {
  if (!decimal(value)) return false;
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole) * 10n ** 18n + BigInt((fraction + '0'.repeat(18)).slice(0, 18));
  return units < 2n ** 256n && (!positive || units > 0n);
}

function interpretCandidate(candidate, text, sender, token) {
  if (!isObject(candidate) || candidate.supported !== true || Object.keys(candidate).sort().join(',') !== 'senderAddress,supported,threshold,tokenAddress') return null;
  if (!validAmount(candidate.threshold, true)) return null;
  // Reject missing observable rule components even if the model claims support.
  const singleTransfer = /(单笔|一次|每笔|每一笔|一笔)/.test(text) || /转账\s*(?:金额|数量)?\s*(?:达到|不少于|不低于|大于等于|大于或等于|等于或大于|至少|>=|≥)/.test(text);
  if (!singleTransfer || /(累计|累积|总计|合计|不要暂停|不暂停|无需暂停)/.test(text) || !/(转出|转账|转走|转移)/.test(text) || !/RCAMP/i.test(text) || !/(达到|不少于|不低于|大于等于|大于或等于|等于或大于|至少|>=|≥)/.test(text) || !/(暂停|停止)/.test(text) || !/测试金库/.test(text)) return null;
  // The threshold must be present verbatim as a standalone decimal outside addresses.
  const amounts = text.replace(/0x[0-9a-zA-Z]+/gi, '').match(/(?<![\d.])\d+(?:\.\d+)?(?![\d.])/g) || [];
  if (!amounts.includes(candidate.threshold)) return null;
  const addresses = text.match(/0x[0-9a-zA-Z]+/gi) || [];
  if (addresses.some(address => !isAddress(address))) return null;
  for (const [key, expected] of [['senderAddress', sender], ['tokenAddress', token]]) {
    const found = candidate[key];
    if (found !== null && (typeof found !== 'string' || !isAddress(found) || !sameAddress(found, expected) || !addresses.some(address => sameAddress(address, found)))) return null;
  }
  if (addresses.some(address => ![candidate.senderAddress, candidate.tokenAddress].some(found => found !== null && sameAddress(address, found)))) return null;
  return {sender, token, threshold: candidate.threshold, action: 'pause_vault', originChainId: 11155111, reactiveChainId: 5318007};
}

function explainFacts(text) {
  let facts;
  try { facts = JSON.parse(text); } catch { throw new Error('解释输入必须是包含链上状态的 JSON 对象。'); }
  if (!isObject(facts)) throw new Error('解释输入必须是包含链上状态的 JSON 对象。');
  const allowed = ['threshold', 'latestObservedAmount', 'callbackRequested', 'vaultPaused', 'callbackMatchesSource'];
  if (Object.keys(facts).some(key => !allowed.includes(key))) throw new Error('解释输入包含不支持的状态字段。');
  if (!validAmount(facts.threshold, true) || ('latestObservedAmount' in facts && !validAmount(facts.latestObservedAmount))) throw new Error('阈值和观察金额必须是有效的数字字符串。');
  for (const key of ['callbackRequested', 'vaultPaused', 'callbackMatchesSource']) {
    if (key in facts && typeof facts[key] !== 'boolean') throw new Error('回调和金库状态必须是布尔值。');
  }
  const sentences = {threshold: `规则阈值为 ${facts.threshold} RCAMP。`};
  if ('latestObservedAmount' in facts) {
    sentences.latestObservedAmount = `监听合约记录的最近金额为 ${facts.latestObservedAmount} RCAMP。`;
    sentences.comparison = parseUnits(facts.latestObservedAmount, 18) >= parseUnits(facts.threshold, 18)
      ? '这笔金额达到或超过规则阈值。' : '这笔金额未达到规则阈值。';
  }
  if ('callbackRequested' in facts) sentences.callbackRequested = facts.callbackRequested ? '已请求回调，但这不代表回调已执行。' : '尚未观察到回调请求。';
  if ('vaultPaused' in facts) sentences.vaultPaused = facts.vaultPaused ? '当前读取到金库已暂停。' : '当前读取到金库未暂停。';
  if ('callbackMatchesSource' in facts) sentences.callbackMatchesSource = facts.callbackMatchesSource ? '记录显示回调与源交易匹配。' : '尚未证实回调与源交易匹配。';
  if (facts.callbackMatchesSource !== true) sentences.uncertain = '现有信息不足以确认回调成功，也不能确认金库因该规则暂停。';
  else if (facts.vaultPaused !== true) sentences.uncertain = '现有信息不能确认金库已因该规则暂停。';
  return sentences;
}

const interpretSystem = '你是测试网规则翻译助手。理解用户中文，唯一支持指定账户单笔转出 RCAMP 的金额大于等于正数阈值后暂停本项目测试金库。单笔、转出方向、RCAMP、包含等于的阈值比较及暂停测试金库都必须明确；“当指定账户转账达到 10 RCAMP 时，暂停测试金库”表示单笔转账，可以支持。缺失、歧义、累计、额外条件或其他动作均不支持，不要猜测。只输出 JSON：不支持时为 {"supported":false}；支持时为 {"supported":true,"threshold":"原文中的十进制数字","senderAddress":null,"tokenAddress":null}。如果原文明确写有账户或代币地址，将对应字段填为原文地址；没有则为 null。不得将地址作为阈值。';
const explainSystem = '你是测试网状态讲解助手。输入为事实 ID 与对应的已验证语句。仅选择并排序需要展示的事实 ID，输出 JSON：{"factIds":["事实ID"]}。不得输出语句、添加不存在的 ID 或重复 ID。';

export function createAgentServer({env = process.env, fetchImpl = globalThis.fetch} = {}) {
  return http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const reply = (code, data) => { res.statusCode = code; res.end(JSON.stringify(data)); };
    if (req.headers.origin && req.headers.origin !== 'http://127.0.0.1:4177') return reply(403, {error: '来源不允许。'});
    const config = configuration(env);
    if (req.method === 'GET' && req.url === '/api/status') return reply(200, {configured: config.configured, provider: config.provider, endpoint: config.endpoint});
    if (req.method !== 'POST' || !['/api/interpret', '/api/explain'].includes(req.url)) return reply(404, {error: '接口不存在。'});
    if (!/^application\/json(?:\s*;|\s*$)/i.test(req.headers['content-type'] || '')) return reply(415, {error: '需要 JSON 输入。'});
    if (!config.configured) return reply(503, {error: 'AI 服务尚未配置或服务地址无效，请检查本机配置。'});

    let body = '';
    const decoder = new StringDecoder('utf8');
    let size = 0;
    try {
      for await (const part of req) {
        size += part.length;
        if (size > MAX_BODY_BYTES) return reply(413, {error: '输入过长。'});
        body += decoder.write(part);
      }
      body += decoder.end();
    } catch { return reply(400, {error: '无法读取请求。'}); }
    let input;
    try { input = JSON.parse(body); } catch { return reply(400, {error: '请输入有效的 JSON。'}); }
    if (!isObject(input) || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 1000) return reply(400, {error: '输入无效，请提供不超过 1000 字的 text。'});
    const isExplain = req.url === '/api/explain';
    let sentences;
    if (isExplain) {
      try { sentences = explainFacts(input.text); } catch (error) { return reply(422, {error: error.message}); }
    } else if (typeof input.sender !== 'string' || !isAddress(input.sender) || typeof input.token !== 'string' || !isAddress(input.token) || !sameAddress(input.token, TOKEN)) {
      return reply(422, {error: '请输入有效的监听账户和已部署的 RCAMP 测试代币地址。'});
    }

    let response;
    try {
      response = await fetchImpl(config.completionUrl, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.AI_API_KEY},
        body: JSON.stringify({model: env.AI_MODEL, messages: [{role: 'system', content: isExplain ? explainSystem : interpretSystem}, {role: 'user', content: isExplain ? JSON.stringify(sentences) : input.text}]}),
        signal: AbortSignal.timeout(120000),
        redirect: 'error',
      });
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError' || error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT';
      return reply(502, {error: timedOut ? '连接 AI 服务超时，请检查网络和系统代理设置。' : '连接 AI 服务失败，请检查网络和系统代理设置。'});
    }
    if (!response.ok) {
      const status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? `HTTP ${response.status}` : '未知状态';
      return reply(502, {error: `AI 服务返回 ${status}，请检查模型名称、账号权限、额度和 API 地域。`});
    }
    try {
      const data = await response.json();
      const parsed = parseModelJson(data?.choices?.[0]?.message?.content);
      if (!isExplain) {
        const rule = interpretCandidate(parsed, input.text, input.sender, input.token);
        if (!rule) return reply(422, {error: invalidRule});
        return reply(200, {source: 'AI', rule});
      }
      if (!isObject(parsed) || Object.keys(parsed).length !== 1 || !Array.isArray(parsed.factIds) || !parsed.factIds.length || parsed.factIds.some(id => typeof id !== 'string' || !Object.hasOwn(sentences, id)) || new Set(parsed.factIds).size !== parsed.factIds.length) throw new Error('invalid fact IDs');
      const ids = [...parsed.factIds];
      for (const id of Object.keys(sentences)) if (!ids.includes(id)) ids.push(id);
      return reply(200, {explanation: ids.map(id => sentences[id]).join(''), source: 'AI'});
    } catch {
      return reply(502, {error: 'AI 服务已响应，但模型返回格式无法识别，请检查模型兼容性后重试。'});
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.AI_PORT || 4399);
  createAgentServer().listen(port, '127.0.0.1', () => console.log('Ruleline agent listening on http://127.0.0.1:' + port));
}
