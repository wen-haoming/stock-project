package controllers

import (
	"context"
	"log"
	"net/http"
	"server/repositories"
	"server/services"
	"time"

	"github.com/gin-gonic/gin"
)

// DBController 数据库控制器
type DBController struct {
	stockService *services.StockService
	klineService *services.KlineService
}

// NewDBController 创建数据库控制器
func NewDBController() *DBController {
	return &DBController{
		stockService: services.NewStockService(),
		klineService: services.NewKlineService(),
	}
}

// GetStatus 获取数据库状态
// GET /api/v1/db/status
func (c *DBController) GetStatus(ctx *gin.Context) {
	dbCtx, cancel := context.WithTimeout(ctx.Request.Context(), 30*time.Second)
	defer cancel()

	status := gin.H{
		"connected": repositories.IsConnected(),
	}

	// 获取各市场股票数量
	hkCount, _ := c.stockService.CountByMarket(dbCtx, "hk")
	aCount, _ := c.stockService.CountByMarket(dbCtx, "a")
	
	// 分别获取A股和港股K线数量
	aKlineCount, aKlineErr := c.klineService.CountKlinesByMarket(dbCtx, "a")
	hkKlineCount, hkKlineErr := c.klineService.CountKlinesByMarket(dbCtx, "hk")
	
	if aKlineErr != nil {
		log.Printf("[GetStatus] 获取A股K线数量失败: %v", aKlineErr)
	}
	if hkKlineErr != nil {
		log.Printf("[GetStatus] 获取港股K线数量失败: %v", hkKlineErr)
	}

	status["hk_stocks"] = hkCount
	status["a_stocks"] = aCount
	status["klines"] = aKlineCount + hkKlineCount
	status["a_klines"] = aKlineCount
	status["hk_klines"] = hkKlineCount

	// 获取实时缓存状态
	cacheStats := c.stockService.GetRealtimeCacheStats()
	status["cache"] = cacheStats

	// 获取更新时间
	var hkUpdateTime, aUpdateTime time.Time
	
	// 从缓存获取更新时间
	if cacheStats != nil {
		if lastSyncHK, ok := cacheStats["lastSyncHK"].(time.Time); ok && !lastSyncHK.IsZero() {
			hkUpdateTime = lastSyncHK
		}
		if lastSyncA, ok := cacheStats["lastSyncA"].(time.Time); ok && !lastSyncA.IsZero() {
			aUpdateTime = lastSyncA
		}
	}

	// 如果缓存没有，从数据库获取
	if hkUpdateTime.IsZero() {
		hkUpdateTime, _ = c.stockService.GetLastUpdateTime(dbCtx, "hk")
	}
	if aUpdateTime.IsZero() {
		aUpdateTime, _ = c.stockService.GetLastUpdateTime(dbCtx, "a")
	}

	if !hkUpdateTime.IsZero() {
		status["hk_last_update"] = hkUpdateTime.Format(time.RFC3339)
	}
	if !aUpdateTime.IsZero() {
		status["a_last_update"] = aUpdateTime.Format(time.RFC3339)
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": status,
	})
}

// GetKlineDateRange 获取K线数据的日期范围
// GET /api/v1/db/kline-range?market=hk
func (c *DBController) GetKlineDateRange(ctx *gin.Context) {
	market := ctx.DefaultQuery("market", "all")

	dbCtx, cancel := context.WithTimeout(ctx.Request.Context(), 30*time.Second)
	defer cancel()

	result := gin.H{}

	if market == "all" || market == "a" {
		minDate, maxDate, count, err := c.klineService.GetKlineDateRange(dbCtx, "a")
		if err != nil {
			log.Printf("[GetKlineDateRange] 获取A股日期范围失败: %v", err)
		}
		result["a"] = gin.H{
			"minDate": minDate,
			"maxDate": maxDate,
			"count":   count,
		}
	}

	if market == "all" || market == "hk" {
		minDate, maxDate, count, err := c.klineService.GetKlineDateRange(dbCtx, "hk")
		if err != nil {
			log.Printf("[GetKlineDateRange] 获取港股日期范围失败: %v", err)
		}
		result["hk"] = gin.H{
			"minDate": minDate,
			"maxDate": maxDate,
			"count":   count,
		}
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": result,
	})
}

// GetKlineDebug 调试接口：查询单只股票的K线数据
// GET /api/v1/db/kline-debug?symbol=09992&market=hk
func (c *DBController) GetKlineDebug(ctx *gin.Context) {
	symbol := ctx.Query("symbol")
	market := ctx.DefaultQuery("market", "hk")
	
	if symbol == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{
			"code":  -1,
			"error": "symbol is required",
		})
		return
	}
	
	dbCtx, cancel := context.WithTimeout(ctx.Request.Context(), 10*time.Second)
	defer cancel()
	
	klines, err := c.klineService.GetKlinesBySymbol(dbCtx, symbol, market, "", "")
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{
			"code":  -1,
			"error": err.Error(),
		})
		return
	}
	
	ctx.JSON(http.StatusOK, gin.H{
		"code":   0,
		"count":  len(klines),
		"symbol": symbol,
		"market": market,
		"data":   klines,
	})
}
