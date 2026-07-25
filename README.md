# Travel Rule Compliance Demo | Travel Rule 合规演示

A full-stack prototype demonstrating **Virtual Asset Travel Rule compliance** — covering KYC/KYB onboarding, AML screening, and the complete VASP-to-VASP transfer lifecycle on the Notabene network.

一个用于演示**虚拟资产 Travel Rule（旅行规则）合规流程**的全栈原型，覆盖 KYC/KYB 准入、AML 筛查，以及基于 Notabene 网络的跨机构转账全生命周期。

> **Demo / Sandbox only**: This is a prototype connected to real sandbox APIs. **Do NOT use in production.**
> **演示性质**：本仓库为原型 / 演示用途，沙箱环境对接真实 API，**请勿直接用于生产**。

---

## Four Roles | 四个角色

A compliant transfer involves four parties working together through the Notabene Travel Rule messaging network:

一笔合规转账需要四个角色通过 Notabene Travel Rule 消息网络协同完成：

| Role | Identity | Responsibility |
|------|----------|---------------|
| **Entity A** | Originator (Customer) | Initiates the Travel Rule transfer |
| **Custodian A** | Originating VASP | Holds wallets, broadcasts on-chain tx, compliance backing for A |
| **Entity B** | Beneficiary (Customer) | Reviews PII, authorizes or rejects the transfer |
| **Custodian B** | Beneficiary VASP | Holds wallets, confirms deposit, settles |

| 角色 | 身份 | 职责 |
|------|------|------|
| **Entity A** | 发起方客户 | 发起 Travel Rule 转账请求 |
| **Custodian A** | 发起方托管机构 (VASP) | 持有钱包、广播链上交易、为 A 端合规背书 |
| **Entity B** | 接收方客户 | 审核 PII、授权或拒绝转账 |
| **Custodian B** | 接收方托管机构 (VASP) | 持有钱包、确认到账、结算 |

**Fund flow | 资金流**: `Entity A (Custodian A wallet)` → `Entity B (Custodian B wallet)`

**Compliance message flow | 合规信息流**: `Originator VASP` ↔ `Beneficiary VASP` via Notabene network

---

## Integrated Services | 集成的外部服务

- **[Notabene](https://notabene.id)** — Travel Rule messaging network (transfer creation, authorization, settlement, webhooks)
- **[Sumsub](https://sumsub.com)** — KYC/KYB onboarding, WebSDK, AML name screening
- **[Elliptic](https://elliptic.co)** — On-chain address/transaction AML screening and risk scoring (0–10 scale)
- **Sepolia Testnet** — Real ERC-20 transfers (USDT-TEST)
- **Cloudflare Tunnel** — Exposes local server to public internet for webhook callbacks

---

## Quick Start | 快速开始

### Prerequisites | 环境要求

| Dependency | Version | Notes |
|------------|---------|-------|
| Node.js | ≥ 18 | Server runtime |
| npm | ≥ 9 | Package management |
| cloudflared | Dev only | For webhook tunnel; not needed if you have a public domain |

No database required — all state is stored in local JSON files (gitignored).

无需数据库 —— 所有状态保存在本地 JSON 文件（已在 `.gitignore` 中排除）。

### Install & Run | 安装与启动

```bash
# 1. Clone
git clone https://github.com/cxywest-cell/compliance-demo.git
cd compliance-demo

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
#   → Edit .env with your credentials (see Configuration section below)

# 4. Start
bash start.sh
#   or: node server.js
```

Open **http://localhost:8000/** — the main page with navigation sidebar.

启动后访问 **http://localhost:8000/** 即可看到主页。

---

## Configuration | 配置指南

> ⚠️ **Webhooks are critical**: Notabene and Sumsub status changes (transfer created, authorized, KYC completed, AML hit) are pushed via webhooks. **Without webhook configuration, the demo loses its real-time compliance loop.**
> **Webhook 配置是核心**：转账创建、授权、KYC 完成、AML 命中等状态变更都通过 webhook 实时推送。

Configuration is done in two places: `.env` (server bootstrap) and the Settings page (runtime).

### 1. `.env` File | 环境变量文件

Copy `.env.example` to `.env` and fill in:

#### Notabene — 4 Role Credentials | 四角色凭证

Each role needs its own OAuth client from the Notabene sandbox console. Note the naming convention: `EA`/`CA`/`EB`/`CB` = Entity A / Custodian A / Entity B / Custodian B.

每个角色在 Notabene 沙箱控制台创建 OAuth 应用，获取 `client_id` / `client_secret` / `did`：

```bash
NOTABENE_EA_CLIENT_ID=          # Entity A (Originator)
NOTABENE_EA_CLIENT_SECRET=
NOTABENE_EA_DID=did:web:your-workspace-a.sandbox.notabene.id:ae
NOTABENE_EA_WEBHOOK_SECRET=

NOTABENE_CA_CLIENT_ID=          # Custodian A (Originating VASP)
NOTABENE_CA_CLIENT_SECRET=
NOTABENE_CA_DID=did:web:your-custodian-a.sandbox.notabene.id:ca
NOTABENE_CA_WEBHOOK_SECRET=

NOTABENE_EB_CLIENT_ID=          # Entity B (Beneficiary)
NOTABENE_EB_CLIENT_SECRET=
NOTABENE_EB_DID=did:web:your-workspace-b.sandbox.notabene.id:am
NOTABENE_EB_WEBHOOK_SECRET=

NOTABENE_CB_CLIENT_ID=          # Custodian B (Beneficiary VASP)
NOTABENE_CB_CLIENT_SECRET=
NOTABENE_CB_DID=did:web:your-custodian-b.sandbox.notabene.id:cb
NOTABENE_CB_WEBHOOK_SECRET=
```

#### Sumsub — KYC/KYB

```bash
SUMSUB_APP_TOKEN=               # App Token (sum-xxx)
SUMSUB_API_SECRET=              # API Secret Key
SUMSUB_WEBSDK_SECRET=           # WebSDK Access Token (different from API Secret)
WEBHOOK_SECRET=                 # Sumsub webhook signing secret
```

#### Elliptic — On-chain AML (optional)

```bash
ELLIPTIC_KEY=                   # API Key
ELLIPTIC_SECRET=                # API Secret
ELLIPTIC_ENDPOINT=aml-api.elliptic.co
ELLIPTIC_SIGN=HMAC-SHA256
```

#### Blockchain

```bash
SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com   # Default, usually no change needed
```

### 2. Settings Page | 设置页面

Visit **http://localhost:8000/settings** — the runtime configuration hub. The `.env` is for server bootstrap only; all frontend credentials flow through Settings (persisted to server-side JSON).

访问 **http://localhost:8000/settings** — 运行时配置中枢。`.env` 仅用于服务端引导，所有前端凭证通过 Settings 页面保存。

Settings has tabs for:
- **Sumsub** — App Token / API Secret / WebSDK Secret
- **Notabene** — Base URL, per-role webhook secrets, custody wallets, 4 role cards (apiKey/apiSecret/DID)
- **Elliptic AML** — API Key/Secret, risk scale legend, connection test

#### Custody Wallets | 托管钱包

The Notabene tab in Settings manages custody wallets:
- **Originating wallet** (Custodian A) and **Destination wallet** (Custodian B)
- Click **Generate** for a new wallet, or **Import** an existing private key
- Wallets persist in server-side `.wallets.json` — survive browser refresh
- Each wallet card shows balance and supports on-chain transfer

### 3. Public Reachability (Webhooks) | 公网可达性

Webhooks require a public HTTPS URL. Two options:

**Option A — Cloudflare Tunnel (built-in, for local dev) | 方式一：cloudflared 隧道（内置）**

1. Go to **Settings** → any tab with "Generate URL"
2. Click **Generate URL**, wait 5–10 seconds
3. Both webhook URLs auto-fill:
   - `https://<tunnel>/notabene/webhook` → Notabene console
   - `https://<tunnel>/sumsub/webhook` → Sumsub console
4. Paste these into the respective external dashboards

> ⚠️ trycloudflare temporary URLs change on each restart.
> trycloudflare 临时域名每次重启都会变。

**Option B — Your own public domain | 方式二：自有公网域名**

If deployed on a public server, manually enter in Settings:
- `https://your-domain/notabene/webhook`
- `https://your-domain/sumsub/webhook`

No cloudflared needed. More stable, URL doesn't change on restart.

### 4. External Dashboard Checklist | 外部后台配置清单

| Platform | Config | Value |
|----------|--------|-------|
| Notabene (4 workspaces) | Webhook URL | `https://<tunnel>/notabene/webhook` |
| Sumsub | Webhook URL | `https://<tunnel>/sumsub/webhook` |
| Sumsub | Webhook Secret | Must match `.env` / Settings |

---

## Pages | 页面导览

| Page | Path | Function |
|------|------|----------|
| **Onboard** | `/onboarding` | Sumsub WebSDK: personal KYC, corporate KYB, no-doc KYC |
| **Entity Screening** | `/screening` | AML name screening, risk rating, case details |
| **Tx/Addr Screening** | `/monitoring` | Address/transaction real-time screening and monitoring |
| **Travel Rule Transfer** | `/transfer` | Four-role collaborative transfer lifecycle |
| **Settings** | `/settings` | Credentials, wallets, webhooks, tunnel config hub |
| **VASP Directory** | `/network` | Notabene VASP directory lookup |

### Travel Rule Transfer Flow | 转账流程

```
Step 1  Connection Test     All 4 roles OAuth-verify Notabene network access
Step 2  Prepare             Select originator/beneficiary customers, validate PII (IVMS101)
        Travel Rule         VARA threshold: transfers ≥ 3,500 USD are subject to Travel Rule
        Threshold
Step 3  Create Transfer     Entity A initiates: amount (min 3,500), asset, beneficiary DID, agent chain
Step 4  Review & Authorize  Entity B reviews PII, verifies beneficiary name, authorizes/rejects
Step 5  On-chain Settlement Custodian broadcasts ERC-20 transfer, backfills txHash
Step 6  Match & Confirm     Entity B matches on-chain deposit via txMatch
```

```
Step 1  连接测试       四个角色分别 OAuth 验证 Notabene 网络连接
Step 2  准备           选择发起方/接收方客户，验证 PII (IVMS101)
        Travel Rule    VARA 阈值：金额 ≥ 3,500 USD 的转账需遵循 Travel Rule
        阈值
Step 3  创建转账       Entity A 发起：金额（最低 3,500）、资产、对方 DID、agent 链
Step 4  审核授权       Entity B 审核 PII、验证受益人姓名、授权/拒绝
Step 5  链上结算       Custodian 广播 ERC-20 转账，回填 txHash
Step 6  匹配确认       Entity B 通过 txMatch 匹配链上到账
```

Every status change triggers a Notabene webhook, displayed in real-time on the Settings webhook console.

每个状态变更都会通过 Notabene 触发 webhook，实时显示在 Settings 的 webhook 控制台。

---

## Data & Security | 数据与安全

- **No secrets in this repo**: All credentials injected via `.env` (local) and Settings page (browser + server JSON).
- `gitignored`: `.env`, `.wallets.json`, `.compliance-applicants.json`, `.webhooks.json`
- To redeploy: re-fill `.env` and import config in Settings.
- **本仓库不含任何密钥**：所有凭证通过 `.env`（本地）和 Settings 页面注入。
- 重新部署时只需重新填写 `.env` 并在 Settings 页面导入配置。

---

## FAQ | 常见问题

**Q: WebSDK link shows "Invalid successUrl"? / WebSDK 链接报错 "Invalid successUrl"？**
A: Sumsub rejects `localhost` as a callback. Generate a cloudflare tunnel URL first, then create the WebSDK link. / Sumsub 拒绝 `localhost` 回调。先生成隧道 URL，再创建 WebSDK 链接。

**Q: Notabene webhook shows `verified: false`? / Webhook 显示 `verified: false`？**
A: Each workspace has its own webhook secret. Fill in all 4 real secrets in Settings → Notabene → Webhook card. / 每个工作区有独立的 webhook secret。在 Settings → Notabene → Webhook 卡片填入 4 个真实 secret。

**Q: On-chain transfer fails "Sender has 0 ETH"? / 链上转账失败 "Sender has 0 ETH"？**
A: The originating wallet needs Sepolia ETH for gas. Fund it from a faucet first. / 发起方钱包需要 Sepolia ETH 支付 gas，先通过水龙头充值。

---

## Tech Stack | 技术栈

- **Backend**: Node.js + Express (API proxy, webhook receiver, wallet management)
- **Frontend**: Vanilla HTML/CSS/JS (no build step)
- **SDKs**: ethers v6 (on-chain), Sumsub WebSDK
- **Tunnel**: cloudflared

---

## License

MIT
