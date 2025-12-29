package controllers

import (
	"net/http"
	"server/services"
	"strconv"

	"github.com/gin-gonic/gin"
)

// StockController 股票控制器
type StockController struct {
	stockService *services.StockService
	klineService *services.KlineService
}

// NewStockController 创建股票控制器
func NewStockController() *StockController {
	return &StockController{
		stockService: services.NewStockService(),
		klineService: services.NewKlineService(),
	}
}

// GetAllData 获取港股数据
// GET /api/v1/stock/all
func (c *StockController) GetAllData(ctx *gin.Context) {
	stocks, err := c.stockService.GetStocksByMarketWithCache(ctx.Request.Context(), "hk")
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": stocks,
	})
}

// GetStockHist 获取历史K线数据
// GET /api/v1/stock/hist
func (c *StockController) GetStockHist(ctx *gin.Context) {
	symbol := ctx.Query("symbol")
	if symbol == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "symbol is required"})
		return
	}

	market := ctx.DefaultQuery("market", "hk")
	period := ctx.DefaultQuery("period", "daily")
	adjust := ctx.DefaultQuery("adjust", "")
	startDate := ctx.DefaultQuery("start_date", "")
	endDate := ctx.DefaultQuery("end_date", "")

	data, err := c.klineService.FetchStockHistory(symbol, market, period, adjust, startDate, endDate)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": data,
	})
}

// GetStockDetail 获取股票详情
// GET /api/v1/stock/detail
func (c *StockController) GetStockDetail(ctx *gin.Context) {
	symbol := ctx.Query("symbol")
	if symbol == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "symbol is required"})
		return
	}

	market := ctx.DefaultQuery("market", "hk")

	// 先尝试从数据库获取
	stock, err := c.klineService.GetStockDetailWithIndicators(ctx.Request.Context(), symbol, market)
	if err != nil {
		// 从 API 获取
		stock, err = c.klineService.FetchStockDetailFromAPI(symbol, market)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": stock,
	})
}

// SearchStocks 搜索股票
// GET /api/v1/stock/search
func (c *StockController) SearchStocks(ctx *gin.Context) {
	keyword := ctx.Query("keyword")
	if keyword == "" {
		ctx.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": []interface{}{},
		})
		return
	}

	limit := 20
	if l := ctx.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	stocks, err := c.stockService.SearchStocks(ctx.Request.Context(), keyword, limit)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": stocks,
	})
}
