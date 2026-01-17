#!/bin/bash

# LongPort API 测试脚本
# 用于验证后端 LongPort API 是否正常工作

BASE_URL="http://localhost:8080/api/v1/lp"

echo "========================================="
echo "LongPort API 测试脚本"
echo "========================================="
echo ""

# 1. 检查 API 状态
echo "1. 检查 LongPort API 状态..."
STATUS=$(curl -s "${BASE_URL}/status")
echo "Response: $STATUS"
echo ""

# 检查是否可用
if echo "$STATUS" | grep -q '"available":true'; then
    echo "✅ LongPort API 可用"
    echo ""
else
    echo "❌ LongPort API 不可用"
    echo "请检查环境变量配置："
    echo "  - LONGPORT_APP_KEY"
    echo "  - LONGPORT_APP_SECRET"
    echo "  - LONGPORT_ACCESS_TOKEN"
    echo ""
    exit 1
fi

# 2. 获取实时行情
echo "2. 获取实时行情（腾讯、苹果、浦发银行）..."
curl -s "${BASE_URL}/quote?symbols=700.HK,AAPL.US,600000.SH" | python3 -m json.tool 2>/dev/null | head -50
echo ""
echo ""

# 3. 获取K线数据
echo "3. 获取K线数据（腾讯最近10天）..."
curl -s "${BASE_URL}/kline?symbol=700.HK&period=day&count=10" | python3 -m json.tool 2>/dev/null | head -30
echo ""
echo ""

# 4. 获取分时数据
echo "4. 获取分时数据（腾讯）..."
curl -s "${BASE_URL}/intraday?symbol=700.HK" | python3 -m json.tool 2>/dev/null | head -30
echo ""
echo ""

# 5. 获取深度行情
echo "5. 获取深度行情（腾讯）..."
curl -s "${BASE_URL}/depth?symbol=700.HK" | python3 -m json.tool 2>/dev/null
echo ""
echo ""

# 6. 获取交易时段
echo "6. 获取交易时段（港股市场）..."
curl -s "${BASE_URL}/trading-session?market=hk" | python3 -m json.tool 2>/dev/null
echo ""
echo ""

# 7. 获取订阅信息
echo "7. 获取订阅信息..."
curl -s "${BASE_URL}/subscribe-info" | python3 -m json.tool 2>/dev/null
echo ""
echo ""

echo "========================================="
echo "测试完成！"
echo "========================================="
