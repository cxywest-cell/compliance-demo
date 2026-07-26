# Travel Rule Compliance Demo | Travel Rule 合规演示

一个用于演示**虚拟资产 Travel Rule（旅行规则）合规流程**的全栈原型，覆盖 KYC/KYB 准入、AML 筛查，以及基于 Notabene 网络的跨 VASP 转账全生命周期。

> **演示性质**：本仓库为原型 / 演示用途，沙箱环境对接真实 API，**请勿直接用于生产**。

---

## 四个角色

一笔合规转账需要四个角色通过 Notabene Travel Rule 消息网络协同完成：

| 角色 | 身份 | 职责 |
|------|------|------|
| **Entity A** | 发起方 VASP | 发起 Travel Rule 转账、广播链上交易、提交 PII |
| **Custodian A** | A 端托管机构 | 持有钱包、作为 Transfer Agent 参与转账链路 |
| **Entity B** | 接收方 VASP | 审核 PII、授权/拒绝/标记、匹配链上到账 |
| **Custodian B** | B 端托管机构 | 持有钱包、作为 Transfer Agent 参与转账链路 |

**资金流**：`Entity A 钱包` → `Entity B 钱包`（Sepolia 测试链 USDT-TEST）

**合规信息流**：`Entity A` ↔ `Entity B`（通过 Notabene 网络加密传输 PII）

> 每个角色在 Notabene 沙箱控制台拥有独立的 OAuth 凭证（Client ID / Secret / DID）。

---

## 六个演示场景

点击「Travel Rule Transfer」进入场景选择页面，每个场景展示不同的合规路径：

### Case 1：标准流程（Happy Path）

完整合规流程：EA 发送 3,500 USDT-TEST 并附带完整 PII → EB 审核 PII、验证受益人姓名 → 授权 → EA 广播链上转账 → EA 提交 Settle → EB 通过 txMatch 匹配链上到账。

### Case 2：规则发现（通过拒绝触发）

EA 发送最小化 PII（不含 IVMS101） → EB 发现 PII 不足 → 拒绝（Reject） → EB 创建反向 Counter-Transfer 并附带自己的 REQUIRE_PRESENTATION 策略 → EA 发现对方规则 → 补充正确 PII → 正常结算。

### Case 3：结算后规则发现

EA 不含 PII 发送 → EB 直接授权并结算 → EB 在结算后发现缺少 PII → 创建 Counter-Transfer 发起 RFI（信息请求） → EA 发现规则 → 补充 PII。

### Case 4：撤销 — 取消并退款

完整标准流程正常结算后 → EA 发起 Revert 请求（附 reason + settlementAddress） → 状态变为 REVERT-REQUESTED → EB 在链上发送退款 → EB 提交 Settle（退款 txHash） → 双方状态变为 REVERTED。

### Case 5：托管机构代理（Custodian Agents）

标准流程 + 托管机构参与：EA 在创建转账时将 Custodian A 作为 Custodian Agent 写入 agents 数组 → EB 接收后通过 API 手动添加 Custodian B → 托管机构可查看转账详情、agent 链路和 PII。

### Case 6：未注册地址 — 手动确认关系

EA 向一个**未在 Notabene 关系表中注册**的新地址发起转账 → `REQUIRE_RELATIONSHIP_CONFIRMATION` 策略保持 PENDING（无法自动确认） → EB 查看转账策略状态 → EB 通过 `PATCH /entity/:did/relationship` 手动确认地址归属 → 策略变为 COMPLETED → PII 解密可见。

---

## Inspector — 交易检查器

每个场景页面底部内置 Inspector（检查器）面板，支持从**四个角色视角**查看任意转账：

- 选择角色（Entity A / Entity B / Custodian A / Custodian B）
- 输入 Transfer ID
- 查看完整转账详情：状态、方向（OUTGOING/INCOMING）、金额、Agent 链路及策略、PII（如已解密）

---

## Webhook Console — Webhook 控制台

每个场景页面底部内置实时 Webhook 控制台：

- 自动接收并展示 Notabene 推送的所有事件
- 按 4 个角色（EA/CA/EB/CB）标记事件来源
- 签名验证状态（✓ 已验证 / ✗ 未验证）
- 点击任意事件查看完整 JSON payload

---

## 集成的外部服务

- **[Notabene](https://notabene.id)** — Travel Rule 消息网络（转账创建、授权、结算、Revert、关系管理、Webhook）
- **[Sumsub](https://sumsub.com)** — KYC/KYB 准入、WebSDK、AML 姓名筛查
- **[Elliptic](https://elliptic.co)** — 链上地址/交易 AML 筛查与风险评分（0–10）
- **Sepolia 测试链** — 真实 ERC-20 转账（USDT-TEST）
- **Cloudflare Tunnel** — 本地服务暴露公网，接收 Webhook 回调

---

## 快速开始

### 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Node.js | ≥ 18 | 服务端运行时 |
| npm | ≥ 9 | 包管理 |
| cloudflared | 可选 | Webhook 隧道，有公网域名则不需要 |

无需数据库 —— 所有状态保存在本地 JSON 文件（已在 `.gitignore` 中排除）。

### 安装与启动

```bash
# 1. 克隆仓库
git clone https://github.com/cxywest-cell/compliance-demo.git
cd compliance-demo

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
#   → 编辑 .env，填入各服务凭证（见下方配置说明）

# 4. 启动
bash start.sh
#   或: node server.js
```

启动后访问 **http://localhost:8000/** 即可看到主页。

---

## 配置指南

> ⚠️ **Webhook 是核心**：转账创建、授权、KYC 完成、AML 命中等状态变更都通过 Webhook 实时推送。没有 Webhook 配置，演示将失去实时合规闭环。

配置分两个入口：`.env`（服务端引导）和 Settings 页面（运行时）。

### 1. `.env` 文件

从 `.env.example` 复制，填入以下凭证：

#### Notabene — 四角色凭证

每个角色在 Notabene 沙箱控制台创建 OAuth 应用，获取 `client_id` / `client_secret` / `did`：

```bash
NOTABENE_EA_CLIENT_ID=          # Entity A（发起方）
NOTABENE_EA_CLIENT_SECRET=
NOTABENE_EA_DID=did:web:your-workspace-a.sandbox.notabene.id:ae
NOTABENE_EA_WEBHOOK_SECRET=

NOTABENE_CA_CLIENT_ID=          # Custodian A（发起方托管）
NOTABENE_CA_CLIENT_SECRET=
NOTABENE_CA_DID=did:web:your-custodian-a.sandbox.notabene.id:ca
NOTABENE_CA_WEBHOOK_SECRET=

NOTABENE_EB_CLIENT_ID=          # Entity B（接收方）
NOTABENE_EB_CLIENT_SECRET=
NOTABENE_EB_DID=did:web:your-workspace-b.sandbox.notabene.id:am
NOTABENE_EB_WEBHOOK_SECRET=

NOTABENE_CB_CLIENT_ID=          # Custodian B（接收方托管）
NOTABENE_CB_CLIENT_SECRET=
NOTABENE_CB_DID=did:web:your-custodian-b.sandbox.notabene.id:cb
NOTABENE_CB_WEBHOOK_SECRET=
```

#### Sumsub — KYC/KYB

```bash
SUMSUB_APP_TOKEN=               # App Token (sum-xxx)
SUMSUB_API_SECRET=              # API Secret Key
SUMSUB_WEBSDK_SECRET=           # WebSDK Access Token
WEBHOOK_SECRET=                 # Sumsub Webhook 签名密钥
```

#### Elliptic — 链上 AML（可选）

```bash
ELLIPTIC_KEY=                   # API Key
ELLIPTIC_SECRET=                # API Secret
ELLIPTIC_ENDPOINT=aml-api.elliptic.co
ELLIPTIC_SIGN=HMAC-SHA256
```

#### 区块链

```bash
SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com   # 默认，一般无需修改
```

### 2. Settings 页面

访问 **http://localhost:8000/settings** — 运行时配置中枢。`.env` 仅用于服务端引导，所有前端凭证通过 Settings 页面保存（持久化到服务端 JSON）。

Settings 包含以下标签页：
- **Sumsub** — App Token / API Secret / WebSDK Secret
- **Notabene** — Base URL、各角色 Webhook Secret、托管钱包、4 个角色凭证卡片（apiKey/apiSecret/DID）
- **Elliptic AML** — API Key/Secret、风险评分图例、连接测试

#### 托管钱包

Settings 的 Notabene 标签页管理托管钱包：
- **发起方钱包**（Custodian A）和**接收方钱包**（Custodian B）
- 点击 **Generate** 生成新钱包，或 **Import** 导入已有私钥
- 钱包持久化在服务端 `.wallets.json`，刷新浏览器不丢失
- 每个钱包卡片显示余额并支持链上转账

### 3. 公网可达性（Webhook）

Webhook 需要公网 HTTPS 地址。两种方式：

**方式一：Cloudflare 隧道（内置，适合本地开发）**

1. 进入 **Settings** → 任意标签页的「Generate URL」
2. 点击 **Generate URL**，等待 5–10 秒
3. Webhook URL 自动填充：
   - `https://<tunnel>/notabene/webhook` → Notabene 控制台
   - `https://<tunnel>/sumsub/webhook` → Sumsub 控制台
4. 将这些 URL 粘贴到对应外部后台

> ⚠️ trycloudflare 临时域名每次重启都会变。

**方式二：自有公网域名**

部署在公网服务器上时，在 Settings 手动填入：
- `https://your-domain/notabene/webhook`
- `https://your-domain/sumsub/webhook`

无需 cloudflared，更稳定，重启后 URL 不变。

### 4. 外部后台配置清单

| 平台 | 配置项 | 值 |
|------|--------|-----|
| Notabene（4 个工作区） | Webhook URL | `https://<tunnel>/notabene/webhook` |
| Sumsub | Webhook URL | `https://<tunnel>/sumsub/webhook` |
| Sumsub | Webhook Secret | 与 `.env` / Settings 中一致 |

---

## 页面导览

| 页面 | 路径 | 功能 |
|------|------|------|
| **Onboard** | `/onboarding` | Sumsub WebSDK：个人 KYC、企业 KYB、免证件 KYC |
| **Entity Screening** | `/screening` | AML 姓名筛查、风险评级、案件详情 |
| **Tx/Addr Screening** | `/monitoring` | 地址/交易实时筛查与监控 |
| **Travel Rule Transfer** | `/transfer-flow` | 6 个场景选择器，四角色协同转账生命周期 |
| **Settings** | `/settings` | 凭证、钱包、Webhook、隧道配置中枢 |
| **VASP Directory** | `/network` | Notabene VASP 目录查询 |

---

## 数据与安全

- **本仓库不含任何密钥**：所有凭证通过 `.env`（本地）和 Settings 页面注入
- `gitignore` 排除：`.env`、`.wallets.json`、`.compliance-applicants.json`、`.webhooks.json`
- 重新部署时只需重新填写 `.env` 并在 Settings 页面导入配置

---

## 常见问题

**Q：WebSDK 链接报错「Invalid successUrl」？**
A：Sumsub 拒绝 `localhost` 回调。先生成 Cloudflare 隧道 URL，再创建 WebSDK 链接。

**Q：Notabene Webhook 显示 `verified: false`？**
A：每个工作区有独立的 Webhook Secret。在 Settings → Notabene → Webhook 卡片中填入 4 个真实的 secret。

**Q：链上转账失败「Sender has 0 ETH」？**
A：发起方钱包需要 Sepolia ETH 支付 gas，先通过水龙头充值。

---

## 技术栈

- **后端**：Node.js + Express（API 代理、Webhook 接收、钱包管理）
- **前端**：原生 HTML/CSS/JS（无构建步骤）
- **SDK**：ethers v6（链上交易）、Sumsub WebSDK
- **隧道**：cloudflared

---

## License

MIT
