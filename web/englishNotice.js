const notices = {
 '先把一句规则翻译成可以核对的条件。':'Translate a rule into reviewable conditions first.',
 '请输入完整规则。':'Enter a complete rule.',
 '请输入要监听的账户地址。':'Enter the account address to monitor.',
 '账户地址无效，请输入完整的以 0x 开头的钱包地址。':'Enter a valid account address beginning with 0x.',
 'RCAMP 测试代币地址无效，请检查配置。':'The RCAMP test token address is invalid. Check the configuration.',
 '请输入完整的中文规则。':'Enter a complete rule in Chinese.',
 '请在规则中明确填写一个 RCAMP 数量，例如“达到 10 RCAMP”。':'Include one RCAMP amount in the rule, for example 10 RCAMP.',
 '请输入大于零的有效数量，例如 10 或 0.5。':'Enter a valid amount greater than zero, such as 10 or 0.5.',
 '数量必须大于零，且不能超出支持范围。':'The amount must be positive and within the supported range.',
 '数量无效，最多支持 18 位小数。':'The amount is invalid; at most 18 decimal places are supported.',
 '还缺少触发后的动作。请写明“暂停测试金库”，也可以点击下方的“填写完整示例”。':'Specify that the test vault should be paused, or fill the complete example below.',
 'AI 服务当前不可用，请选择本地规则匹配。':'AI is unavailable. Choose local rule matching.',
 '请写明由指定账户转出。':'Specify an outgoing transfer from the designated account.',
 '请写明指定账户转出 RCAMP。':'Specify an outgoing RCAMP transfer.',
 '请写明转出的代币为 RCAMP。':'Specify RCAMP as the token.',
 '请写明暂停测试金库。':'Specify that the test vault should be paused.',
 '规则不完整或包含不支持的条件、方向或动作；请使用“当指定账户单笔转出达到 10 RCAMP 时，暂停测试金库”。':'The rule is incomplete or unsupported. Use the complete example and adjust the threshold.',
 '阈值必须大于零，且最多支持 18 位小数。':'The threshold must be positive and have at most 18 decimal places.',
 '阈值超出支持范围。':'The threshold exceeds the supported range.',
 '请输入有效的代币和监控账户地址。':'Enter valid token and monitored account addresses.',
 '当前版本只支持已部署的 RCAMP 测试代币。':'This version supports only the deployed RCAMP test token.',
 '阈值必须大于零。':'The threshold must be greater than zero.',
 '请先安装或打开 MetaMask。':'Install or open MetaMask first.',
 '请打开 MetaMask。':'Open MetaMask first.',
 '请先点击“连接钱包”。':'Connect your wallet first.',
 '网络已切换，请核对网络后再点击一次操作。':'The network was switched. Check it and repeat the action.',
 '钱包已连接。请检查监控账户与规则后再确认。':'Wallet connected. Review the monitored account and rule before confirming.',
 '本地规则匹配完成。请核对清单后确认；这不是 AI 模型。':'Local rule matching completed. Review before confirming; this is not an AI model.',
 'AI 已生成候选规则；请自行核对，系统不会自动签名。':'AI generated a candidate rule. Review it yourself; no transaction is signed automatically.',
 '请在 MetaMask 中核对交易并自行确认。':'Review and confirm the transaction in MetaMask.',
 '交易已确认。请刷新链上状态，再查看最新结果。':'Transaction confirmed. Refresh the onchain status to see the latest result.',
 '已读取当前链上状态。跨链回调可能延迟；无记录不代表失败。':'Onchain status retrieved. Cross-chain callbacks may be delayed; missing records do not prove failure.',
 '请先翻译规则，并勾选确认完整部署清单。':'Translate the rule and confirm the deployment checklist first.',
 '当前规则已有监听合约。':'This rule already has a monitor contract.',
 '请先部署监听合约。':'Deploy the monitor contract first.',
 '当前已有测试金库。':'A test vault has already been deployed.',
 '请先部署测试金库。':'Deploy the test vault first.',
 '请先完成部署和绑定。':'Complete deployment and binding first.',
 '请切换到规则中指定的监控账户。':'Switch to the monitored account specified by the rule.',
 '请先部署金库。':'Deploy the vault first.',
 '存入数量须大于零。':'The deposit must be greater than zero.',
 '请先填写有效的监控账户和代币地址，再请求 AI 翻译。':'Enter valid monitored account and token addresses before requesting AI translation.',
 'AI 翻译未完成。':'AI translation was not completed.',
 'AI 返回的候选规则与页面条件不一致，请检查后重试。':'The AI candidate does not match the entered conditions. Check and try again.',
 'AI 服务暂时不可用，请稍后重试。':'AI is temporarily unavailable. Try again later.',
 'AI 解释未完成。':'AI explanation was not completed.',
 '尚未读取到本项目的链上证据，无法确认是否发生转账、回调或暂停。':'No onchain evidence has been read for this project, so a transfer, callback or pause cannot be confirmed.',
 '交易已失败，请在浏览器查看详情。':'The transaction failed. Check its details in the explorer.',
};
export function englishNotice(value) {
 if (!value) return value;
 if (notices[value]) return notices[value];
 if (value.startsWith('钱包已提交，等待链上确认：')) return 'Submitted. Waiting for onchain confirmation: '+value.split('：').slice(1).join('：');
 if (value.startsWith('读取链上状态失败，当前结果无法确认：')) return 'Could not read onchain status; the result cannot be confirmed: '+value.split('：').slice(1).join('：');
 return value;
}

export function englishExplanation(value) {
 if (!value) return value;
 const fixed={
  '这笔金额达到或超过规则阈值':'This amount meets or exceeds the threshold',
  '这笔金额未达到规则阈值':'This amount is below the threshold',
  '已请求回调，但这不代表回调已执行':'A callback was requested, but execution is not confirmed',
  '系统回执记录了回调错误，请查看目标链交易':'The system receipt recorded a callback error; check the destination transaction',
  '尚未观察到回调请求':'No callback request has been observed',
  '当前读取到金库已暂停':'The vault is currently reported as paused',
  '当前读取到金库未暂停':'The vault is currently reported as not paused',
  '记录显示回调与源交易匹配':'The recorded callback matches the source transaction',
  '尚未证实回调与源交易匹配':'The callback has not been confirmed to match the source transaction',
  '现有信息不足以确认回调成功，也不能确认金库因该规则暂停':'The available information cannot confirm a successful callback or that this rule paused the vault',
  '现有信息不能确认金库已因该规则暂停':'The available information cannot confirm that this rule paused the vault',
 };
 const parts=value.split('。').filter(Boolean);
 const translated=parts.map(part=>{
  const threshold=part.match(/^规则阈值为 (\d+(?:\.\d+)?) RCAMP$/);
  if(threshold)return `The rule threshold is ${threshold[1]} RCAMP`;
  const observed=part.match(/^监听合约记录的最近金额为 (\d+(?:\.\d+)?) RCAMP$/);
  if(observed)return `The latest amount recorded by the monitor is ${observed[1]} RCAMP`;
  return fixed[part];
 });
 return translated.every(Boolean)?translated.map(part=>part+'.').join(' '):value;
}
