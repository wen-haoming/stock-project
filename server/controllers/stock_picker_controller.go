package controllers

import (
	"net/http"
	"server/services"
	"strconv"

	"github.com/gin-gonic/gin"
)

// StockPickerController 行情选股控制器
type StockPickerController struct {
	service *services.StockPickerService
}

// NewStockPickerController 创建控制器
func NewStockPickerController() *StockPickerController {
	return &StockPickerController{
		service: services.NewStockPickerService(),
	}
}

// GetStocks 获取选股结果
// GET /api/v1/stock/picker
// 参数:
//   - market: a 或 hk（默认 a）
//   - theme: 题材/行业（可选）
//   - signal: 异动信号类型（可选）
//     - all: 全部
//     - limit_up: 涨停板
//     - continuous_limit: 连板股
//     - first_limit: 首板股
//     - volume_breakout: 放量突破
//     - bottom_volume: 底部放量
//     - golden_cross: 金叉信号
//     - ma_bull: 均线多头
//   - marketCap: 市值范围（可选）
//     - all: 全部
//     - micro: 微盘(<50亿)
//     - small: 小盘(50-200亿)
//     - mid: 中盘(200-500亿)
//     - large: 大盘(500-2000亿)
//     - mega: 超大盘(>2000亿)
//   - limit: 返回数量（默认100，最大500）
//   - offset: 偏移量（默认0）
func (c *StockPickerController) GetStocks(ctx *gin.Context) {
	query := services.StockPickerQuery{
		Market:    ctx.DefaultQuery("market", "a"),
		Theme:     ctx.DefaultQuery("theme", "all"),
		Signal:    services.SignalType(ctx.DefaultQuery("signal", "all")),
		MarketCap: services.MarketCapRange(ctx.DefaultQuery("marketCap", "all")),
	}

	// 解析分页参数
	if limit, err := strconv.Atoi(ctx.DefaultQuery("limit", "100")); err == nil {
		query.Limit = limit
	}
	if offset, err := strconv.Atoi(ctx.DefaultQuery("offset", "0")); err == nil {
		query.Offset = offset
	}

	// 获取数据
	stocks, total, err := c.service.GetStocks(ctx.Request.Context(), query)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{
			"code":    -1,
			"message": "获取数据失败: " + err.Error(),
		})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code":  0,
		"data":  stocks,
		"total": total,
		"query": gin.H{
			"market":    query.Market,
			"theme":     query.Theme,
			"signal":    query.Signal,
			"marketCap": query.MarketCap,
			"limit":     query.Limit,
			"offset":    query.Offset,
		},
	})
}

// GetIndustries 获取行业列表
// GET /api/v1/stock/picker/industries
// 参数:
//   - market: a 或 hk（默认 a）
func (c *StockPickerController) GetIndustries(ctx *gin.Context) {
	market := ctx.DefaultQuery("market", "a")

	industries, err := c.service.GetIndustries(ctx.Request.Context(), market)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{
			"code":    -1,
			"message": "获取行业列表失败: " + err.Error(),
		})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": industries,
	})
}

// GetSignalTypes 获取信号类型列表
// GET /api/v1/stock/picker/signals
func (c *StockPickerController) GetSignalTypes(ctx *gin.Context) {
	signals := []gin.H{
		{"value": "all", "label": "全部", "description": "显示所有股票"},
		{"value": "limit_up", "label": "涨停板", "description": "当日涨停的股票（A股涨幅≥9.9%）"},
		{"value": "continuous_limit", "label": "连板股", "description": "连续2天及以上涨停"},
		{"value": "first_limit", "label": "首板股", "description": "今日首次涨停"},
		{"value": "volume_breakout", "label": "放量突破", "description": "成交量放大2倍以上，突破20日高点"},
		{"value": "bottom_volume", "label": "底部放量", "description": "股价处于低位，成交量放大"},
		{"value": "golden_cross", "label": "金叉信号", "description": "MA5上穿MA10或MACD金叉"},
		{"value": "ma_bull", "label": "均线多头", "description": "MA5>MA10>MA20>MA60多头排列"},
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": signals,
	})
}

// GetMarketCapRanges 获取市值范围列表
// GET /api/v1/stock/picker/marketcaps
func (c *StockPickerController) GetMarketCapRanges(ctx *gin.Context) {
	ranges := []gin.H{
		{"value": "all", "label": "全部"},
		{"value": "micro", "label": "微盘(<50亿)"},
		{"value": "small", "label": "小盘(50-200亿)"},
		{"value": "mid", "label": "中盘(200-500亿)"},
		{"value": "large", "label": "大盘(500-2000亿)"},
		{"value": "mega", "label": "超大盘(>2000亿)"},
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": ranges,
	})
}
