# 事件驱动 AI：本地原型（未部署）

本分支在现有 Ruleline 之外增加一个测试网研究原型；它尚未接入线上页面、没有部署地址，也没有真实跨链闭环证据。不要用于真实资产。

1. `AIEventObserver` 在 Lasna 监听 Sepolia 上指定账户的 RCAMP 单笔转账。达到阈值后，请求回调 Sepolia 的 `AIDecisionGate`，生成 `DecisionNeeded`。本原型只接收一次达标事件并退订。
2. `agent/watch-decisions.mjs` 读取确认后的 `DecisionNeeded` 及合约上下文，调用已配置的 Ruleline AI 服务，要求模型返回固定格式的 `pause`、`skip` 或 `manual` 建议。无效、超时、超过允许金额时改为人工处理。模型看不到私钥。
3. **当前 watcher 不签名、不发交易。** 它只打印可核对的 `submitDecision` 交易数据；有权限的 agent 地址或 owner 须自行通过钱包/签名工具核对后提交。它不是已经实现的无人值守自动执行。每个决策请求有有效期，人工可以取消，也可以永久关闭新决策。
4. `AIDecisionGate` 在链上检查提交者、动作白名单、原始请求是否存在、有效期、去重、监听金额上限和允许暂停的累计次数，再发出 `DecisionAccepted`。其中金额上限限制的是触发转账金额，**不代表可支配资产额度**。
5. Lasna 上的 `AIDecisionRelay` 只订阅固定 gate 的决策事件；仅 `pause` 可请求对固定的 Sepolia `TestVault` 回调。金库仍使用现有的调用方校验、重复回调保护和提款金额限制。`skip` 不发回调。

测试方式：`forge test --match-contract AIDecisionFlowTest`；AI 建议校验：`node --test agent/decision.test.mjs`。合约的端到端测试采用模拟系统合约与回调代理，不等同真实 Reactive 或 Sepolia 结果。

要运行只读 watcher，需要先真实部署并绑定新合约，设置 `GATE_ADDRESS`、`OBSERVER_ADDRESS`、`SEPOLIA_RPC`、`LASNA_RPC`、`START_BLOCK` 和 `AI_ENDPOINT`，再运行 `node agent/watch-decisions.mjs`。可加 `--once` 只检查一轮。线上部署、充值、签名和交易须由用户本人核对确认。部署的顺序和费用、身份权限、目标链证据还需结合真实测试网重新验证。

限制：监听进度仅在进程内保存；重启需要手动选择起始区块，RPC 断连、模型错误、重组和最终性仍需完善。Vercel Functions 不会持续监听；需要另外的长期运行服务。关闭 gate 只能阻止新的决策，**已经发出的决策事件或已请求的回调可能仍在路上**，不是可靠的全链路紧急停止。当前不支持价格事件、任意代币或任意交易。本原型尚未审计。
