# LongPort API 集成文档

本文档说明如何将项目从东方财富API迁移到 LongPort OpenAPI。

## 🎯 重构目标

将股票行情系统的数据源从**东方财富API**切换到 **LongPort OpenAPI**，同时保持向后兼容。

## 📦 已完成的工作

### 后端改动

#### 1. 安装 LongPort SDK
```bash
cd server
go get github.com/longportapp/openapi-go@latest
go mod tidy
```

#### 2. 配置更新 (`server/config/config.go`)
新增 `LongPortConfig` 结构体：
```go
type LongPortConfig struct {
    AppKey      string
    AppSecret   string
    AccessToken string
    Region      string // cn, sg, hk
    Enabled     bool
}
```

环境变量配置：
- `LONGPORT_APP_KEY` - API Key
- `LONGPORT_APP_SECRET` - API Secret  
- `LONGPORT_ACCESS_TOKEN` - Access Token
- `LONGPORT_REGION` - 区域（cn/sg/hk）

#### 3. 新增服务 (`server/services/longport_service.go`)
提供完整的 LongPort API 封装：

| 方法 | 功能 |
|------|------|
| `GetQuote()` | 获取实时行情 |
| `GetStaticInfo()` | 获取股票基本信息 |
| `GetCandlesticks()` | 获取K线数据 |
| `GetHistoryCandlesticksByDate()` | 按日期获取历史K线 |
| `GetDepth()` | 获取深度行情（五档盘口） |
| `GetIntraday()` | 获取分时数据 |
| `GetCapitalFlow()` | 获取资金流向 |
| `GetCapitalDistribution()` | 获取资金分布 |
| `GetMarketTradingSession()` | 获取市场交易时段 |
| `GetTradingDays()` | 获取交易日历 |
| `SubscribeQuote()` | 订阅实时行情推送 |

#### 4. 新增 Controller (`server/controllers/longport_controller.go`)
提供 RESTful API 接口：

| 路由 | 说明 |
|------|------|
| `GET /api/v1/lp/status` | 检查 LongPort API 状态 |
| `GET /api/v1/lp/quote` | 获取实时行情 |
| `GET /api/v1/lp/static` | 获取股票基本信息 |
| `GET /api/v1/lp/kline` | 获取K线数据 |
| `GET /api/v1/lp/history-kline` | 获取历史K线（按日期范围） |
| `GET /api/v1/lp/depth` | 获取深度行情 |
| `GET /api/v1/lp/intraday` | 获取分时数据 |
| `GET /api/v1/lp/capital-flow` | 获取资金流向 |
| `GET /api/v1/lp/capital-distribution` | 获取资金分布 |
| `GET /api/v1/lp/trading-session` | 获取交易时段 |
| `GET /api/v1/lp/trading-days` | 获取交易日历 |
| `GET /api/v1/lp/subscribe-info` | 获取订阅信息 |

---

### 前端改动

#### 1. 新增 LongPort API 服务 (`web/src/api/longport.ts`)
提供前端调用 LongPort API 的方法：
- `checkLongPortStatus()` - 检查API可用性
- `fetchLPQuote()` - 获取实时行情
- `fetchLPKline()` - 获取K线
- `fetchLPIntraday()` - 获取分时数据
- `fetchLPDepth()` - 获取盘口数据
- `getLongPortSymbol()` - 股票代码转换工具

#### 2. 新增数据源适配器 (`web/src/utils/dataSourceAdapter.ts`)
**核心功能**：自动在 LongPort 和东方财富之间切换数据源。

主要方法：
- `isLongPortAvailable()` - 检查 LongPort 是否可用（带缓存）
- `fetchKlineData()` - 获取K线（自动选择数据源）
- `fetchTrendData()` - 获取分时（自动选择数据源）
- `fetchQuoteData()` - 获取实时行情（自动选择数据源）
- `fetchDepthData()` - 获取盘口数据（自动选择数据源）
- `getCurrentDataSource()` - 获取当前数据源类型

**工作原理**：
1. 首次调用时检查 LongPort API 是否可用
2. 如果可用，优先使用 LongPort
3. 如果不可用或调用失败，自动回退到东方财富
4. 检查结果缓存5分钟，避免频繁请求

#### 3. 更新页面组件

**已更新的文件**：
- ✅ `pages/range-stats/StockDetail.tsx` - 股票详情页
- ✅ `pages/range-stats/DetailMobilePage.tsx` - 移动端详情页
- ✅ `pages/watchlist/index.tsx` - 自选股页面

**改动内容**：
```typescript
// 旧代码
import { fetchStockKline, fetchStockTrend } from '@/api/stock'
const kline = await fetchStockKline(symbol, market, months, period)

// 新代码
import { fetchKlineData, fetchTrendData } from '@/utils/dataSourceAdapter'
const kline = await fetchKlineData(symbol, market, period, count)
```

#### 4. 新增数据源状态组件 (`web/src/components/DataSourceBadge.tsx`)
显示当前使用的数据源：
- 🔵 **LongPort** - 专业级行情数据
- ⚪ **东方财富** - 基础行情数据

**使用方式**：
```tsx
import { DataSourceBadge } from '@/components/DataSourceBadge'

<DataSourceBadge showIcon={false} style={{ fontSize: 11 }} />
```

---

## 🚀 使用指南

### 1. 配置 LongPort API

#### 方式一：环境变量（推荐）
```bash
# 创建 .env 文件
cd server
cp .env.example .env

# 编辑 .env，填入你的 LongPort 凭证
LONGPORT_APP_KEY=your_app_key_here
LONGPORT_APP_SECRET=your_app_secret_here
LONGPORT_ACCESS_TOKEN=your_access_token_here
LONGPORT_REGION=cn
```

#### 方式二：直接修改代码
在 `server/config/config.go` 中硬编码（不推荐）。

### 2. 获取 LongPort API 凭证

1. 访问 [LongPort 开放平台](https://open.longportapp.com/)
2. 注册并创建应用
3. 获取以下凭证：
   - **App Key** - 应用标识
   - **App Secret** - 应用密钥
   - **Access Token** - 访问令牌

### 3. 重启服务

```bash
# 后端
cd server
go build -o tmp/main .
./tmp/main

# 前端（开发模式）
cd web
npm run dev
```

### 4. 验证配置

访问后端API检查状态：
```bash
curl http://localhost:8080/api/v1/lp/status
```

返回示例：
```json
{
  "available": true,
  "message": "LongPort API is ready"
}
```

---

## 📊 数据源对比

| 功能 | LongPort | 东方财富 |
|------|----------|----------|
| **A股行情** | ✅ 支持 | ✅ 支持 |
| **港股行情** | ✅ 实时 | ⚠️ 延迟 |
| **美股行情** | ✅ 实时 | ⚠️ 延迟 |
| **K线数据** | ✅ 全周期 | ✅ 全周期 |
| **分时数据** | ✅ 实时 | ✅ 实时 |
| **深度行情** | ✅ 五档 | ❌ 不支持 |
| **资金流向** | ✅ 支持 | ❌ 需爬虫 |
| **订阅推送** | ✅ WebSocket | ❌ 不支持 |
| **API稳定性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **数据准确性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **费用** | 💰 付费 | 🆓 免费 |

---

## 🔄 数据流程

### 请求流程
```
用户操作
  ↓
前端组件
  ↓
dataSourceAdapter（数据源适配器）
  ↓
  ├─ LongPort API 可用？
  │    ↓ 是
  │    ├─ /api/v1/lp/*（后端代理）
  │    │    ↓
  │    │ LongPort OpenAPI
  │    │    ↓
  │    └─ 返回数据
  │
  └─ 否或失败
       ↓
    东方财富 API（直接调用）
       ↓
    返回数据
```

### 缓存机制
- **LongPort 可用性检查**：缓存 5 分钟
- **K线数据**：后端缓存 60 秒
- **实时行情**：交易时段缓存 5 秒，非交易时段 1 小时

---

## 🐛 故障排查

### 问题1：LongPort API 不可用
**症状**：页面显示"东方财富"数据源

**排查步骤**：
1. 检查环境变量是否配置
   ```bash
   echo $LONGPORT_APP_KEY
   ```
2. 检查后端日志
   ```bash
   curl http://localhost:8080/api/v1/lp/status
   ```
3. 验证凭证是否正确
4. 检查网络连接

### 问题2：数据格式错误
**症状**：K线图无法显示

**原因**：LongPort 和东方财富的数据格式不同

**解决**：使用 `convertLPKlineToCommon()` 转换数据格式

### 问题3：股票代码格式错误
**症状**：无法获取港股/美股数据

**原因**：LongPort 需要特定格式的股票代码
- A股：`600000.SH` / `000001.SZ`
- 港股：`00700.HK`
- 美股：`AAPL.US`

**解决**：使用 `getLongPortSymbol()` 转换代码

---

## 📝 API 调用示例

### 获取实时行情
```bash
curl "http://localhost:8080/api/v1/lp/quote?symbols=700.HK,AAPL.US,600000.SH"
```

### 获取K线数据
```bash
# 获取腾讯最近100天的日K
curl "http://localhost:8080/api/v1/lp/kline?symbol=700.HK&period=day&count=100"

# 获取苹果2024年全年日K
curl "http://localhost:8080/api/v1/lp/history-kline?symbol=AAPL.US&start=2024-01-01&end=2024-12-31&period=day"
```

### 获取分时数据
```bash
curl "http://localhost:8080/api/v1/lp/intraday?symbol=600000.SH"
```

### 获取盘口数据
```bash
curl "http://localhost:8080/api/v1/lp/depth?symbol=700.HK"
```

---

## 🔮 未来计划

- [ ] 添加 WebSocket 实时推送
- [ ] 支持更多技术指标
- [ ] 添加财报数据（LongPort API）
- [ ] 支持期权数据
- [ ] 添加回测功能
- [ ] 优化数据缓存策略

---

## 📚 相关文档

- [LongPort OpenAPI 文档](https://open.longportapp.com/docs)
- [LongPort Go SDK](https://github.com/longportapp/openapi-go)
- [项目主 README](./README.md)

---

## ⚠️ 注意事项

1. **API 限流**：LongPort API 有请求频率限制，请注意控制请求频率
2. **成本考虑**：LongPort 是付费服务，请评估成本
3. **数据兼容**：新旧数据源的字段可能不完全一致，注意适配
4. **错误处理**：务必处理好 API 调用失败的情况
5. **测试充分**：上生产前请充分测试各种场景

---

## 📧 联系方式

如有问题，请提交 Issue 或联系开发团队。
