package scheduler

import (
	"context"
	"log"
	"server/services"
	"server/utils"
	"time"
)

// Scheduler 调度器
type Scheduler struct {
	stockService *services.StockService
	klineService *services.KlineService
	rangeService *services.RangeService
	stopChan     chan struct{}
}

// NewScheduler 创建调度器
func NewScheduler() *Scheduler {
	return &Scheduler{
		stockService: services.NewStockService(),
		klineService: services.NewKlineService(),
		rangeService: services.NewRangeService(),
		stopChan:     make(chan struct{}),
	}
}

// Start 启动调度器
func (s *Scheduler) Start() {
	log.Println("调度器启动")

	// 启动时同步数据
	go s.initialSync()

	// 启动定时任务
	go s.runScheduledTasks()
}

// Stop 停止调度器
func (s *Scheduler) Stop() {
	close(s.stopChan)
	log.Println("调度器停止")
}

// initialSync 初始同步
func (s *Scheduler) initialSync() {
	ctx := context.Background()

	log.Println("========== 检查数据状态 ==========")

	// 1. 检查股票列表是否需要更新
	log.Println("[1/3] 检查股票列表...")
	s.checkAndSyncStockList(ctx)

	// 2. 检查各市场K线数据完整性
	log.Println("[2/3] 检查K线数据完整性...")
	s.checkAndSyncKlines(ctx)

	log.Println("========== 数据检查完成 ==========")
}

// checkAndSyncStockList 检查并同步股票列表
func (s *Scheduler) checkAndSyncStockList(ctx context.Context) {
	now := utils.GetChinaTime()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	// 检查港股
	hkLastUpdate, err := s.stockService.GetLastUpdateTime(ctx, "hk")
	if err != nil || hkLastUpdate.Before(today) {
		log.Printf("[港股] 数据需要更新（上次更新: %v）", hkLastUpdate)
		if err := s.stockService.SyncHKStockData(ctx); err != nil {
			log.Printf("同步港股列表失败: %v", err)
		}
	} else {
		hkCount, _ := s.stockService.CountByMarket(ctx, "hk")
		log.Printf("[港股] 数据已是最新（%d只，更新于 %v）", hkCount, hkLastUpdate.Format("2006-01-02 15:04"))
	}

	// 检查A股
	aLastUpdate, err := s.stockService.GetLastUpdateTime(ctx, "a")
	if err != nil || aLastUpdate.Before(today) {
		log.Printf("[A股] 数据需要更新（上次更新: %v）", aLastUpdate)
		if err := s.stockService.SyncAStockData(ctx); err != nil {
			log.Printf("同步A股列表失败: %v", err)
		}
	} else {
		aCount, _ := s.stockService.CountByMarket(ctx, "a")
		log.Printf("[A股] 数据已是最新（%d只，更新于 %v）", aCount, aLastUpdate.Format("2006-01-02 15:04"))
	}
}

// checkAndSyncKlines 检查并同步K线数据
func (s *Scheduler) checkAndSyncKlines(ctx context.Context) {
	now := utils.GetChinaTime()
	today := now.Format("2006-01-02")
	// 获取上一个交易日（简单处理：如果是周一则取上周五，否则取前一天）
	var lastTradingDay string
	if now.Weekday() == time.Monday {
		lastTradingDay = now.AddDate(0, 0, -3).Format("2006-01-02")
	} else if now.Weekday() == time.Sunday {
		lastTradingDay = now.AddDate(0, 0, -2).Format("2006-01-02")
	} else {
		lastTradingDay = now.AddDate(0, 0, -1).Format("2006-01-02")
	}

	// 分别检查 A 股和港股
	aKlineCount, _ := s.klineService.CountKlinesByMarket(ctx, "a")
	hkKlineCount, _ := s.klineService.CountKlinesByMarket(ctx, "hk")

	aLastDate, aErr := s.klineService.GetLastKlineDate(ctx, "a")
	hkLastDate, hkErr := s.klineService.GetLastKlineDate(ctx, "hk")

	log.Printf("A股K线: %d条, 最新日期: %s", aKlineCount, aLastDate)
	log.Printf("港股K线: %d条, 最新日期: %s", hkKlineCount, hkLastDate)

	// 判断是否需要同步
	needSyncA := aKlineCount == 0 || aErr != nil || aLastDate < lastTradingDay
	needSyncHK := hkKlineCount == 0 || hkErr != nil || hkLastDate < lastTradingDay

	if !needSyncA && !needSyncHK {
		log.Printf("[K线] 数据已是最新（A股最新: %s, 港股最新: %s, 上个交易日: %s）", aLastDate, hkLastDate, lastTradingDay)
		return
	}

	// 异步同步，不阻塞启动
	go func() {
		bgCtx := context.Background()

		// 检查 A 股
		if needSyncA {
			if aKlineCount == 0 {
				log.Printf("[A股] 无K线数据，启动全量同步...")
				s.klineService.SyncAHistoryDataFull(bgCtx)
			} else {
				log.Printf("[A股] K线数据需要更新（最新: %s < %s），启动增量同步...", aLastDate, today)
				s.klineService.SyncAHistoryData(bgCtx)
			}
		} else {
			log.Printf("[A股] K线数据已是最新")
		}

		// 检查港股
		if needSyncHK {
			if hkKlineCount == 0 {
				log.Printf("[港股] 无K线数据，启动全量同步...")
				s.klineService.SyncHKHistoryDataFull(bgCtx)
			} else {
				log.Printf("[港股] K线数据需要更新（最新: %s < %s），启动增量同步...", hkLastDate, today)
				s.klineService.SyncHKHistoryData(bgCtx)
			}
		} else {
			log.Printf("[港股] K线数据已是最新")
		}
	}()
}

// runScheduledTasks 运行定时任务
func (s *Scheduler) runScheduledTasks() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			s.checkAndSync()
		}
	}
}

// checkAndSync 检查并同步
func (s *Scheduler) checkAndSync() {
	now := utils.GetChinaTime()

	// 交易时间每5分钟同步实时数据
	if s.shouldSyncRealtime(now) {
		go s.syncRealtimeData()
	}

	// 每天凌晨2点增量同步历史 K 线
	if now.Hour() == 2 && now.Minute() == 0 {
		go s.syncHistoryData()
	}

	// 每天凌晨3点清理旧缓存
	if now.Hour() == 3 && now.Minute() == 0 {
		go s.cleanupOldCache()
	}
}

// shouldSyncRealtime 是否应该同步实时数据
func (s *Scheduler) shouldSyncRealtime(now time.Time) bool {
	// 非交易日不同步
	if !utils.IsTradingDay(now) {
		return false
	}

	// 每5分钟同步一次
	if now.Minute()%5 != 0 {
		return false
	}

	// A股或港股交易时间
	return utils.IsAStockTradingTime(now) || utils.IsHKTradingTime(now)
}

// syncRealtimeData 同步实时数据
func (s *Scheduler) syncRealtimeData() {
	ctx := context.Background()
	now := utils.GetChinaTime()

	// A股交易时间同步A股
	if utils.IsAStockTradingTime(now) {
		if err := s.stockService.SyncAStockData(ctx); err != nil {
			log.Printf("定时同步A股失败: %v", err)
		}
	}

	// 港股交易时间同步港股
	if utils.IsHKTradingTime(now) {
		if err := s.stockService.SyncHKStockData(ctx); err != nil {
			log.Printf("定时同步港股失败: %v", err)
		}
	}
}

// syncHistoryData 同步历史数据
func (s *Scheduler) syncHistoryData() {
	ctx := context.Background()
	log.Println("开始增量同步历史K线...")

	if err := s.klineService.SyncHKHistoryDataIncremental(ctx); err != nil {
		log.Printf("增量同步历史K线失败: %v", err)
	}
}

// cleanupOldCache 清理旧缓存
func (s *Scheduler) cleanupOldCache() {
	ctx := context.Background()
	deleted, err := s.rangeService.ClearOldCache(ctx)
	if err != nil {
		log.Printf("清理旧缓存失败: %v", err)
	} else if deleted > 0 {
		log.Printf("清理了 %d 条旧缓存", deleted)
	}
}

// ManualSync 手动同步
func (s *Scheduler) ManualSync(market string) error {
	ctx := context.Background()

	switch market {
	case "hk":
		return s.stockService.SyncHKStockData(ctx)
	case "a":
		return s.stockService.SyncAStockData(ctx)
	default:
		if err := s.stockService.SyncHKStockData(ctx); err != nil {
			return err
		}
		return s.stockService.SyncAStockData(ctx)
	}
}

// ManualSyncHistory 手动同步历史
func (s *Scheduler) ManualSyncHistory(full bool) error {
	ctx := context.Background()

	if full {
		return s.klineService.SyncHKHistoryData(ctx)
	}
	return s.klineService.SyncHKHistoryDataIncremental(ctx)
}
