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

	log.Println("开始初始数据同步...")

	// 同步港股实时数据
	if err := s.stockService.SyncHKStockData(ctx); err != nil {
		log.Printf("初始同步港股失败: %v", err)
	}

	// 同步 A 股实时数据
	if err := s.stockService.SyncAStockData(ctx); err != nil {
		log.Printf("初始同步A股失败: %v", err)
	}

	// 检查是否需要同步历史 K 线
	klineCount, _ := s.klineService.CountKlines(ctx)
	if klineCount == 0 {
		log.Println("K线数据为空，开始全量同步历史数据...")
		go s.klineService.SyncHKHistoryData(ctx)
	}

	log.Println("初始数据同步完成")
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
