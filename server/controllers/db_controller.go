package controllers

import (
	"context"
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
	dbCtx, cancel := context.WithTimeout(ctx.Request.Context(), 5*time.Second)
	defer cancel()

	status := gin.H{
		"connected": repositories.IsConnected(),
	}

	// 获取各市场股票数量
	hkCount, _ := c.stockService.CountByMarket(dbCtx, "hk")
	aCount, _ := c.stockService.CountByMarket(dbCtx, "a")
	klineCount, _ := c.klineService.CountKlines(dbCtx)

	status["hk_stocks"] = hkCount
	status["a_stocks"] = aCount
	status["klines"] = klineCount

	// 获取最后更新时间
	hkUpdateTime, _ := c.stockService.GetLastUpdateTime(dbCtx, "hk")
	aUpdateTime, _ := c.stockService.GetLastUpdateTime(dbCtx, "a")

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

// ManualSync 手动同步实时数据
// POST /api/v1/db/sync
func (c *DBController) ManualSync(ctx *gin.Context) {
	market := ctx.DefaultQuery("market", "all")
	dbCtx := ctx.Request.Context()

	var err error
	switch market {
	case "hk":
		err = c.stockService.SyncHKStockData(dbCtx)
	case "a":
		err = c.stockService.SyncAStockData(dbCtx)
	default:
		err = c.stockService.SyncHKStockData(dbCtx)
		if err == nil {
			err = c.stockService.SyncAStockData(dbCtx)
		}
	}

	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{
			"code":  -1,
			"error": err.Error(),
		})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "同步完成",
	})
}

// ManualSyncHistory 手动同步历史K线
// POST /api/v1/db/sync-history
func (c *DBController) ManualSyncHistory(ctx *gin.Context) {
	mode := ctx.DefaultQuery("mode", "incremental")
	dbCtx := ctx.Request.Context()

	var err error
	if mode == "full" {
		err = c.klineService.SyncHKHistoryData(dbCtx)
	} else {
		err = c.klineService.SyncHKHistoryDataIncremental(dbCtx)
	}

	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{
			"code":  -1,
			"error": err.Error(),
		})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "历史数据同步完成",
	})
}
