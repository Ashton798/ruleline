export function fundingHealth({state,monitor,vault,language='zh'}) {
 const en=language==='en';
 if (!state) return {level:'unknown',text:en?'Refresh onchain status to check balances and debt.':'刷新链上状态后查看余额和欠费。'};
 const positive=value=>typeof value==='string' && /^\d+(?:\.\d+)?$/.test(value) && /[1-9]/.test(value);
 if ((monitor&&positive(state.monitorDebt))||(vault&&positive(state.vaultDebt))) return {level:'warning',text:en?'Debt was reported. The affected contract may stop receiving service; check the exact debt and fund it using the documented method.':'检测到欠费，相关合约可能停止服务；请核对具体欠费，并按官方方式处理。'};
 if ((monitor&&state.monitorDebt==null)||(vault&&state.vaultDebt==null)) return {level:'unknown',text:en?'Some debt information could not be read; funding status is unconfirmed.':'部分欠费信息读取失败，费用状态无法确认。'};
 return {level:'checked',text:en?'No debt reported in the latest read. This does not guarantee future fees are covered.':'最近一次读取未发现欠费，但不保证后续费用充足。'};
}
