// MongoDB 初始化脚本
// 在容器首次启动时执行

// 切换到 stock_db 数据库
db = db.getSiblingDB('stock_db');

// 创建应用用户
db.createUser({
  user: 'stockuser',
  pwd: 'stockpass',
  roles: [
    {
      role: 'readWrite',
      db: 'stock_db'
    }
  ]
});

// 创建集合
db.createCollection('stocks');
db.createCollection('stock_history');

// 创建索引
// 基础索引
db.stocks.createIndex({ symbol: 1 }, { unique: true });
db.stocks.createIndex({ updatedAt: -1 });

// 单字段索引
db.stocks.createIndex({ market: 1 });
db.stocks.createIndex({ changePct: -1 });
db.stocks.createIndex({ totalMarketCap: 1 });
db.stocks.createIndex({ industry: 1 });

// 复合索引 - 加速常见的多条件查询
// 市场 + 市值范围 + 涨跌幅排序
db.stocks.createIndex({ market: 1, totalMarketCap: 1, changePct: -1 });
// 行业 + 市值范围 (用于行业筛选)
db.stocks.createIndex({ industry: 1, totalMarketCap: 1 });
// 市场 + 行业 + 涨跌幅 (组合筛选)
db.stocks.createIndex({ market: 1, industry: 1, changePct: -1 });

// 历史数据索引
db.stock_history.createIndex({ symbol: 1, date: 1 }, { unique: true });
db.stock_history.createIndex({ date: -1 });
db.stock_history.createIndex({ symbol: 1, date: -1 });

// K线数据集合和索引 (用于 range 查询优化)
db.createCollection('stock_klines');
// 复合唯一索引：symbol + date
db.stock_klines.createIndex({ symbol: 1, date: 1 }, { unique: true });
// 关键优化索引：date + symbol + close (覆盖索引，加速聚合查询)
db.stock_klines.createIndex({ date: 1, symbol: 1, close: 1 });
// 日期索引（用于范围查询）
db.stock_klines.createIndex({ date: 1 });

// Range 缓存集合和索引
db.createCollection('range_cache');
db.range_cache.createIndex({ cacheKey: 1 }, { unique: true });
db.range_cache.createIndex({ updatedAt: -1 });

print('MongoDB initialization completed!');
