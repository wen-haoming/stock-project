# 数据库优化方案 - 先存后查

## 核心改进

你提出的"先请求全网数据存到库里，然后再请求库获取数据"的思路已经实现！

### ✅ 改进内容

1. **数据库连接健康检查** (`server/db/mongodb.go`)
   - 新增 `IsConnected()` 函数，真实验证数据库连接
   - 替代原来简单的 nil 检查
   - 确保缓存操作在连接有效时进行

2. **改进GetRangeData逻辑** (`server/stock/get_range_data.go`)
   - 使用 `db.IsConnected()` 进行连接检查
   - 更可靠的缓存保存机制
   - 完整的日志记录

3. **新增主动刷新接口** 
   - `POST /api/v1/stock/range/refresh` 
   - **这是关键** - 可以主动触发数据获取并存储到数据库

4. **改进主路由** (`server/main.go`)
   - 添加新的刷新端点

## 🚀 快速开始

### 方法 1：使用测试脚本（推荐）

```bash
cd /workspaces/stock-project
chmod +x test_range_api.sh
./test_range_api.sh
```

### 方法 2：手动命令

```bash
# 第一步：启动服务器
cd /workspaces/stock-project/server
go run main.go

# 第二步：在另一个终端，主动刷新数据到数据库
curl -X POST "http://localhost:8080/api/v1/stock/range/refresh?start_date=20231229&end_date=20251222"

# 第三步：查询缓存中的数据（从数据库读取，非常快）
curl "http://localhost:8080/api/v1/stock/range?start_date=20231229&end_date=20251222&min_change_pct=60&min_market_cap=100&max_market_cap=5000"
```

## 📋 API 使用说明

### 1. 刷新数据到数据库（先做这个）

**端点：** `POST /api/v1/stock/range/refresh`

**请求：**
```bash
curl -X POST "http://localhost:8080/api/v1/stock/range/refresh?start_date=20231229&end_date=20251222"
```

**响应：**
```json
{
  "message": "Range data refreshed successfully",
  "count": 3500,
  "success": 3400,
  "failed": 100,
  "start_date": "20231229",
  "end_date": "20251222"
}
```

**说明：**
- 这个接口会从易方数据API获取所有港股
- 并发获取每只股票的K线数据
- 计算指定时间段的涨幅
- **直接存储到MongoDB中的 `range_cache` 集合**
- 耗时约 30-60 秒（取决于网络和数据量）

---

### 2. 查询缓存中的数据（再做这个）

**端点：** `GET /api/v1/stock/range`

**请求示例：**
```bash
# 基础查询
curl "http://localhost:8080/api/v1/stock/range?start_date=20231229&end_date=20251222"

# 加上筛选条件
curl "http://localhost:8080/api/v1/stock/range?start_date=20231229&end_date=20251222&min_change_pct=60&min_market_cap=100&max_market_cap=5000"

# 强制刷新缓存
curl "http://localhost:8080/api/v1/stock/range?start_date=20231229&end_date=20251222&refresh=true"
```

**参数说明：**

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| start_date | string | 开始日期 YYYYMMDD | 20231229 |
| end_date | string | 结束日期 YYYYMMDD | 20251222 |
| min_change_pct | float | 最小涨幅 % | 60 |
| min_market_cap | float | 最小市值 亿元 | 100 |
| max_market_cap | float | 最大市值 亿元 | 5000 |
| industry | string | 行业筛选 | 互联网 |
| refresh | string | 强制刷新缓存 | true |

**响应示例：**
```json
{
  "data": [
    {
      "symbol": "00700",
      "name": "腾讯控股",
      "startPrice": 100.5,
      "endPrice": 180.2,
      "changePct": 79.20,
      "latestPrice": 180.2,
      "totalMarketCap": 16800000000000,
      "circMarketCap": 14000000000000,
      "peRatio": 25.5,
      "pbRatio": 3.2,
      "turnoverRate": 0.8,
      "industry": "互联网"
    }
  ],
  "total": 1,
  "industryStats": [
    {
      "name": "互联网",
      "count": 1
    }
  ],
  "cached": true,
  "fromDB": false
}
```

## 💡 工作原理

### 流程图

```
第一次请求
├─ 主动调用 POST /api/v1/stock/range/refresh
│  ├─ 获取港股列表
│  ├─ 并发获取K线数据
│  ├─ 计算涨幅
│  └─ 保存到 MongoDB range_cache 集合
│
第一次查询
├─ 调用 GET /api/v1/stock/range
├─ 检查 range_cache 中是否有缓存
├─ ✅ 缓存命中 → 直接返回（非常快）
└─ ❌ 缓存过期或不存在 → 自动从API重新获取

后续查询（1小时内）
└─ 直接从缓存返回（毫秒级响应）
```

### 缓存策略

- **有效期：** 1 小时
- **过期后：** 自动从API重新获取
- **强制更新：** 加 `refresh=true` 参数

## 🔍 调试和监控

### 查看数据库状态

```bash
curl "http://localhost:8080/api/v1/db/status"
```

**响应：**
```json
{
  "lastUpdate": "2025-12-24T13:00:00Z",
  "isTradingTime": true,
  "isTradingDay": true,
  "klineCount": 50000
}
```

### 查看MongoDB中的缓存数据

```bash
# 进入MongoDB
docker exec -it stock-mongodb mongosh

# 切换数据库
use stock_db

# 查看range_cache集合
db.range_cache.find().limit(1).pretty()

# 查看缓存统计
db.range_cache.stats()
```

## ⚠️ 常见问题

### 1. 为什么第一次查询返回 null？

**原因：** 缓存中没有数据，需要先从API获取

**解决方案：** 先调用刷新接口
```bash
curl -X POST "http://localhost:8080/api/v1/stock/range/refresh?start_date=20231229&end_date=20251222"
```

### 2. 为什么返回的数据很少？

**原因：** 可能是市值范围筛选过于严格

**建议的参数范围：**
```bash
# 小盘股（推荐新手）
min_market_cap=10&max_market_cap=100

# 中盘股（推荐）
min_market_cap=100&max_market_cap=1000

# 大盘股
min_market_cap=1000&max_market_cap=10000
```

### 3. 刷新速度慢吗？

**正常的耗时：** 30-60 秒

**为什么慢：**
- 需要获取几千只港股的列表
- 需要并发获取每只股票的K线数据
- 网络请求涉及外部API

**优化方式：**
- 大部分时间是等待缓存有效期（1小时）
- 只需第一次主动刷新，之后都是秒级查询

## 📊 性能对比

| 操作 | 耗时 | 说明 |
|------|------|------|
| 第一次刷新到数据库 | 30-60秒 | 一次性，并发获取所有数据 |
| 第二次及以后查询 | <100ms | 从MongoDB缓存直接读取 |
| 缓存过期后重新刷新 | 30-60秒 | 1小时后自动触发 |

## 文件修改说明

### 修改的文件

1. **server/db/mongodb.go**
   - 新增 `IsConnected()` 函数

2. **server/stock/get_range_data.go**
   - 改进数据库连接检查
   - 新增 `RefreshRangeData()` 函数

3. **server/main.go**
   - 添加 `POST /api/v1/stock/range/refresh` 路由

### 新增的文件

1. **test_range_api.sh** - 完整的测试脚本
2. **BUGFIX_SUMMARY.md** - 问题分析和解决方案

## 🎯 下一步

1. ✅ 启动服务器
2. ✅ 执行 `./test_range_api.sh` 进行测试
3. ✅ 查看 MongoDB 中的缓存数据
4. ✅ 根据实际需求调整参数

祝测试顺利！🚀

