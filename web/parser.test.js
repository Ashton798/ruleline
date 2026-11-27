import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseRule, englishRuleToChinese} from './parser.js';
test('extracts the threshold from complete supported rules', () => {
  assert.equal(parseRule('当指定账户转账达到 10 RCAMP 时，暂停测试金库').threshold, '10');
  assert.equal(parseRule('当监控账户单笔转出不少于 0.5 RCAMP 后暂停测试金库').threshold, '0.5');
  assert.equal(parseRule('指定账户转出 >= 0.000000000000000001 RCAMP 则暂停测试金库').threshold, '0.000000000000000001');
});

test('English template preserves the exact threshold and rejects changed semantics', () => {
  const valid = 'When the specified account transfers at least 10.5 RCAMP in one transaction, pause withdrawals from the test vault.';
  assert.equal(parseRule(valid).threshold, '10.5');
  assert.equal(englishRuleToChinese(valid), '当指定账户单笔转出达到 10.5 RCAMP 时，暂停测试金库。');
  for (const rule of [valid.replace('at least', 'more than'), valid.replace('transfers', 'receives'), valid.replace('one transaction', 'all transactions'), valid.replace('10.5 RCAMP', '0 RCAMP'), valid.replace('test vault.', 'test vault and send a notification.')]) assert.throws(() => parseRule(rule));
});

test('rejects missing or unsupported rule components', () => {
  for (const rule of [
    '转账达到 10 RCAMP 时暂停测试金库',
    '指定账户转账达到 10 时暂停测试金库',
    '指定账户转账达到 10 ETH 时暂停测试金库',
    '指定账户转账达到 10 RCAMP 时通知我',
    '指定账户转账很多时暂停测试金库',
    '指定账户收到 10 RCAMP 时暂停测试金库',
    '指定账户转入达到 10 RCAMP 时暂停测试金库',
    '指定账户转账小于 10 RCAMP 时暂停测试金库',
    '指定账户转账超过 10 RCAMP 时暂停测试金库',
    '指定账户累计转账达到 10 RCAMP 时暂停测试金库',
    '指定账户转账达到 10 RCAMP 时不要暂停测试金库',
    '指定账户转账达到 10 RCAMP 时暂停测试金库并通知我',
    '指定账户转账达到 10 RCAMP 或达到 20 RCAMP 时暂停测试金库',
    '指定账户转账达到 0 RCAMP 时暂停测试金库',
    '指定账户转账达到 0.0000000000000000001 RCAMP 时暂停测试金库',
    `指定账户转账达到 ${2n ** 256n} RCAMP 时暂停测试金库`,
  ]) assert.throws(() => parseRule(rule), undefined, rule);
});
