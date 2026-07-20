# Travel Rule 合规演示 (Compliance Demo)

一个用于演示 **虚拟资产 Travel Rule（旅行规则）合规流程** 的全栈原型，覆盖 KYC / KYB 准入、AML 筛查与监控、以及基于 Notabene 网络的跨机构转账全生命周期。

> **演示性质**：本仓库为原型 / 演示用途，沙箱环境对接真实 API，**请勿直接用于生产**。

---

## 一、演示包含什么

围绕一笔受监管的加密资产转账，四个角色协同完成合规闭环：

| 角色 | 身份 | 职责 |
|------|------|------|
| **Entity A** | 发起方客户 (Originator) | 发起 Travel Rule 转账请求 |
| **Custodian A** | 发起方托管机构 (Originating VASP) | 持有钱包、广播链上交易、为 A 端合规背书 |
| **Entity B** | 接收方客户 (Beneficiary) | 审核并授权接收转账 |
| **Custodian B** | 接收方托管机构 (Beneficiary VASP) | 持有钱包、确认到账、结算 |

**资金流**：`Entity A (Custodian A 钱包)` → `Entity B (Custodian B 钱包)`
**合规信息流**（Travel Rule 消息）：`Originator VASP` ↔ `Beneficiary VASP`，通过 Notabene 网络传递。

### 集成的外部服务

- **Notabene** — Travel Rule 消息网络（转账创建 / 授权 / 拒绝 / 结算 / Webhook）
- **Sumsub** — KYC / KYB 准入与 WebSDK、AML 名单筛查
- **Elliptic** — 链上地址 / 交易 AML 筛查与风险评分（0–10 risk scale）
- **Sepolia 测试网** — 真实链上 ERC-20 转账（KLCC 测试代币）
- **Cloudflare Tunnel** — 将本地服务暴露到公网，供 Webhook 回调

---

## 二、环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Node.js | ≥ 18 | 服务端运行时 |
| npm | ≥ 9 | 包管理 |
| cloudflared | 仅本地开发需要 | 临时公网隧道；若已有公网域名则无需安装 |

无需数据库 —— 所有状态保存在本地 JSON 文件（已被 `.gitignore` 忽略）。

> **关于公网可达性**：Webhook 回调要求服务可被外网访问。两种方式任选其一：
> - **本地开发** → 使用内置 cloudflared 隧道（临时域名，每次重启会变）
> - **生产 / 有公网域名** → 直接用你的域名（`https://your-domain/notabene/webhook`），**无需 cloudflared**

---

## 三、快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/cxywest-cell/compliance-demo.git
cd compliance-demo

# 2. 安装依赖
npm install

# 3. 配置环境变量（见下一节）
cp .env.example .env
#   → 用编辑器打开 .env，填入你自己的凭证

# 4. 启动服务
bash start.sh
#   或: node server.js
```

启动后访问 **http://localhost:8000/** 即可看到主页（左侧导航栏）。

---

## 四、配置指南（重要）

本演示需要配置三类内容，**请按顺序完成**：

### 4.1 `.env` 文件（服务端凭证）

复制 `.env.example` 为 `.env`，按区块填入：

#### A. Notabene 四角色凭证
在 Notabene 沙箱控制台为四个 workspace 分别创建 OAuth 应用，获取 `client_id` / `client_secret` / `did`：

```bash
# 发起方
ENTITY_A_CLIENT_ID=xxx
ENTITY_A_SECRET=xxx
ENTITY_A_DID=did:web:your-workspace-a.sandbox.notabene.id

CUSTODIAN_A_CLIENT_ID=xxx
CUSTODIAN_A_SECRET=xxx
CUSTODIAN_A_DID=did:web:your-custodian-a.sandbox.notabene.id

# 接收方
ENTITY_B_CLIENT_ID=xxx
ENTITY_B_SECRET=xxx
ENTITY_B_DID=did:web:your-workspace-b.sandbox.notabene.id

CUSTODIAN_B_CLIENT_ID=xxx
CUSTODIAN_B_SECRET=xxx
CUSTODIAN_B_DID=did:web:your-custodian-b.sandbox.notabene.id
```

#### B. Sumsub 凭证（KYC/KYB 准入）
在 Sumsub 后台获取：

```bash
SUMSUB_APP_TOKEN=        # App Token (sum-xxx)
SUMSUB_API_SECRET=       # API Secret Key
SUMSUB_WEBSDK_SECRET=    # WebSDK Access Token（与 API Secret 不同）
```

#### C. Webhook 签名密钥（可选，用于校验回调真实性）

```bash
WEBHOOK_SECRET=              # Sumsub Webhook Secret
NOTABENE_WEBHOOK_SECRET=     # Notabene 旧版共享密钥（如使用）
```

> Notabene 每个 workspace 有**各自独立**的 webhook secret，在 Settings 页面逐个填写（见 4.3）。

#### D. 区块链（可选）

```bash
SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com   # 默认值，通常无需修改
```

---

### 4.2 Settings 页面（前端配置中心）

访问 **http://localhost:8000/settings**，这是所有运行时配置的中枢。`.env` 仅用于服务端引导，**所有前端使用的凭证都通过 Settings 页面保存**（存入浏览器 localStorage + 服务端 JSON 文件）。

Settings 包含三个标签页：

#### ① Sumsub 标签页
- 填入 App Token / API Secret / WebSDK Secret
- 设置 Webhook 回调 URL（使用 4.4 的隧道地址）

#### ② Notabene 标签页
这是配置的核心，包含：

- **Base URL**：默认 `https://api.eu1.notabene.id`（沙箱）
- **Webhook 卡片**：
  - 回调 URL（填隧道地址 + `/notabene/webhook`）
  - **4 个 per-role webhook secret 输入框**（每个 workspace 一个）
  - 实时 webhook 事件控制台
- **托管钱包（Custody Wallets）**：
  - 发起方钱包（Originating）与接收方钱包（Destination）各一个
  - 点击 **Generate** 生成新钱包，或 **Import** 导入已有私钥
  - 钱包持久化在服务端 `.wallets.json`，刷新浏览器不会丢失
  - 每个钱包卡片支持查余额、链上转账
- **四个角色卡片**（Entity A / Custodian A / Entity B / Custodian B）：
  - 每张卡片填写该角色的 `apiKey` / `apiSecret` / `DID`
  - 可展开查看该角色的 DID Document

> **保存**后配置会同步写入服务端：钱包 → `.wallets.json`，webhook secrets → `.notabene-secrets.json`。

#### ③ Elliptic AML 标签页

配置链上地址 / 交易的 AML 筛查服务：

- **API Key** / **API Secret** — Elliptic 控制台获取
- **API Endpoint** — 默认 `aml-api.elliptic.co`（AML v2）
- **Sign Method** — 默认 `HMAC-SHA256`
- **Risk Scale** — 风险评分图例：0–3 Low（绿）、4–7 Medium（橙）、8–10 High（红）
- **Test Elliptic Connection** 按钮 — 验证凭证是否可用

---

### 4.3 公网可达性（Webhook 必需）

Webhook 回调要求**公网可达的 HTTPS 地址**。根据你的部署方式选择：

#### 方式一：本地开发 → cloudflared 隧道（内置）

1. 在 **Settings → Notabene 标签页 → Webhook 卡片** 点击 **Generate URL**
2. 等待 5–10 秒，会生成形如 `https://xxx.trycloudflare.com` 的临时公网地址
3. 拼接 `/notabene/webhook` 与 `/sumsub/webhook`，填入各后台

> 一条隧道同时服务两个路径：`/sumsub/webhook` 和 `/notabene/webhook`。
> trycloudflare 临时域名每次重启会变，需同步更新后台配置。

#### 方式二：已有公网域名 → 无需隧道

若服务部署在公网服务器（如 `https://compliance.example.com`），直接使用：

- Notabene webhook：`https://your-domain/notabene/webhook`
- Sumsub webhook：`https://your-domain/sumsub/webhook`

**无需安装或启动 cloudflared**。此方式更稳定，域名不随重启变化。

---

### 4.4 外部后台配置清单

配置完成后，请到各外部后台确认：

| 平台 | 配置项 | 值 |
|------|--------|----|
| Notabene（4 个 workspace） | Webhook URL | `https://<隧道>/notabene/webhook` |
| Sumsub | Webhook URL | `https://<隧道>/sumsub/webhook` |
| Sumsub | Webhook Secret | 与 `.env` / Settings 中一致 |

---

## 五、页面导览

| 页面 | 路径 | 功能 |
|------|------|------|
| **Onboard** | `/onboarding` | Sumsub WebSDK 准入：个人 KYC、企业 KYB、无文档 KYC |
| **Entity Screening** | `/screening` | AML 名单筛查、风险评级、案例详情 |
| **Tx/Addr Screening** | `/monitoring` | 地址 / 交易实时筛查与持续监控 |
| **Travel Rule Transfer** | `/transfer` | 四角色协同的转账全流程 |
| **Settings** | `/settings` | 凭证、钱包、Webhook、隧道的配置中枢 |

### Travel Rule 转账流程（`/transfer`）

```
Step 1  连接测试       四个角色分别 OAuth 验证 Notabene 网络
Step 2  创建转账       Entity A 发起：金额、资产、对方 DID、agent 链
Step 3  审核授权       Entity B / Custodian B 审核并 Authorize / Reject
Step 4  链上结算       Custodian 广播 ERC-20 转账，回填 txHash 完成结算
```

每个状态变更都会通过 Notabene 触发 webhook，实时显示在 Settings 的 webhook 控制台。

---

## 六、数据与安全说明

- **本仓库不含任何密钥**：所有凭证通过 `.env`（本地）和 Settings 页面（浏览器 + 服务端 JSON）注入。
- `.env`、`.wallets.json`、`.notabene-secrets.json`、`.compliance-applicants.json`、`.webhooks.json` 均已在 `.gitignore` 中。
- 重新部署时只需重新填写 `.env` 并在 Settings 页面导入配置即可。

---

## 七、常见问题

**Q: WebSDK 链接打开报错 "Invalid successUrl"？**
A: Sumsub 拒绝 `localhost` 作为回调地址。请先用任意方式获得公网 HTTPS 地址（cloudflared 隧道或你自己的公网域名），再创建 WebSDK 链接。

**Q: Notabene Webhook 显示 `verified: false`？**
A: 每个工作区使用各自的 webhook secret。请在 Settings → Notabene → Webhook 卡片填入 4 个真实 secret 并保存。

**Q: 链上转账失败 "Sender has 0 ETH"？**
A: 发起方钱包需要少量 Sepolia ETH 支付 gas。请先通过水龙头（faucet）充值。

**Q: 自定义资产（非内置 KLCC）怎么配置？**
A: Notabene 资产库未注册的代币，转账时必须传 `transactionValue: { amount, currency: "USD" }`。资产用 CAIP-19 标识（如 `eip155:11155111/erc20:0x...`）。

---

## 八、技术栈

- **后端**：Node.js + Express（API 代理、Webhook 接收、Svix 签名校验、钱包管理）
- **前端**：原生 HTML / CSS / JS（无构建步骤）
- **外部 SDK**：ethers v6（链上交互）、Sumsub WebSDK
- **隧道**：cloudflared

---

## License

MIT
