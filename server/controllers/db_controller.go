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
// 参数:
//   - mode: smart(智能，默认) / incremental(增量7天) / full(强制全量)
//   - market: a / hk / all(默认)
func (c *DBController) ManualSyncHistory(ctx *gin.Context) {
	mode := ctx.DefaultQuery("mode", "smart")
	market := ctx.DefaultQuery("market", "all")

	modeDesc := map[string]string{
		"smart":       "智能同步（有数据则增量30天，无数据则全量）",
		"incremental": "增量同步（最近7天）",
		"full":        "强制全量同步",
	}

	// 使用独立的 context，不依赖请求 context
	go func() {
		bgCtx := context.Background()
		switch mode {
		case "full":
			// 强制全量同步
			switch market {
			case "hk":
				c.klineService.SyncHKHistoryDataFull(bgCtx)
			case "a":
				c.klineService.SyncAHistoryDataFull(bgCtx)
			default:
				c.klineService.SyncAHistoryDataFull(bgCtx)
				c.klineService.SyncHKHistoryDataFull(bgCtx)
			}
		case "incremental":
			// 增量同步（最近7天）
			switch market {
			case "hk":
				c.klineService.SyncHKHistoryDataIncremental(bgCtx)
			case "a":
				c.klineService.SyncAHistoryDataIncremental(bgCtx)
			default:
				c.klineService.SyncAHistoryDataIncremental(bgCtx)
				c.klineService.SyncHKHistoryDataIncremental(bgCtx)
			}
		default:
			// 智能同步（有数据则增量30天，无数据则全量）
			switch market {
			case "hk":
				c.klineService.SyncHKHistoryData(bgCtx)
			case "a":
				c.klineService.SyncAHistoryData(bgCtx)
			default:
				c.klineService.SyncAHistoryData(bgCtx)
				c.klineService.SyncHKHistoryData(bgCtx)
			}
		}
	}()

	ctx.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "同步任务已启动，请通过 /api/v1/db/sync-progress 查看进度",
		"mode":    modeDesc[mode],
	})
}

// GetSyncProgress 获取同步进度
// GET /api/v1/db/sync-progress
func (c *DBController) GetSyncProgress(ctx *gin.Context) {
	market := ctx.DefaultQuery("market", "")
	
	if market != "" {
		progress := services.GetSyncProgress(market)
		ctx.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": progress,
		})
		return
	}
	
	// 返回所有市场的进度
	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": services.GetAllSyncProgress(),
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
