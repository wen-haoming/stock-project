package controllers

import (
	"context"
	"net/http"
	"server/services"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/longportapp/openapi-go/quote"
)

// LongPortController LongPort API 控制器
type LongPortController struct {
	lpService *services.LongPortService
}

// NewLongPortController 创建 LongPort 控制器
func NewLongPortController() *LongPortController {
	return &LongPortController{
		lpService: services.GetLongPortService(),
	}
}

// GetQuote 获取实时行情
// GET /api/v1/lp/quote?symbols=700.HK,AAPL.US
func (c *LongPortController) GetQuote(ctx *gin.Context) {
	symbols := ctx.QueryArray("symbols")
	if len(symbols) == 0 {
		// 尝试从逗号分隔的字符串解析
		symbolStr := ctx.Query("symbols")
		if symbolStr != "" {
			symbols = splitSymbols(symbolStr)
		}
	}

	if len(symbols) == 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "symbols is required"})
		return
	}

	data, err := c.lpService.GetQuote(context.Background(), symbols)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
}

// GetStaticInfo 获取股票基本信息
// GET /api/v1/lp/static?symbols=700.HK,AAPL.US
func (c *LongPortController) GetStaticInfo(ctx *gin.Context) {
	symbols := ctx.QueryArray("symbols")
	if len(symbols) == 0 {
		symbolStr := ctx.Query("symbols")
		if symbolStr != "" {
			symbols = splitSymbols(symbolStr)
		}
	}

	if len(symbols) == 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "symbols is required"})
		return
	}

	data, err := c.lpService.GetStaticInfo(context.Background(), symbols)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
}

// GetCandlesticks 获取K线数据
// GET /api/v1/lp/kline?symbol=700.HK&period=day&count=100&adjust=qfq
func (c *LongPortController) GetCandlesticks(ctx *gin.Context) {
	symbol := ctx.Query("symbol")
	if symbol == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "symbol is required"})
		return
	}

	period := services.GetPeriodFromString(ctx.DefaultQuery("period", "day"))
	count, _ := strconv.Atoi(ctx.DefaultQuery("count", "100"))
	adjust := services.GetAdjustTypeFromString(ctx.DefaultQuery("adjust", ""))

	data, err := c.lpService.GetCandlesticks(context.Background(), symbol, period, int32(count), adjust)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
}

// GetHistoryKline 按日期范围获取K线
// GET /api/v1/lp/history-kline?symbol=700.HK&period=day&start=2024-01-01&end=2024-12-31&adjust=qfq
func (c *LongPortController) GetHistoryKline(ctx *gin.Context) {
	symbol := ctx.Query("symbol")
	if symbol == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "symbol is required"})
		return
	}

	period := services.GetPeriodFromString(ctx.DefaultQuery("period", "day"))
	adjust := services.GetAdjustTypeFromString(ctx.DefaultQuery("adjust", ""))

	var startDate, endDate *time.Time
	if startStr := ctx.Query("start"); startStr != "" {
		if t, err := time.Parse("2006-01-02", startStr); err == nil {
			startDate = &t
		}
	}
	if endStr := ctx.Query("end"); endStr != "" {
		if t, err := time.Parse("2006-01-02", endStr); err == nil {
			endDate = &t
		}
	}

	data, err := c.lpService.GetHistoryCandlesticksByDate(context.Background(), symbol, period, adjust, startDate, endDate)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
}

// GetDepth 获取深度行情
// GET /api/v1/lp/depth?symbol=700.HK
func (c *LongPortController) GetDepth(ctx *gin.Context) {
	symbol := ctx.Query("symbol")
	if symbol == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "symbol is required"})
		return
	}

	data, err := c.lpService.GetDepth(context.Background(), symbol)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
}

// GetIntraday 获取分时数据
// GET /api/v1/lp/intraday?symbol=700.HK
func (c *LongPortController) GetIntraday(ctx *gin.Context) {
	symbol := ctx.Query("symbol")
	if symbol == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "symbol is required"})
		return
	}

	data, err := c.lpService.GetIntraday(context.Background(), symbol)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
}

// GetCapitalFlow 获取资金流向
// GET /api/v1/lp/capital-flow?symbol=700.HK
func (c *LongPortController) GetCapitalFlow(ctx *gin.Context) {
	symbol := ctx.Query("symbol")
	if symbol == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "symbol is required"})
		return
	}

	data, err := c.lpService.GetCapitalFlow(context.Background(), symbol)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
}

// GetCapitalDistribution 获取资金分布
// GET /api/v1/lp/capital-distribution?symbol=700.HK
func (c *LongPortController) GetCapitalDistribution(ctx *gin.Context) {
	symbol := ctx.Query("symbol")
	if symbol == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "symbol is required"})
		return
	}

	data, err := c.lpService.GetCapitalDistribution(context.Background(), symbol)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
}

// GetTradingSession 获取市场交易时段
// GET /api/v1/lp/trading-session
func (c *LongPortController) GetTradingSession(ctx *gin.Context) {
	data, err := c.lpService.GetMarketTradingSession(context.Background())
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
}

// GetTradingDays 获取交易日
// GET /api/v1/lp/trading-days?market=HK&start=2024-01-01&end=2024-12-31
func (c *LongPortController) GetTradingDays(ctx *gin.Context) {
	market := services.GetMarketFromString(ctx.DefaultQuery("market", "HK"))

	var begin, end time.Time
	if startStr := ctx.Query("start"); startStr != "" {
		if t, err := time.Parse("2006-01-02", startStr); err == nil {
			begin = t
		}
	} else {
		begin = time.Now().AddDate(0, -1, 0) // 默认过去一个月
	}

	if endStr := ctx.Query("end"); endStr != "" {
		if t, err := time.Parse("2006-01-02", endStr); err == nil {
			end = t
		}
	} else {
		end = time.Now()
	}

	data, err := c.lpService.GetTradingDays(context.Background(), market, begin, end)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
}

// GetStatus 获取 LongPort API 状态
// GET /api/v1/lp/status
func (c *LongPortController) GetStatus(ctx *gin.Context) {
	enabled := c.lpService.IsEnabled()
	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"enabled": enabled,
			"message": func() string {
				if enabled {
					return "LongPort API is enabled and connected"
				}
				return "LongPort API is disabled, using fallback data source"
			}(),
		},
	})
}

// SubscribeQuote 订阅实时行情 (WebSocket)
// 此接口需要通过 WebSocket 实现，这里只提供订阅信息
// GET /api/v1/lp/subscribe-info
func (c *LongPortController) SubscribeInfo(ctx *gin.Context) {
	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"subTypes": []string{
				"quote",    // 实时行情
				"depth",    // 深度行情
				"brokers",  // 经纪队列
				"trade",    // 成交明细
			},
			"usage": "Use WebSocket endpoint /ws/quote for real-time subscription",
		},
	})
}

// 辅助函数：分割股票代码
func splitSymbols(s string) []string {
	var result []string
	var current string
	for _, ch := range s {
		if ch == ',' || ch == ' ' {
			if current != "" {
				result = append(result, current)
				current = ""
			}
		} else {
			current += string(ch)
		}
	}
	if current != "" {
		result = append(result, current)
	}
	return result
}

// 辅助函数：获取订阅类型
func getSubTypes(types []string) []quote.SubType {
	var result []quote.SubType
	for _, t := range types {
		switch t {
		case "quote":
			result = append(result, quote.SubTypeQuote)
		case "depth":
			result = append(result, quote.SubTypeDepth)
		case "brokers":
			result = append(result, quote.SubTypeBrokers)
		case "trade":
			result = append(result, quote.SubTypeTrade)
		}
	}
	return result
}
