import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {createAgentServer} from './agent.mjs';

const token = '0x96E9530cc78599b115a0e5e5873a2E88F661a977';
const address = () => '0x' + randomBytes(20).toString('hex');
const candidate = (changes = {}) => ({supported: true, threshold: '10', senderAddress: null, tokenAddress: null, ...changes});
const validText = '当指定账户单笔转出达到10 RCAMP时，暂停测试金库';

async function setup(t, {model, env: overrides = {}, fetchImpl} = {}) {
  const authorization = randomUUID();
  const env = {AI_BASE_URL: 'https://example.invalid/v1', AI_API_KEY: authorization, AI_MODEL: 'test-model', ...overrides};
  const calls = [];
  const server = createAgentServer({env, fetchImpl: fetchImpl || (async (url, options) => {
    calls.push({url, options});
    return {ok: true, json: async () => ({choices: [{message: {content: typeof model === 'string' ? model : JSON.stringify(model)}}]})};
  })});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, body, headers = {}) {
    const response = await fetch(base + path, body === undefined ? {headers} : {method: 'POST', headers: {'content-type': 'application/json', ...headers}, body: JSON.stringify(body)});
    return {status: response.status, body: await response.json()};
  }
  return {request, calls, authorization};
}

test('status exposes only safe provider and origin, and URL configuration is strict', async t => {
  const {request, authorization} = await setup(t, {env: {AI_PROVIDER: 'Example AI', AI_BASE_URL: 'https://example.invalid/v1/private-path'}});
  const status = await request('/api/status');
  assert.deepEqual(status.body, {configured: true, provider: 'Example AI', endpoint: 'https://example.invalid'});
  assert.ok(!JSON.stringify(status.body).includes(authorization));
  for (const url of [`https://${randomUUID()}:${randomUUID()}@example.invalid/v1`, 'https://example.invalid/v1?x=1', 'https://example.invalid/v1#fragment', 'http://example.invalid/v1', 'file:///tmp/model']) {
    await t.test(url.split('/')[0] + ' invalid ' + url.length, async t => {
      const {request} = await setup(t, {env: {AI_BASE_URL: url}});
      assert.deepEqual((await request('/api/status')).body, {configured: false, provider: '', endpoint: ''});
      assert.equal((await request('/api/interpret', {text: validText, sender: address(), token})).status, 503);
    });
  }
  await t.test('localhost HTTP and hostname fallback', async t => {
    const {request} = await setup(t, {env: {AI_BASE_URL: 'http://127.0.0.1:1234/v1'}});
    assert.deepEqual((await request('/api/status')).body, {configured: true, provider: '127.0.0.1', endpoint: 'http://127.0.0.1:1234'});
  });
});

test('interpret returns a complete validated rule from fenced model JSON', async t => {
  const sender = address();
  const {request, calls, authorization} = await setup(t, {model: '```json\n' + JSON.stringify(candidate()) + '\n```'});
  const result = await request('/api/interpret', {text: validText, sender, token}, {origin: 'http://127.0.0.1:4177'});
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {source: 'AI', rule: {sender, token, threshold: '10', action: 'pause_vault', originChainId: 11155111, reactiveChainId: 5318007}});
  assert.equal(calls[0].url, 'https://example.invalid/v1/chat/completions');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + authorization);
  assert.equal(calls[0].options.redirect, 'error');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test('accepts the user example as one transfer', async t => {
  const sender = address();
  const {request} = await setup(t, {model: candidate()});
  const result = await request('/api/interpret', {text: '当指定账户转账达到 10 RCAMP 时，暂停测试金库。', sender, token});
  assert.equal(result.status, 200);
  assert.equal(result.body.rule.threshold, '10');
});


test('rejects incomplete or unverifiable rules even when model claims support', async t => {
  const sender = address();
  for (const [text, model] of [
    ['指定账户转出10 RCAMP就暂停测试金库', candidate()],
    ['当指定账户单笔转出10 RCAMP时暂停测试金库', candidate()],
    [validText, {supported: false}],
    [validText, {supported: true, threshold: '10'}],
    [validText, candidate({threshold: '11'})],
    [validText, candidate({threshold: '0'})],
    [validText, candidate({threshold: '0.0000000000000000001'})],
  ]) {
    await t.test(text + ' ' + JSON.stringify(model), async t => {
      const {request} = await setup(t, {model});
      assert.equal((await request('/api/interpret', {text, sender, token})).status, 422);
    });
  }
});

test('rejects wrong token, explicit account or token conflicts, and invented addresses', async t => {
  const sender = address();
  const other = address();
  const scenarios = [
    {text: validText, token: other, model: candidate()},
    {text: `当账户${other}单笔转出达到10 RCAMP时暂停测试金库`, token, model: candidate({senderAddress: other})},
    {text: `账户${sender}单笔转出代币${other}达到10 RCAMP时暂停测试金库`, token, model: candidate({senderAddress: sender, tokenAddress: other})},
    {text: validText, token, model: candidate({senderAddress: sender})},
    {text: `账户${other}单笔转出达到10 RCAMP时暂停测试金库`, token, model: candidate()},
  ];
  for (const scenario of scenarios) {
    await t.test('rejecting mismatched address', async t => {
      const {request} = await setup(t, {model: scenario.model});
      assert.equal((await request('/api/interpret', {text: scenario.text, sender, token: scenario.token})).status, 422);
    });
  }
  await t.test('accepts explicitly matching account and token', async t => {
    const {request} = await setup(t, {model: candidate({senderAddress: sender, tokenAddress: token})});
    const text = `账户${sender}单笔转出RCAMP代币${token}达到10时暂停测试金库`;
    assert.equal((await request('/api/interpret', {text, sender, token})).status, 200);
  });
});

test('explanation uses only verified sentences and always includes required uncertainty', async t => {
  const {request, calls} = await setup(t, {model: {factIds: ['vaultPaused', 'threshold']}});
  const result = await request('/api/explain', {text: JSON.stringify({threshold: '10', latestObservedAmount: '15', callbackRequested: true, vaultPaused: true})});
  assert.equal(result.status, 200);
  assert.equal(result.body.source, 'AI');
  for (const expected of ['规则阈值为 10 RCAMP', '最近金额为 15 RCAMP', '达到或超过规则阈值', '已请求回调', '金库已暂停', '不足以确认回调成功']) assert.match(result.body.explanation, new RegExp(expected));
  const messages = JSON.parse(calls[0].options.body).messages;
  assert.equal(JSON.parse(messages[1].content).callbackRequested, '已请求回调，但这不代表回调已执行。');
  await t.test('confirmed matching source may be selected as a fact', async t => {
    const {request} = await setup(t, {model: {factIds: ['callbackMatchesSource', 'vaultPaused']}});
    const result = await request('/api/explain', {text: JSON.stringify({threshold: '1', callbackMatchesSource: true, vaultPaused: true})});
    assert.equal(result.status, 200);
    assert.match(result.body.explanation, /记录显示回调与源交易匹配/);
    assert.match(result.body.explanation, /当前读取到金库已暂停/);
    assert.match(result.body.explanation, /规则阈值为 1 RCAMP/);
  });
  await t.test('below threshold remains visible even when model omits it', async t => {
    const {request} = await setup(t, {model: {factIds: ['threshold']}});
    const result = await request('/api/explain', {text: JSON.stringify({threshold: '10', latestObservedAmount: '9', callbackRequested: false})});
    assert.equal(result.status, 200);
    assert.match(result.body.explanation, /未达到规则阈值/);
    assert.match(result.body.explanation, /尚未观察到回调请求/);
    assert.match(result.body.explanation, /不足以确认回调成功/);
  });
});

test('rejects invented evidence, free-form explanations and invalid facts', async t => {
  for (const model of [{factIds: ['callbackSucceeded']}, {factIds: ['threshold', 'threshold']}, {factIds: ['threshold'], explanation: '回调成功'}, '回调成功']) {
    await t.test('invalid model response', async t => {
      const {request} = await setup(t, {model});
      assert.equal((await request('/api/explain', {text: JSON.stringify({threshold: '1', vaultPaused: true})})).status, 502);
    });
  }
  const {request} = await setup(t, {model: {factIds: ['threshold']}});
  for (const facts of [{}, {threshold: '0'}, {threshold: '1', callbackMatchesSource: 'true'}, {threshold: '1', invented: true}]) {
    assert.equal((await request('/api/explain', {text: JSON.stringify(facts)})).status, 422);
  }
});

test('missing configuration and upstream failures return safe errors', async t => {
  await t.test('missing configuration', async t => {
    const {request} = await setup(t, {env: {AI_API_KEY: ''}});
    assert.equal((await request('/api/status')).body.configured, false);
    assert.equal((await request('/api/explain', {text: '{"threshold":"1"}'})).status, 503);
  });
  await t.test('upstream HTTP failure', async t => {
    const secret = randomUUID();
    const {request} = await setup(t, {env: {AI_API_KEY: secret}, fetchImpl: async () => ({ok: false, status: 401, json: async () => ({error: secret})})});
    const result = await request('/api/interpret', {text: validText, sender: address(), token});
    assert.equal(result.status, 502);
    assert.match(result.body.error, /HTTP 401/);
    assert.ok(!JSON.stringify(result.body).includes(secret));
  });
  await t.test('upstream exception', async t => {
    const secret = randomUUID();
    const {request} = await setup(t, {env: {AI_API_KEY: secret}, fetchImpl: async () => { throw new Error(secret); }});
    const result = await request('/api/explain', {text: '{"threshold":"1"}'});
    assert.equal(result.status, 502);
    assert.ok(!JSON.stringify(result.body).includes(secret));
  });
  await t.test('connection timeout is distinguishable without exposing error details', async t => {
    const {request} = await setup(t, {fetchImpl: async () => { throw Object.assign(new Error('private error details'), {cause: {code: 'UND_ERR_CONNECT_TIMEOUT'}}); }});
    const result = await request('/api/interpret', {text: validText, sender: address(), token});
    assert.equal(result.status, 502);
    assert.match(result.body.error, /超时/);
    assert.doesNotMatch(result.body.error, /private error details/);
  });
});

test('protects origin and limits request size', async t => {
  const {request} = await setup(t, {model: candidate()});
  assert.equal((await request('/api/status', undefined, {origin: 'http://example.invalid'})).status, 403);
  assert.equal((await request('/api/interpret', {text: validText, sender: address(), token}, {origin: 'http://example.invalid'})).status, 403);
  assert.equal((await request('/api/interpret', {text: '长'.repeat(3000), sender: address(), token})).status, 413);
});
