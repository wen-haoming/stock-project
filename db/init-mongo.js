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
db.stocks.createIndex({ symbol: 1 }, { unique: true });
db.stocks.createIndex({ updatedAt: -1 });
db.stocks.createIndex({ market: 1 });
db.stocks.createIndex({ changePct: -1 });

db.stock_history.createIndex({ symbol: 1, date: 1 }, { unique: true });
db.stock_history.createIndex({ date: -1 });

print('MongoDB initialization completed!');
