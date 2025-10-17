# USDT 抖內系統 v2.0 — 固定手續費流程

本專案提供「一訂單一地址」的 USDT 抖內整合、後端服務與測試工具，適用於 BNB Smart Chain 主網。

---

## 快速重點
- 每筆訂單都透過 `VaultFactory` 生成一個專屬 Vault 地址，觀眾只需匯款至該地址。
- 入帳金額需 **≥ 訂單金額** 才會被標記為成功（狀態 `PENDING`），0.5 USDT 手續費會從該筆金額內扣除。
- `sweep()` 會將固定 0.5 USDT 匯給平台 (`feeTreasury`)，餘額匯給實況主金庫 (`treasury`)。
- 訂單超過 10 分鐘未收到足額款項則自動標記 `EXPIRED`；逾時入帳會被忽略。
- Factory 只需部署一次；新增實況主只要換後端設定中的收款/抽成地址即可。
- 推薦使用 **Ankr Premium/Pay-as-you-go RPC**（已於預設程式碼整合）。只需在 `.env` 更新 HTTP endpoint；若之後開通 WSS，可選填 `BSC_WS_URL` 取得更即時的監控能力。

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
    1. `DepositMonitor`：透過 RPC 拉取 USDT Transfer (to=vault) → 標記 `PENDING` / `UNDERPAID`。預設走 `.env` 的 `BSC_RPC_URL`；若填入 `BSC_WS_URL`，可在後續升級為事件訂閱。
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
入帳金額 ≥ 預期金額 → `PENDING`（視為抖內成功、觸發播報，並從中扣除 0.5 USDT 手續費）。
入帳不足 → `UNDERPAID`（可提醒補款或退款）。
逾期未付或補款 → `EXPIRED`。

---

## 環境設定 (`.env` 範例)

```ini
# 鏈路與錢包設定
BSC_RPC_URL=https://rpc.ankr.com/bsc/<YOUR_KEY>
# 若已開通 WSS 權限可選填，否則留空即可
# BSC_WS_URL=wss://rpc.ankr.com/bsc_ws/<YOUR_KEY>
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
LOG_MAX_BLOCK_SPAN=2000
LOG_MAX_ADDRESS_BATCH=50
LOG_RATE_LIMIT_INITIAL_BACKOFF_MS=2000
LOG_RATE_LIMIT_MAX_BACKOFF_MS=60000
DATABASE_URL="file:./dev.db"
```
> 若換新實況主，只需更新 `VAULT_OWNER`、`TREASURY_ADDRESS`、`FEE_TREASURY_ADDRESS`；Factory 無需重部署。

### Ankr 使用說明
- **Pay-as-you-go** 起跳 10 USD 就能啟用，對應 BSC Premium Endpoint 的基礎費率為 $0.0005 / 1,000 RPC；換算每筆抖內（3 次 RPC 內）成本不到 $0.000002。
- 建議先設定 `BSC_RPC_URL` 使用 HTTPS endpoint。等到帳號開通 WSS 後再回填 `BSC_WS_URL`，即可改為事件訂閱。
- 若啟用 IP 白名單，記得將正式環境的 Public IP 加入 Ankr Dashboard，否則請求會得到 403。
- 運營期間可搭配 `LOG_MAX_BLOCK_SPAN` / `LOG_MAX_ADDRESS_BATCH` 動態調整輪詢大小，或改由 WSS 推播降低 RPC 壓力。

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
   - 建議金額 = 訂單金額（系統會自動在 sweep 時扣除 0.5 USDT）。若觀眾多匯，餘額同樣會由 sweep 匯給實況主。

6. **查詢訂單**
   ```bash
   curl http://localhost:3001/api/orders/<orderId>
   ```
   - `PENDING`：抖內成功（可播報）。
   - `UNDERPAID`：金額不足，需要補款。
   - `EXPIRED`：逾期未付款／未補齊。

7. **Sweep 分帳**
   - 由排程或手動呼叫 `sweepVault.js`；成功後狀態轉為 `SWEPT`，並記錄交易哈希。
   - 若遇到 RPC 限流導致狀態無法自動更新，可使用：
     ```bash
     VAULT_ADDRESS=<vault>
     USDT_ADDRESS=<usdt>
     npx hardhat run scripts/sweepVault.js --network bsc
     ```
     手動完成分帳後，`GET /api/orders/:id` 會顯示 `SWEPT` 與 `sweepTx`。

---

## 運營與監控建議
- **調整輪詢參數**：`LOG_MAX_BLOCK_SPAN` 和 `LOG_MAX_ADDRESS_BATCH` 可依當前活躍訂單數與 RPC 配額調整；當發生 429 或 -32005 錯誤時，可先降低這兩個值。
- **升級 WebSocket**：在 `.env` 填入 `BSC_WS_URL` 後，可將 `DepositMonitor` 改為 `wsProvider.on('logs')` 監聽 Transfer 事件，達到秒級播報。
- **對帳流程**：建議每日/每周使用 Ankr Advanced APIs（`ankr_getTransfersByAddress`）或 Covalent 等服務做補帳，確保沒有漏掉的捐款。

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
