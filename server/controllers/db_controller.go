package controllers

import (
	"context"
	"encoding/json"
	"fmt"
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

	// 优先使用缓存的更新时间，如果缓存没有则从数据库获取
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

	// 判断数据是否需要更新（超过1小时视为需要更新）
	now := time.Now()
	status["hk_needs_update"] = hkUpdateTime.IsZero() || now.Sub(hkUpdateTime) > time.Hour
	status["a_needs_update"] = aUpdateTime.IsZero() || now.Sub(aUpdateTime) > time.Hour

	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": status,
	})
}

// ManualSync 手动同步实时数据和K线数据（异步执行）
// POST /api/v1/db/sync
// 参数:
//   - market: a / hk / all(默认)
//   - includeKline: true(默认) / false - 是否同步K线数据
func (c *DBController) ManualSync(ctx *gin.Context) {
	market := ctx.DefaultQuery("market", "all")
	includeKline := ctx.DefaultQuery("includeKline", "true") == "true"

	// 检查是否已在同步中
	if market == "all" {
		if services.IsSyncing("a") || services.IsSyncing("hk") {
			ctx.JSON(http.StatusConflict, gin.H{
				"code":  -1,
				"error": "已有同步任务在进行中",
			})
			return
		}
	} else {
		if services.IsSyncing(market) {
			ctx.JSON(http.StatusConflict, gin.H{
				"code":  -1,
				"error": "该市场已在同步中",
			})
			return
		}
	}

	// 异步执行同步任务
	go func() {
		// 创建可取消的context
		bgCtx, cancel := context.WithCancel(context.Background())
		defer cancel()
		
		switch market {
		case "hk":
			services.SetSyncCancel("hk", cancel)
			defer services.ClearSyncCancel("hk")
			log.Printf("[ManualSync] 开始同步港股...")
			c.syncMarketData(bgCtx, "hk", includeKline)
		case "a":
			services.SetSyncCancel("a", cancel)
			defer services.ClearSyncCancel("a")
			log.Printf("[ManualSync] 开始同步A股...")
			c.syncMarketData(bgCtx, "a", includeKline)
		default:
			// 同步全部时，先同步A股再同步港股，共用一个cancel
			services.SetSyncCancel("a", cancel)
			services.SetSyncCancel("hk", cancel)
			defer services.ClearSyncCancel("a")
			defer services.ClearSyncCancel("hk")
			
			log.Printf("[ManualSync] 开始同步全部数据，先A股后港股...")
			if err := c.syncMarketData(bgCtx, "a", includeKline); err == nil {
				// 检查是否被取消
				if bgCtx.Err() != nil {
					log.Printf("[ManualSync] 同步已被取消")
					return
				}
				log.Printf("[ManualSync] A股同步完成，开始同步港股...")
				c.syncMarketData(bgCtx, "hk", includeKline)
			} else {
				if bgCtx.Err() != nil {
					log.Printf("[ManualSync] 同步已被取消")
					return
				}
				log.Printf("[ManualSync] A股同步失败，跳过港股: %v", err)
			}
		}
		log.Printf("[ManualSync] 同步任务全部完成")
	}()

	ctx.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "同步任务已启动，请通过进度接口查看状态",
	})
}

// syncMarketData 同步单个市场的数据（实时数据 + K线）
func (c *DBController) syncMarketData(ctx context.Context, market string, includeKline bool) error {
	marketName := "A股"
	if market == "hk" {
		marketName = "港股"
	}

	log.Printf("[syncMarketData] 开始同步%s数据, includeKline=%v", marketName, includeKline)

	// 1. 同步实时数据
	if err := c.stockService.SyncAndCache(ctx, market); err != nil {
		log.Printf("[syncMarketData] %s实时数据同步失败: %v", marketName, err)
		return err
	}
	log.Printf("[syncMarketData] %s实时数据同步完成", marketName)

	// 2. 同步K线数据（增量）
	if includeKline {
		services.UpdateStockSyncProgress(market, "syncing_kline", "正在同步"+marketName+"K线数据...", 85, 100, "准备增量同步")
		log.Printf("[syncMarketData] 开始同步%sK线数据...", marketName)
		
		var err error
		if market == "a" {
			err = c.klineService.SyncAHistoryData(ctx)
		} else {
			err = c.klineService.SyncHKHistoryData(ctx)
		}
		
		if err != nil {
			log.Printf("[syncMarketData] %sK线同步失败: %v", marketName, err)
			services.SetStockSyncError(market, err)
			return err
		}
		log.Printf("[syncMarketData] %sK线同步完成", marketName)
	}

	// 3. 全部完成
	services.UpdateStockSyncProgress(market, "completed", "同步完成", 100, 100, fmt.Sprintf("%s数据同步完成", marketName))
	log.Printf("[syncMarketData] %s全部同步完成", marketName)
	return nil
}

// SyncProgressSSE SSE 实时推送同步进度
// GET /api/v1/db/sync-progress/sse?market=a,hk
func (c *DBController) SyncProgressSSE(ctx *gin.Context) {
	market := ctx.DefaultQuery("market", "all")

	// 设置 SSE headers
	ctx.Header("Content-Type", "text/event-stream")
	ctx.Header("Cache-Control", "no-cache")
	ctx.Header("Connection", "keep-alive")
	ctx.Header("Access-Control-Allow-Origin", "*")

	// 创建一个 channel 来检测客户端断开
	clientGone := ctx.Request.Context().Done()

	// 每500ms推送一次进度
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	// 记录上次发送的数据，避免重复发送
	var lastData string

	for {
		select {
		case <-clientGone:
			return
		case <-ticker.C:
			var progress interface{}
			if market == "all" {
				progress = services.GetAllSyncProgress()
			} else {
				progress = services.GetSyncProgress(market)
			}

			data, _ := json.Marshal(progress)
			dataStr := string(data)

			// 只有数据变化时才发送
			if dataStr != lastData {
				lastData = dataStr
				fmt.Fprintf(ctx.Writer, "data: %s\n\n", dataStr)
				ctx.Writer.Flush()
			}

			// 检查是否所有同步都完成了
			if market == "all" {
				allProgress := services.GetAllSyncProgress()
				allDone := true
				for _, p := range allProgress {
					if p.Status != "idle" && p.Status != "completed" && p.Status != "error" {
						allDone = false
						break
					}
				}
				// 如果全部完成，再发送一次最终状态后退出
				if allDone && lastData != "" {
					return
				}
			} else {
				p := services.GetSyncProgress(market)
				if p.Status == "completed" || p.Status == "error" || p.Status == "idle" {
					// 发送最终状态后等待一小段时间再退出
					time.Sleep(1 * time.Second)
					return
				}
			}
		}
	}
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

// CancelSync 取消同步
// POST /api/v1/db/sync-cancel
func (c *DBController) CancelSync(ctx *gin.Context) {
	market := ctx.DefaultQuery("market", "all")
	
	var cancelled bool
	if market == "all" {
		// 取消所有市场的同步
		a := services.CancelSync("a")
		hk := services.CancelSync("hk")
		cancelled = a || hk
	} else {
		cancelled = services.CancelSync(market)
	}
	
	if cancelled {
		ctx.JSON(http.StatusOK, gin.H{
			"code":    0,
			"message": "同步已取消",
		})
	} else {
		ctx.JSON(http.StatusOK, gin.H{
			"code":    0,
			"message": "没有正在进行的同步任务",
		})
	}
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
