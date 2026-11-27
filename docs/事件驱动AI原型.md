# 事件驱动 AI 测试网方案

这条流程由独立的服务端接口和测试网合约承载。现有网页沿用原功能。合约部署和绑定后，公网状态接口才能读取链上进度。

1. `AIEventObserver` 在 Lasna 监听 Sepolia 上指定账户的 RCAMP 单笔转账。达到阈值后，请求回调 Sepolia 的 `AIDecisionGate`，生成 `DecisionNeeded`。本原型只接收一次达标事件并退订。
2. `agent/watch-decisions.mjs` 读取确认后的 `DecisionNeeded` 及合约上下文，调用已配置的 Ruleline AI 服务，要求模型返回固定格式的 `pause`、`skip` 或 `manual` 建议。无效、超时、超过允许金额时改为人工处理。模型看不到私钥。
3. **当前 watcher 不签名、不发交易。** 它只打印可核对的 `submitDecision` 交易数据；有权限的 agent 地址或 owner 须自行通过钱包/签名工具核对后提交。它不是已经实现的无人值守自动执行。每个决策请求有有效期，人工可以取消，也可以永久关闭新决策。
4. `AIDecisionGate` 在链上检查提交者、动作白名单、原始请求是否存在、有效期、去重、监听金额上限和允许暂停的累计次数，再发出 `DecisionAccepted`。其中金额上限限制的是触发转账金额，**不代表可支配资产额度**。
5. Lasna 上的 `AIDecisionRelay` 只订阅固定 gate 的决策事件。仅 `pause` 可请求对固定的 Sepolia `AIDecisionVault` 回调。金库再次确认原请求、金额、期限和停止状态，并保留原有的调用方校验、去重和提款限额。`skip` 结束该请求。

测试方式：`forge test --match-contract AIDecisionFlowTest`；AI 建议校验：`node --test agent/decision.test.mjs`。合约的端到端测试采用模拟系统合约与回调代理，不等同真实 Reactive 或 Sepolia 结果。

要运行只读 watcher，需要先真实部署并绑定新合约，设置 `GATE_ADDRESS`、`OBSERVER_ADDRESS`、`SEPOLIA_RPC`、`LASNA_RPC`、`START_BLOCK` 和 `AI_ENDPOINT`，再运行 `node agent/watch-decisions.mjs`。可加 `--once` 只检查一轮。线上部署、充值、签名和交易须由用户本人核对确认。部署的顺序和费用、身份权限、目标链证据还需结合真实测试网重新验证。

在 Vercel 中通过 `AI_FLOW_OBSERVER`、`AI_FLOW_GATE`、`AI_FLOW_RELAY` 和 `AI_FLOW_VAULT` 配置四个已部署合约的地址。可使用 `AI_FLOW_SEPOLIA_RPC` 和 `AI_FLOW_LASNA_RPC` 设置自有 RPC。公网状态入口为 [GET /api/event-agent](https://ruleline-blush.vercel.app/api/event-agent)。调用方用服务端 `AI_FLOW_RUN_TOKEN` 作为 Bearer 凭证发起 POST，接口会读取至少三次确认的待处理请求并调用智谱，返回可供钱包核对的交易。无请求时读取状态即可，公网 GET 不调用模型。需要持续检测时，将只读 watcher 部署在长期运行的服务上。

运行 `forge build` 后，使用 `node agent/prepare-deployment.mjs <测试钱包公开地址>` 生成六步交易清单和预存预算。它会读取当前余额及 pending nonce，输出的地址为预期地址。逐笔核实钱包给出的 nonce、实际部署地址及回执。若出现额外交易或 nonce 变化，应重新规划后续部署并核对绑定。预存金额为示例预算，额外 Gas 以钱包估算为准。

部署后用一笔至少 10 RCAMP 的转账观察两次 Reactive 回调。依次保留源转账、第一次 Lasna 反应、Sepolia 决策请求、决策写链、第二次 Lasna 反应和金库响应的交易哈希。只有金库上记录了与该源交易一致的暂停，才确认真实闭环。未到期的请求可人工处理，关闭 gate 会让尚未执行的暂停回调在金库复核处失败。
