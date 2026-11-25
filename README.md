# Ruleline 链上规则翻译官

Ruleline 将一条测试规则变成可核验的链上动作：监控指定账户转出 RCAMP，当单笔金额达到 10 RCAMP 时，Reactive 合约请求暂停测试金库的提款。仅供测试网演示，未经安全审计。

```text
Sepolia: Transfer 10 RCAMP
   → Lasna: RuleMonitor.react() 判断金额并请求回调
   → Sepolia: Callback Proxy → TestVault.pauseByRule()
   → VaultPaused，金库提款暂停
```

## 已核验链上交易

- [源链 Sepolia 转账](https://sepolia.etherscan.io/tx/0x507a68b74952968b2c03af7408282815206097bf5e3e2a2abc99b9ce2daa24e0)
- [Lasna Reactive 执行](https://lasna.reactscan.net/tx/0x0e974934a9b2f650dec573c1d9f814d11fd6ccd460ae2c1435a169c678fed12a)
- [Sepolia 目标金库回调](https://sepolia.etherscan.io/tx/0xcf018302ab9c02f3e92945eebf687a430676e211becf2fb1942d90f4b7a34a04)

三个交易收据成功，金库记录同一源交易且 paused 为 true。详细证据见 [链路记录](docs/2026-11-25-成功链路.md)。规则首次达标后退订，回调失败不会自动重试。

## 本地运行

需要 Foundry、Node.js 和 npm。先运行 forge build 生成前端使用的合约 ABI，再运行测试和前端：

```powershell
forge build
forge test
npm install
npm run dev -- --port 4177
```

在 Chrome 打开 http://127.0.0.1:4177/，使用测试钱包连接；部署、绑定及测试交易都需在钱包中确认，花费测试网 Gas。监听合约部署预存 0.1 lREACT，金库预存 0.01 Sepolia ETH，另需 Gas。不要输入或上传私钥、助记词。

## 范围

`src/RuleMonitor.sol` 订阅 Sepolia Transfer 并通过 Omni `requestCallbackV_1_0` 请求回调；`src/TestVault.sol` 使用官方回调鉴权。`test/` 为本地测试；`web/` 为演示页面。AI 服务为可选功能，本次链上成功证据不表明 AI 已参与执行。示例仅监控指定 RCAMP 和账户，不适用于真实资金。第三方依赖在 lib 内保留各自许可。
