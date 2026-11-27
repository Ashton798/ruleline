// Accept only a complete, unambiguous sentence describing the supported rule.
export function englishRuleToChinese(text) {
  if (typeof text !== 'string') return null;
  const match = text.trim().match(/^when (?:the )?specified account transfers at least (\d+(?:\.\d+)?) RCAMP in (?:a single|one) transaction,\s*pause (?:withdrawals from )?the test vault\.?$/i);
  return match ? `当指定账户单笔转出达到 ${match[1]} RCAMP 时，暂停测试金库。` : null;
}
export function parseRule(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('请输入完整规则。');
  const rule = englishRuleToChinese(text) || text.trim();
  if (!/(指定|监控)账户/.test(rule)) throw new Error('请写明由指定账户转出。');
  if (!/(转账|转出)/.test(rule)) throw new Error('请写明指定账户转出 RCAMP。');
  if (!/RCAMP/i.test(rule)) throw new Error('请写明转出的代币为 RCAMP。');
  if (!/(暂停|停止)/.test(rule) || !/测试金库/.test(rule)) throw new Error('请写明暂停测试金库。');
  const match = rule.match(/^(?:当|如果)?\s*(?:指定|监控)账户\s*(?:的)?\s*(?:单笔|一次)?\s*(?:转账|转出)\s*(?:金额|数量)?\s*(?:达到|不少于|大于等于|不低于|>=|≥|至少)\s*(\d+(?:\.\d+)?)\s*RCAMP\s*(?:时|后)?\s*[,，、]?\s*(?:就|则)?\s*(?:暂停|停止)\s*测试金库\s*[。.!！]?$/i);
  if (!match) throw new Error('规则不完整或包含不支持的条件、方向或动作；请使用“当指定账户单笔转出达到 10 RCAMP 时，暂停测试金库”。');
  const [integer, fraction = ''] = match[1].split('.');
  if (fraction.length > 18 || !/[1-9]/.test(integer + fraction)) throw new Error('阈值必须大于零，且最多支持 18 位小数。');
  const units = BigInt(integer) * 10n ** 18n + BigInt((fraction + '0'.repeat(18)).slice(0, 18));
  if (units >= 2n ** 256n) throw new Error('阈值超出支持范围。');
  return {threshold: match[1]};
}
