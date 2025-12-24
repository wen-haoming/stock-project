# 股票范围数据接口优化总结

## 问题分析

之前 `/api/v1/stock/range` 接口返回 `data: null` 的原因主要有两个：

1. **市值筛选过于严格**
   - 你传入的参数：`min_market_cap=2000&max_market_cap=10000`（指2000-10000亿）
   - 换算后的条件：需要市值在 200,000,000,000 - 1,000,000,000,000 元之间
   - 港股中满足此条件的股票极少（通常只有大盘股），导致筛选后数据为空

2. **数据库连接检查不够完整**
   - 原代码只检查 `db.Client != nil && db.Database != nil`
   - 没有真正验证连接是否有效，可能导致缓存保存失败

## 解决方案

### 1. 添加数据库连接健康检查
**文件：** `server/db/mongodb.go`

新增 `IsConnected()` 函数，真正验证数据库连接状态：
```go
func IsConnected() bool {
	if Client == nil || Database == nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := Client.Ping(ctx, nil); err != nil {
		log.Printf("Database ping failed: %v", err)
		return false
	}
	return true
}
```

### 2. 改进GetRangeData连接检查
**文件：** `server/stock/get_range_data.go`

使用新的 `db.IsConnected()` 替代原来的简单nil检查，确保数据库连接真的有效。

### 3. 新增主动刷新接口
**新增端点：** `POST /api/v1/stock/range/refresh`

用法：
```bash
curl -X POST "http://localhost:8080/api/v1/stock/range/refresh?start_date=20231229&end_date=20251222"
```

这个接口会：
- 从易方数据API获取全网港股数据
- 并发获取每只股票的K线数据
- 计算指定时间段的涨幅
- **直接保存到MongoDB缓存**
- 返回详细的处理结果（成功/失败数量）

响应示例：
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

## 使用流程

### 第一次使用（推荐流程）

1. **先主动刷新数据到数据库：**
   ```bash
   curl -X POST "http://localhost:8080/api/v1/stock/range/refresh?start_date=20231229&end_date=20251222"
   ```
   
   这会：
   - 获取所有港股列表
   - 并发获取K线数据
   - 保存到MongoDB的 `range_cache` 集合

2. **然后查询数据：**
   ```bash
   curl "http://localhost:8080/api/v1/stock/range?start_date=20231229&end_date=20251222&min_change_pct=60&min_market_cap=100&max_market_cap=5000"
   ```
   
   这会直接从缓存读取，速度很快。

### 后续使用

- 第一次查询：从缓存读取（1小时内有效）
- 超过1小时后：自动从API重新获取
- 需要强制更新：加参数 `refresh=true`

## 参数说明

### GET /api/v1/stock/range

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| start_date | string | 开始日期 YYYYMMDD | 20231229 |
| end_date | string | 结束日期 YYYYMMDD | 20251222 |
| min_change_pct | float | 最小涨幅% | 60 |
| min_market_cap | float | 最小市值(亿元) | 100 |
| max_market_cap | float | 最大市值(亿元) | 5000 |
| industry | string | 行业名称 | 互联网 |
| refresh | boolean | 强制刷新缓存 | false |

### POST /api/v1/stock/range/refresh

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| start_date | string | 开始日期 YYYYMMDD | 20231229 |
| end_date | string | 结束日期 YYYYMMDD | 20251222 |

## 市值范围建议

根据港股实际市值分布：

| 范围 | 说明 | 建议参数 |
|------|------|---------|
| 超大盘 | > 10000亿 | min: 10000, max: 0(无限) |
| 大盘 | 1000-10000亿 | min: 1000, max: 10000 |
| 中盘 | 100-1000亿 | min: 100, max: 1000 |
| 小盘 | 10-100亿 | min: 10, max: 100 |
| 微盘 | < 10亿 | min: 0, max: 10 |

你之前的参数 `min: 2000, max: 10000` 只会返回少数大盘股，建议改为 `min: 100, max: 5000` 或 `min: 0, max: 1000`。

## 数据库相关

### 集合结构

**range_cache 集合：**
```javascript
{
  "cacheKey": "20231229_20251222",
  "startDate": "20231229",
  "endDate": "20251222",
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
  "updatedAt": "2025-12-24T13:00:00Z"
}
```

### 缓存有效期

- 缓存有效期：**1小时**
- 超过1小时自动重新从API获取
- 可通过 `refresh=true` 参数强制更新

