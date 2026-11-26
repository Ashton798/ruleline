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

## 保护规则（本地新版）

- 防误触发：只接受系统调用，检查源链、代币、转出账户、事件格式和单笔阈值；不足阈值不请求回调。
- 防重复：监听合约首次达标后退订，金库按源交易哈希记录已处理的回调，即使恢复提款后再次投递同一事件也会被拒绝。源交易哈希用于本示例的单一 Sepolia 规则，不适合直接作为跨链或一笔交易多个事件的通用唯一标识。
- 额度：仅金库所有者可提款；本例 RCAMP 按 18 位小数计算，单次最多 10 RCAMP、累计成功提款最多 50 RCAMP，失败交易不会消耗额度。暂停时不能提款。安全额度是演示参数，并非自动保护其他代币。

这些是源码与本地测试中的新保护；上面 11 月 25 日部署的合约不可修改，不包含本次新增的限额和回调去重。要在链上使用新版需重新部署、绑定和测试，并由用户亲自确认交易。

## 出问题怎么办

- Reactive 合约费用由 Lasna 侧承担，回调费用由目标链上的接收金库承担。余额和 reserves 不足可能产生 debt；只要欠费，相关执行会暂停。先查询官方系统合约或回调代理的 `debt(address)` 和 `reserves(address)`，不要把钱包余额当作合约余额。
- 在确认网络、目标地址和费用后，可通过对应系统合约或目标链代理的 `depositTo(address)` 为欠费合约充值并清偿欠费；充值交易须本人核对和签名。具体方法和当前地址见 [官方费用文档](https://dev.reactive.network/economy)。充值并不自动重新订阅已退订的本项目规则。
- 如果目标链回调交易失败，先用目标链收据、代理日志和金库状态确认结果；区块确认不代表执行成功。请求已成功后本项目规则会退订，不会自动重试；要再次执行需要重新部署规则并绑定新的金库。已消耗的测试网 Gas 不会因失败退回。
- 监听合约内请求回调或退订本身发生 revert 时，整笔 react 事务会回滚；本地测试覆盖该情况。目标链后续失败不回滚已经成功的 Lasna 交易。

## 已部署地址（已验证的 2026-11-25 演示）

| 角色 | 网络 | 合约地址 |
| --- | --- | --- |
| 源代币 RCAMP（已有测试代币） | Ethereum Sepolia | [0x96E9530cc78599b115a0e5e5873a2E88F661a977](https://sepolia.etherscan.io/address/0x96E9530cc78599b115a0e5e5873a2E88F661a977) |
| 监听合约 RuleMonitor | Reactive Lasna | [0x8F48514E08e92E3804895987C92F19Cc2e704A1D](https://lasna.reactscan.net/address/0x8F48514E08e92E3804895987C92F19Cc2e704A1D) |
| 接收合约 TestVault | Ethereum Sepolia | [0x9943C61014F6227C72EFAD4FB14A777BC38720Ef](https://sepolia.etherscan.io/address/0x9943C61014F6227C72EFAD4FB14A777BC38720Ef) |
| 官方 Callback Proxy | Ethereum Sepolia | [0xAa14d9Cd0f788Ca23d11805986C1d8bd035D23b4](https://sepolia.etherscan.io/address/0xAa14d9Cd0f788Ca23d11805986C1d8bd035D23b4) |

旧版链上演示和当前源码不同：`a409f73` 增加的金库去重和提款上限仅在本地测试，旧地址不包含它们；不要用旧交易宣称新增保护已在链上验证。

## 手动验证与重新部署

1. 打开上方三笔交易；分别核对交易成功、Reactive 的 `PauseRequested`、目标合约的 `VaultPaused`。两条事件均记录同一源交易哈希 `0x507a68b74952968b2c03af7408282815206097bf5e3e2a2abc99b9ce2daa24e0`，目标金库 `paused()` 为 true。
2. 本项目使用一次性订阅，已经触发过的监听合约不会对新转账再次执行。如果想演示新版保护，需要用测试钱包和测试币重新部署一组监听合约及金库、先绑定再发送测试转账；先检查规则、网络、账户和费用，在 MetaMask 本人逐笔签名。
3. 页面用钱包连接 Account 2，按部署清单依次在 Lasna 部署监听合约、在 Sepolia 部署测试金库、在 Lasna 绑定，再在 Sepolia 用指定账户自转阈值数量的 RCAMP；链上状态以交易收据和合约日志为准。
4. 费用、网络地址和水龙头可能变化，部署前重新对照 [官方网络表](https://dev.reactive.network/origins-and-destinations) 与 [费用文档](https://dev.reactive.network/economy)。不得提交助记词、私钥或 API Key。项目仅为未经审计的测试网 Demo，不保护其他协议，也不能阻止已经发生的源链转账。

## AI 使用与验证

本项目由开发者借助 Codex 等 AI 编程工具协助构思、实现和排查；合约、测试、前端及文档包含 AI 辅助生成或修改的内容。通过 Foundry 本地测试和三笔可公开核验的测试网交易交叉检查，链上旧版和本地保护新版的证据分别标注。检查和测试不能替代安全审计。

项目提供可选的外部模型接口来生成待人工核对的候选规则或解释状态；模型可能失败、收费或误解输入，不可自行签名或发送交易。本次展示的三笔链上交易证明规则链路运行，不能证明 AI 模型参与了这次运行。若申请 Reactive Meets AI 赛道，仍需完成并验证运行时 AI 的输入、输出及其在实际流程中的作用。
