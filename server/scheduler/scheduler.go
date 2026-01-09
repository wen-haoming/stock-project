package scheduler

import (
	"context"
	"log"
	"server/repositories"
	"server/services"
)

// Scheduler 调度器（仅用于启动时预热缓存）
type Scheduler struct {
	stockService *services.StockService
	klineService *services.KlineService
	stopChan     chan struct{}
}

// NewScheduler 创建调度器
func NewScheduler() *Scheduler {
	return &Scheduler{
		stockService: services.NewStockService(),
		klineService: services.NewKlineService(),
		stopChan:     make(chan struct{}),
	}
}

// Start 启动调度器（仅预热缓存，不做任何自动同步）
func (s *Scheduler) Start() {
	log.Println("调度器启动")

	// 只预热缓存，不自动同步数据
	go func() {
		ctx := context.Background()
		log.Println("========== 服务启动初始化 ==========")
		log.Println("[1/1] 预热缓存（从数据库加载已有数据）...")
		s.preloadCache(ctx)
		log.Println("========== 初始化完成 ==========")
	}()
}

// Stop 停止调度器
func (s *Scheduler) Stop() {
	close(s.stopChan)
	log.Println("调度器停止")
}

// preloadCache 预热缓存
func (s *Scheduler) preloadCache(ctx context.Context) {
	// 从数据库加载最新的股票数据到实时缓存
	if err := s.stockService.PreloadRealtimeCache(ctx, "a"); err != nil {
		log.Printf("预热A股缓存失败: %v", err)
	}

	if err := s.stockService.PreloadRealtimeCache(ctx, "hk"); err != nil {
		log.Printf("预热港股缓存失败: %v", err)
	}

	stats := s.stockService.GetRealtimeCacheStats()
	log.Printf("实时缓存预热完成: A股 %v只, 港股 %v只", stats["aCount"], stats["hkCount"])

	// 预热K线缓存
	s.preloadKlineCache(ctx)
}

// preloadKlineCache 预热K线缓存 - 直接从数据库加载全部数据
func (s *Scheduler) preloadKlineCache(ctx context.Context) {
	log.Println("开始预热K线缓存（全量加载）...")

	klineCache := repositories.GetKlineCache()
	klineRepo := repositories.NewKlineRepository()

	// 直接从数据库加载全部A股K线
	aCount, err := klineRepo.LoadAllKlinesToCache(ctx, "a", klineCache)
	if err != nil {
		log.Printf("加载A股K线缓存失败: %v", err)
	}

	// 直接从数据库加载全部港股K线
	hkCount, err := klineRepo.LoadAllKlinesToCache(ctx, "hk", klineCache)
	if err != nil {
		log.Printf("加载港股K线缓存失败: %v", err)
	}

	log.Printf("K线缓存预热完成: A股 %d只, 港股 %d只", aCount, hkCount)

	if klineCache.IsInitialized() {
		log.Printf("K线缓存已成功初始化")
	} else {
		log.Printf("警告: K线缓存初始化状态异常")
	}
}

// GetCacheStats 获取缓存统计信息
func (s *Scheduler) GetCacheStats() map[string]interface{} {
	return s.stockService.GetRealtimeCacheStats()
}

// ForcePreloadCache 强制预热缓存
func (s *Scheduler) ForcePreloadCache() error {
	ctx := context.Background()
	s.preloadCache(ctx)
	return nil
}
