import React from 'react';
import {fundingHealth} from './fundingHealth';

export default function FundingHealth({state,d,language='zh'}) {
 const en=language==='en';
 const health=fundingHealth({state,monitor:d.monitor,vault:d.vault,language});
 if (!d.monitor&&!d.vault) return null;
 return <div className="funding"><b>{en?'Funding and debt · read only':'费用与欠费 · 只读'}</b><p className={`funding-status funding-${health.level}`} role="status">{health.text}</p>{state&&<><p>{en?'Lasna monitor balance':'Lasna 监听合约余额'}: {state.monitorBalance??(en?'not checked':'未查询')} lREACT · {en?'system debt':'系统欠费'}: {state.monitorDebt??(en?'unconfirmed':'无法确认')} lREACT</p><p>{en?'Sepolia vault balance':'Sepolia 金库余额'}: {state.vaultBalance??(en?'not checked':'未查询')} ETH · {en?'proxy debt':'代理欠费'}: {state.vaultDebt??(en?'unconfirmed':'无法确认')} ETH · {en?'proxy reserves':'代理储备'}: {state.vaultReserves??(en?'unconfirmed':'无法确认')} ETH</p></>}<p>{en?'A direct transfer to the vault does not automatically clear proxy debt. Callback retries are not configured.':'直接给金库转账不会自动清除已有代理欠费；当前规则没有配置自动重试。'} <a href="https://dev.reactive.network/economy" target="_blank" rel="noreferrer">{en?'Official fee guide ↗':'官方费用说明 ↗'}</a></p></div>;
}
