import {timingSafeEqual} from 'node:crypto';
import {recommendDecision} from '../agent/decision.mjs';
import {inspectEventState} from '../agent/event-state.mjs';

function authorized(header, secret) {
  if (typeof header !== 'string' || typeof secret !== 'string' || secret.length < 32) return false;
  const received = Buffer.from(header);
  const expected = Buffer.from('Bearer ' + secret);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export default async function eventAgent(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const reply = (status, result) => {
    res.statusCode = status;
    res.end(JSON.stringify(result));
  };
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return reply(405, {error: 'method_not_allowed'});
  }
  const env = process.env;
  if (req.method === 'POST' && !authorized(req.headers.authorization, env.AI_FLOW_RUN_TOKEN)) {
    return reply(401, {error: 'unauthorized'});
  }
  let state;
  try {
    state = await inspectEventState(env);
  } catch {
    return reply(503, {stage: 'chain_unavailable'});
  }
  const {context, decisionTransaction, ...status} = state;
  if (req.method === 'GET' || status.stage !== 'awaiting_decision') return reply(200, status);

  const recommendation = await recommendDecision(context, {
    complete: async prompt => {
      if (!env.AI_API_KEY || !env.AI_MODEL || !/^https:\/\/open\.bigmodel\.cn\/api\/paas\/v4\/?$/.test(env.AI_BASE_URL || '')) {
        throw Error('AI unavailable');
      }
      const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + env.AI_API_KEY},
        body: JSON.stringify({
          model: env.AI_MODEL,
          messages: [{role: 'system', content: prompt}, {role: 'user', content: 'Evaluate the observed testnet transfer.'}],
          ...(env.AI_MODEL.startsWith('glm-5.3') ? {reasoning_effort: 'low'} : {})
        }),
        signal: AbortSignal.timeout(22000),
        redirect: 'error'
      });
      if (!response.ok) throw Error('Model unavailable');
      return (await response.json())?.choices?.[0]?.message?.content;
    }
  });
  if (recommendation.action === 'manual') return reply(200, {...status, recommendation});
  return reply(200, {...status, stage: 'awaiting_wallet_confirmation', recommendation,
    transaction: decisionTransaction(recommendation.action)});
}
