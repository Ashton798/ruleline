// The model proposes an action; it never receives a wallet key or signs a transaction.
const uint = value => typeof value === 'string' && /^\d{1,78}$/.test(value) && BigInt(value) < 2n ** 256n;

export async function recommendDecision(context, {endpoint, complete, fetchImpl = globalThis.fetch} = {}) {
  const manual = reason => ({action: 'manual', reason});
  if (!context || !uint(context.amountWei) || !uint(context.maxAmountWei) || !uint(context.thresholdWei)
      || BigInt(context.amountWei) === 0n || BigInt(context.thresholdWei) === 0n) return manual('invalid_context');
  if (BigInt(context.amountWei) < BigInt(context.thresholdWei)) return manual('below_threshold');
  if (BigInt(context.amountWei) > BigInt(context.maxAmountWei)) return manual('limit_exceeded');
  if (!complete) {
    let service;
    try {
      service = new URL(endpoint);
      if (service.protocol !== 'https:' && !(service.protocol === 'http:' && ['localhost','127.0.0.1'].includes(service.hostname))) return manual('invalid_endpoint');
      if (service.username || service.password || service.search || service.hash) return manual('invalid_endpoint');
    } catch { return manual('invalid_endpoint'); }
    complete = async prompt => {
      const response = await fetchImpl(new URL('/api/chat', service), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({messages: [{role: 'user', content: prompt}]}),
        signal: AbortSignal.timeout(30000),
        redirect: 'error'
      });
      if (!response.ok) throw Error('Model unavailable');
      const result = await response.json();
      return result?.source === 'AI' ? result.answer : undefined;
    };
  }
  const prompt = 'You are evaluating a TESTNET rule. Return ONLY strict JSON, with exactly two keys: {"action":"pause"|"skip"|"manual","reason":"brief explanation"}. '
    + 'The only executable action is to request a pause of this project test vault. It cannot prevent or undo a transfer. '
    + 'Apply this test policy: a transfer that reaches the threshold and is within the allowed maximum should pause a running vault. '
    + 'Choose skip if the vault is already paused. Choose manual if required facts are missing or contradictory. '
    + (typeof context.vaultPaused === 'boolean' ? `Vault paused: ${context.vaultPaused}. ` : '')
    + `Observed single-transfer amount in wei: ${context.amountWei}. Trigger threshold in wei: ${context.thresholdWei}. Allowed maximum amount in wei: ${context.maxAmountWei}.`;
  try {
    const answer = await complete(prompt);
    if (typeof answer !== 'string' || answer.length > 2000) return manual('invalid_model_response');
    let candidate;
    try { candidate=JSON.parse(answer.trim().replace(/^```(?:json)?\s*|\s*```$/gi,'')); } catch { return manual('invalid_model_response'); }
    if (!candidate || Array.isArray(candidate) || Object.keys(candidate).sort().join(',') !== 'action,reason'
        || !['pause','skip','manual'].includes(candidate.action) || typeof candidate.reason !== 'string'
        || !candidate.reason.trim() || candidate.reason.length > 500) return manual('invalid_model_response');
    if (context.vaultPaused === true && candidate.action === 'pause') return manual('vault_already_paused');
    return {action:candidate.action,reason:candidate.reason.trim()};
  } catch { return manual('model_unavailable'); }
}
