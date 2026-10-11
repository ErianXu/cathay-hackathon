# AI 貴賓室行程助理｜客戶端原型

線上版本：[GitHub Pages](https://ray1886.github.io/cathay-hackathon/)。也可以直接用瀏覽器開啟 `index.html`。專案不需要安裝套件。

可操作內容：

- 輸入自然語言需求或點選活動標籤，再產生示範行程。
- 在支援 Web Speech API 的瀏覽器選擇普通話、廣東話或國語（繁體），點擊麥克風說話後自動產生行程。若瀏覽器不提供語音辨識，畫面會說明原因，可改用裝置聽寫或文字輸入。
- 可識別「吃饭」「吃飯」「食飯」「食嘢」等常見用餐說法；無法排入的活動會明確顯示原因。
- 新增、編輯、刪除活動；編輯時檢查時間重疊及登機前可用時段。
- 把「待確認」服務改為「已確認」，並在瀏覽器本機保存行程。

目前使用固定示範航班 CX418、19:40 起飛、G25 登機口，排程由前端規則模擬。正式產品需接入大語言模型、即時航班與登機口資料、貴賓室可用時段及真實預約服務。原型內的「確認預約」只更新畫面狀態，不會送出實際預約。

`client-ui-concept.png` 是靜態視覺概念稿；`index.html` 是可操作原型。

語音辨識依賴使用者瀏覽器提供的引擎、麥克風權限及網絡服務；純靜態的 GitHub Pages 無法自行提供跨瀏覽器的語音轉文字後端。

## 本地预约数据库与候补模块

后端模块独立于现有页面。使用 **Node.js 24.15.0 或更高的24.x版本**及内置 `node:sqlite`，没有 npm 依赖，无需 `npm install`。`node:sqlite` 在该版本范围属于 release candidate；这里用于本地比赛原型。

```sh
node database/seed.js
node backend/demo-server.js
```

API 默认仅监听 `http://127.0.0.1:4174`，数据库保存在 `data/lounge-demo.sqlite`。再次初始化不会重置已有预约。服务设施、会员资格、容量及时段均为虚构演示数据，不代表国泰真实规则。

```sh
node --test tests/*.test.js
node scripts/reservation-demo.js
```

自动测试与端到端演示使用临时数据库。演示会真实预约最后一个按摩时段、候补、取消、发出并接受空位邀请，最后重新启动独立服务器进程验证预约持久化。

参阅[安装与 Windows 启动说明](docs/reservations/README.md)、[数据库结构与状态](docs/reservations/schema.md)、[HTTP API](docs/reservations/api.md)、[前端与 Agent 接入合同](docs/reservations/integration.md)。本阶段没有修改 `app.js`、`index.html`、样式、聊天或 Agent 行为，也没有挂载到主服务器；现有页面上的预约确认仍是 localStorage 模拟。
