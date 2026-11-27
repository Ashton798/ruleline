// The model proposes an action; it never receives a wallet key or signs a transaction.
const uint = value => typeof value === 'string' && /^\d{1,78}$/.test(value) && BigInt(value) < 2n ** 256n;

export async function recommendDecision(context, {endpoint, fetchImpl = globalThis.fetch} = {}) {
  const manual = reason => ({action: 'manual', reason});
  if (!context || !uint(context.amountWei) || !uint(context.maxAmountWei) || !uint(context.thresholdWei)
      || BigInt(context.amountWei) === 0n || BigInt(context.thresholdWei) === 0n) return manual('invalid_context');
  if (BigInt(context.amountWei) < BigInt(context.thresholdWei)) return manual('below_threshold');
  if (BigInt(context.amountWei) > BigInt(context.maxAmountWei)) return manual('limit_exceeded');
  let service;
  try {
    service = new URL(endpoint);
    if (service.protocol !== 'https:' && !(service.protocol === 'http:' && ['localhost','127.0.0.1'].includes(service.hostname))) return manual('invalid_endpoint');
    if (service.username || service.password || service.search || service.hash) return manual('invalid_endpoint');
  } catch { return manual('invalid_endpoint'); }
  const prompt = 'You are evaluating a TESTNET rule. Return ONLY strict JSON, with exactly two keys: {"action":"pause"|"skip"|"manual","reason":"brief explanation"}. '
    + 'The only executable action is to request a pause of this project test vault. It cannot prevent or undo a transfer. '
    + 'If you cannot decide from the supplied information, choose manual. '
    + `Observed single-transfer amount in wei: ${context.amountWei}. Trigger threshold in wei: ${context.thresholdWei}. Allowed maximum amount in wei: ${context.maxAmountWei}.`;
  try {
    const response = await fetchImpl(new URL('/api/chat',service), {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({messages:[{role:'user',content:prompt}]}), signal:AbortSignal.timeout(30000)
    });
    if (!response.ok) return manual('model_unavailable');
    const result = await response.json();
    if (result?.source !== 'AI' || typeof result.answer !== 'string' || result.answer.length > 2000) return manual('invalid_model_response');
    let candidate;
    try { candidate=JSON.parse(result.answer.trim().replace(/^```(?:json)?\s*|\s*```$/gi,'')); } catch { return manual('invalid_model_response'); }
    if (!candidate || Array.isArray(candidate) || Object.keys(candidate).sort().join(',') !== 'action,reason'
        || !['pause','skip','manual'].includes(candidate.action) || typeof candidate.reason !== 'string'
        || !candidate.reason.trim() || candidate.reason.length > 500) return manual('invalid_model_response');
    return {action:candidate.action,reason:candidate.reason.trim()};
  } catch { return manual('model_unavailable'); }
}
