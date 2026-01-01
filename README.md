# 股票数据分析系统

一个基于 Go + React + MongoDB 的股票数据分析平台，支持 A 股和港股实时数据查询。

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户浏览器                               │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Nginx (端口 3000)                          │
│                   静态资源 + API 反向代理                        │
└─────────────────────────────┬───────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────────┐
│    React 前端 (web/)    │     │      Go 后端 (server/)          │
│                         │     │                                 │
│  • Ant Design UI        │     │  • Gin Web 框架                 │
│  • ECharts 图表         │     │  • 定时任务调度器                │
│  • Axios HTTP           │     │  • 数据缓存层                   │
└─────────────────────────┘     └───────────────┬─────────────────┘
                                                │
                        ┌───────────────────────┴────────────────┐
                        │                                        │
                        ▼                                        ▼
          ┌─────────────────────────┐          ┌─────────────────────────┐
          │   MongoDB (端口 27017)  │          │    东方财富 API          │
          │                         │          │                         │
          │  • stocks 实时数据      │          │  • A股数据               │
          │  • stock_history 历史   │          │  • 港股数据              │
          └─────────────────────────┘          └─────────────────────────┘
```

## 目录结构

```
stock-project/
├── server/                    # Go 后端服务
│   ├── main.go               # 入口文件
│   ├── db/                   # 数据库模块
│   │   ├── mongodb.go        # MongoDB 连接管理
│   │   ├── models.go         # 数据模型定义
│   │   ├── repository.go     # 数据访问层
│   │   └── cache.go          # 缓存逻辑
│   ├── scheduler/            # 定时任务
│   │   └── scheduler.go      # 数据同步调度器
│   ├── stock/                # 股票业务逻辑
│   │   ├── service.go        # 服务层
│   │   ├── get_all_data.go   # 港股数据接口
│   │   ├── get_stock_detail.go # 详细数据接口
│   │   └── ...
│   ├── Dockerfile
│   ├── Makefile
│   └── go.mod
│
├── web/                       # React 前端
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── pages/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
│
├── db/                        # 数据库初始化
│   └── init-mongo.js         # MongoDB 初始化脚本
│
├── docker-compose.yml         # 生产环境部署
├── docker-compose.dev.yml     # 开发环境
├── nginx.conf                 # Nginx 配置
└── .env.example              # 环境变量示例
```

## 核心功能

### 数据缓存策略
- **交易时间内**：缓存 5 分钟，保证数据实时性
- **非交易时间**：缓存 1 小时，减少 API 调用

### 定时任务
- 服务启动时立即同步一次数据
- 交易日交易时间内每 5 分钟自动同步
- A 股交易时间：9:30-11:30, 13:00-15:00
- 港股交易时间：9:30-12:00, 13:00-16:00

### API 接口
| 接口 | 说明 |
|------|------|
| GET /api/v1/stock/all | 获取港股列表 |
| GET /api/v1/stock/detail | 获取详细数据（含技术指标） |
| GET /api/v1/stock/range | 区间涨幅统计 |
| GET /api/v1/db/status | 数据库状态 |
| POST /api/v1/db/sync | 手动触发同步 |

## 本地开发

### 环境要求
- Go 1.23+
- Node.js 20+
- pnpm
- Docker

### 启动步骤

```bash
# 1. 启动 MongoDB
docker compose -f docker-compose.dev.yml up -d

# 2. 启动后端（终端 1）
cd server
go run .

# 3. 启动前端（终端 2）
cd web
pnpm install
pnpm dev
```

### 访问地址
- 前端：http://localhost:5173
- 后端：http://localhost:8080
- MongoDB：localhost:27017

### 常用命令

# 启动 MongoDB
cd /Users/wenhaoming/Desktop/stock-project
docker compose -f docker-compose.dev.yml up -d

# 启动后端（终端1）
cd server && go run .

# 启动前端（终端2）
cd web && pnpm dev

# 停止 MongoDB
docker compose -f docker-compose.dev.yml down


## 生产部署

### 使用 Docker Compose

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env 修改密码

# 2. 构建并启动
docker compose up -d --build

# 3. 查看日志
docker compose logs -f
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| MONGO_ROOT_USER | MongoDB root 用户 | admin |
| MONGO_ROOT_PASSWORD | MongoDB root 密码 | admin123 |
| MONGO_USER | 应用数据库用户 | stockuser |
| MONGO_PASSWORD | 应用数据库密码 | stockpass |
| MONGODB_URI | 连接字符串 | mongodb://localhost:27017 |
| MONGODB_DATABASE | 数据库名 | stock_db |
| GIN_MODE | Gin 运行模式 | release |

### 服务端口
- 3000: Web 前端
- 8080: API 服务
- 27017: MongoDB

## 数据流程

```
1. 用户请求 → 2. 检查缓存 → 3a. 缓存有效 → 返回数据
                    ↓
               3b. 缓存失效 → 4. 调用东方财富 API
                                    ↓
                              5. 存入 MongoDB
                                    ↓
                              6. 返回数据

定时任务：
交易时间 → 每5分钟 → 拉取全量数据 → 更新 MongoDB
```

## 技术栈

**后端**
- Go 1.23
- Gin Web Framework
- MongoDB Driver

**前端**
- React 18
- Ant Design 5
- ECharts 6
- Vite 7

**基础设施**
- MongoDB 7.0
- Nginx
- Docker



## 开发

```bash
# 一键启动开发环境（MongoDB + 后端 + 前端）
docker compose up -d --build server

docker compose -f docker-compose.dev.yml up -d --build

# 查看日志
docker compose -f docker-compose.dev.yml logs -f

# 停止
docker compose -f docker-compose.dev.yml down
```

docker exec stock-mongo-dev mongodump --db stock_db --archive=/tmp/stock_db.archive
