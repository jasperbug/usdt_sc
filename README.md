# USDT 抖內系統 v2.0 — 固定手續費流程

本專案提供「一訂單一地址」的 USDT 抖內整合、後端服務與測試工具，適用於 BNB Smart Chain 主網。

---

## 快速重點
- 每筆訂單都透過 `VaultFactory` 生成一個專屬 Vault 地址，觀眾只需匯款至該地址。
- 入帳金額需 **≥ 訂單金額 + 0.5 USDT** 才會被標記為成功（狀態 `PENDING`），OBS/TTS 可依此播報。
- `sweep()` 會將固定 0.5 USDT 匯給平台 (`feeTreasury`)，餘額匯給實況主金庫 (`treasury`)。
- 訂單超過 10 分鐘未收到足額款項則自動標記 `EXPIRED`；逾時入帳會被忽略。
- Factory 只需部署一次；新增實況主只要換後端設定中的收款/抽成地址即可。

---

## 錢包角色與責任
| 角色 | 說明 |
|------|------|
| 觀眾錢包 | 觀眾自行控制，僅負責將 USDT 匯入系統提供的 Vault 地址。**永遠不要提供私鑰給系統。** |
| Vault 合約 | 每筆訂單的臨時地址，只收款不簽名；等待 `vaultOwner` 呼叫 `sweep()`。 |
| Vault Owner (熱錢包) | 平台/實況主管控的錢包，負責 `deployVault` 與 `sweep()`。**`.env` 的 `DEPLOYER_PRIVATE_KEY` 必須是這把私鑰，不能填觀眾錢包。** |
| Treasury | 實況主金庫地址，收到扣除手續費後的金額；不需簽名。 |
| Fee Treasury | 平台抽成地址，固定收 0.5 USDT；不需簽名。 |

> 若要避免在伺服器保存私鑰，可導入自建簽名服務或雲端 KMS；觀眾始終不會碰觸任何私鑰。

---

## 合約與腳本

| 檔案 | 功能 |
|------|------|
| `contracts/Vault.sol` | 單筆訂單專用 Vault；`initialize(owner, treasury, feeTreasury, fee)` 一次性設定，`sweep(token)` 固定扣 0.5 USDT 再匯餘額。 |
| `contracts/VaultFactory.sol` | 建構時設定固定手續費（預設 0.5 USDT），呼叫 `deployVault(orderId, owner, treasury, feeTreasury)` 生成 Vault。 |
| `scripts/deployFactory.js` | 部署 Factory，必要時同時建立第一個 Vault（需提供 `FEE_AMOUNT/FEE_DECIMALS`）。 |
| `scripts/demoOrderFlow.js` | Hardhat 網路示範：部署 Factory → 建 Vault → 鑄幣 → sweep。 |
| `scripts/sendUsdt.js` / `scripts/sweepVault.js` / `scripts/checkTx.js` | 主網測試工具：轉帳 USDT、觸發 sweep、檢查交易事件。 |

Hardhat 測試：
```
npx hardhat test
```

Factory 部署（固定 0.5 USDT 手續費）：
```
FEE_AMOUNT=0.5 FEE_DECIMALS=18 \
  npx hardhat run scripts/deployFactory.js --network bsc
```

---

## 後端服務架構

目錄：`src/`

- `server.ts`：Express 主程式。啟動時：
  - 掛載 API：`POST /api/orders` 建立訂單、`GET /api/orders/:orderId` 查詢狀態。
  - 啟動三個服務：
    1. `DepositMonitor`：輪詢 USDT Transfer(to=vault) → 標記 `PENDING` / `UNDERPAID`。
    2. `SweeperService`：定期呼叫 `vault.sweep(USDT)` → 更新 `SWEPT`。
    3. `ExpiryService`：每 30 秒將 `CREATED/UNDERPAID` 且逾期 >10 分鐘的訂單標記 `EXPIRED`。
- `services/orderService.ts`：封裝訂單建立與狀態轉換邏輯。
- `blockchain.ts`：初始化 RPC Provider、Factory/Vault/USDT 合約實例，計算固定費與最低金額等常數。
- `prisma/schema.prisma`：SQLite `Donation` 表，紀錄 `orderId`、`vaultAddress`、`expectedAmount`、`minimumRequired`、`status`、`depositTx`、`sweepTx`、`expiresAt` 等資訊。

### 狀態機
```
CREATED  --(入帳達標)-->  PENDING  --(sweep 成功)-->  SWEPT
   |                              
   |--(入帳不足)--> UNDERPAID --(補款達標)--> PENDING
   |                              
   └--(逾期)----------------------------------> EXPIRED
```
入帳金額 ≥ 預期 + 0.5 → `PENDING`（視為抖內成功、觸發播報）。
入帳不足 → `UNDERPAID`（可提醒補款）。
逾期未付或補款 → `EXPIRED`。

---

## 環境設定 (`.env` 範例)

```ini
# 鏈路與錢包設定
BSC_RPC_URL=https://bsc-dataseed.binance.org/
DEPLOYER_PRIVATE_KEY=0x...        # 必須是 Vault Owner 熱錢包的私鑰（觀眾絕不能填）
FACTORY_ADDRESS=0x62648C5693dE5B04Ff78b39E2ae1eccc405F5334
USDT_ADDRESS=0x55d398326f99059fF775485246999027B3197955
VAULT_OWNER=0x08af4Aa3062dAD1b373200E2Fc9CcB46Cab5fd3a
TREASURY_ADDRESS=0x315ece6b7ea18ea207cfed077b0f332efe397cfc
FEE_TREASURY_ADDRESS=0x034169E956ED7BE0424a0B95B71ab20980B5E22c
USDT_TOKEN_DECIMALS=18
FIXED_FEE_USDT=0.5
MIN_DONATION_USDT=1
ORDER_EXPIRY_MINUTES=10
POLL_INTERVAL_MS=5000
SWEEP_INTERVAL_MS=30000
CHAIN_ID=56
DATABASE_URL="file:./dev.db"
```
> 若換新實況主，只需更新 `VAULT_OWNER`、`TREASURY_ADDRESS`、`FEE_TREASURY_ADDRESS`；Factory 無需重部署。

---

## 入門流程

1. **安裝依賴與編譯**
   ```bash
   npm install
   npx prisma migrate dev --name init
   npm run build
   ```

2. **部署（或確認）Factory**
   - 已有 Factory → 直接將位址寫入 `.env`。
   - 無 Factory → 執行 `deployFactory.js`，設定固定手續費後再更新 `.env`。

3. **啟動後端**
   ```bash
   npm run dev:server    # 開發模式（含監聽/sweep/逾期排程）
   # 或
   npm run build && npm start
   ```

4. **建立訂單（部署 Vault）**
   ```bash
   curl -X POST http://localhost:3001/api/orders \
     -H 'Content-Type: application/json' \
     -d '{"amount":"1.2","nickname":"Alice","message":"加油"}'
   ```
   回傳 JSON：包含 `orderId`、`vaultAddress`、`payment.token/to/value` 等資訊。

5. **觀眾匯款**
   - 金額 ≥ `amount + 0.5` USDT；可直接喚起錢包或使用 `scripts/sendUsdt.js`。

6. **查詢訂單**
   ```bash
   curl http://localhost:3001/api/orders/<orderId>
   ```
   - `PENDING`：抖內成功（可播報）。
   - `UNDERPAID`：金額不足，需要補款。
   - `EXPIRED`：逾期未付款／未補齊。

7. **Sweep 分帳**
   - 由排程或手動呼叫 `sweepVault.js`；成功後狀態轉為 `SWEPT`，並記錄交易哈希。

---

## 前端整合建議
- 後端回傳的 `payment` 欄位可直接用於錢包轉帳：`token` (USDT)、`to` (vaultAddress)、`value` (預期金額)。
- 播報條件：`GET /api/orders/:id` 看到 `status=PENDING` 即可顯示成功通知。
- `UNDERPAID` / `EXPIRED` 提醒使用者重新付款或補差額。

---

## 常見問題
1. **為什麼固定 0.5 USDT 手續費？** 覆蓋部署與 sweep 的 gas 成本，避免虧損。
2. **Factory 是否每筆訂單都要重部署？** 不需要。一次部署即可；每個 `orderId` 會產生新的 Vault。
3. **如何服務多個實況主？** `POST /api/orders` 時換成實況主自己的 `owner/treasury/feeTreasury`（可透過 `.env` 或 API 參數）。
4. **逾時匯款怎麼辦？** 後端會記錄但不變更狀態，保留給營運端決定是否退款或補開訂單。
5. **如何避免伺服器保存私鑰？** 導入自建簽名服務或雲端 KMS，讓私鑰只存在安全環境；觀眾從來不會觸碰私鑰。

