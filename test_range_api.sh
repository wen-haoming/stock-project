#!/bin/bash

# 股票范围数据刷新和查询测试脚本

BASE_URL="http://localhost:8080"
START_DATE="20231229"
END_DATE="20251222"

echo "=========================================="
echo "股票范围数据 API 测试"
echo "=========================================="
echo ""

# 1. 检查服务健康
echo "1️⃣  检查服务健康状态..."
PING_RESULT=$(curl -s "$BASE_URL/ping")
if [ "$PING_RESULT" = "pong" ]; then
    echo "✅ 服务正常运行"
else
    echo "❌ 服务无法连接，请先启动服务器"
    exit 1
fi
echo ""

# 2. 检查数据库状态
echo "2️⃣  检查数据库状态..."
DB_STATUS=$(curl -s "$BASE_URL/api/v1/db/status")
echo "数据库状态："
echo "$DB_STATUS" | jq '.' 2>/dev/null || echo "$DB_STATUS"
echo ""

# 3. 主动刷新范围数据（这是关键步骤！）
echo "3️⃣  主动刷新范围数据到数据库..."
echo "📝 请求参数："
echo "   start_date: $START_DATE"
echo "   end_date: $END_DATE"
echo ""
echo "⏳ 正在获取数据，这可能需要 30-60 秒..."

REFRESH_RESULT=$(curl -s -X POST "$BASE_URL/api/v1/stock/range/refresh?start_date=$START_DATE&end_date=$END_DATE")
echo ""
echo "✅ 刷新完成，结果："
echo "$REFRESH_RESULT" | jq '.' 2>/dev/null || echo "$REFRESH_RESULT"
echo ""

# 4. 查询范围数据（从缓存）
echo "4️⃣  查询范围数据..."
echo "📝 查询参数："
echo "   start_date: $START_DATE"
echo "   end_date: $END_DATE"
echo "   min_change_pct: 60 (最小涨幅)"
echo "   min_market_cap: 100 (最小市值 100 亿)"
echo "   max_market_cap: 5000 (最大市值 5000 亿)"
echo ""

QUERY_RESULT=$(curl -s "$BASE_URL/api/v1/stock/range?start_date=$START_DATE&end_date=$END_DATE&min_change_pct=60&min_market_cap=100&max_market_cap=5000")
echo "✅ 查询完成，结果摘要："
echo "$QUERY_RESULT" | jq '{total: .total, cached: .cached, fromDB: .fromDB, sampleData: .data[0:2]}' 2>/dev/null || echo "$QUERY_RESULT"
echo ""

# 5. 测试不同的市值范围
echo "5️⃣  测试其他市值范围..."
echo ""

echo "📊 小盘股 (市值 10-100 亿):"
SMALL_CAP=$(curl -s "$BASE_URL/api/v1/stock/range?start_date=$START_DATE&end_date=$END_DATE&min_change_pct=30&min_market_cap=10&max_market_cap=100")
echo "$SMALL_CAP" | jq '{total: .total, topStock: .data[0]}' 2>/dev/null || echo "$SMALL_CAP"
echo ""

echo "📊 中盘股 (市值 1000-5000 亿):"
MID_CAP=$(curl -s "$BASE_URL/api/v1/stock/range?start_date=$START_DATE&end_date=$END_DATE&min_change_pct=30&min_market_cap=1000&max_market_cap=5000")
echo "$MID_CAP" | jq '{total: .total, topStock: .data[0]}' 2>/dev/null || echo "$MID_CAP"
echo ""

# 6. 测试强制刷新
echo "6️⃣  测试强制刷新参数..."
echo "📝 加入 refresh=true 参数强制刷新缓存"
echo ""
echo "⏳ 正在重新获取数据..."
FORCE_REFRESH=$(curl -s "$BASE_URL/api/v1/stock/range?start_date=$START_DATE&end_date=$END_DATE&min_change_pct=60&refresh=true")
echo "✅ 强制刷新完成"
echo "$FORCE_REFRESH" | jq '{total: .total, cached: .cached}' 2>/dev/null || echo "$FORCE_REFRESH"
echo ""

echo "=========================================="
echo "✅ 所有测试完成！"
echo "=========================================="
