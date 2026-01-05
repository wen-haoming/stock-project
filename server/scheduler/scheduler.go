package scheduler

import (
	"context"
	"log"
	"server/repositories"
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

	// 只预热缓存，不自动同步数据
	// 数据同步改为通过 Web 界面手动触发
	go func() {
		ctx := context.Background()
		log.Println("========== 服务启动初始化 ==========")
		log.Println("[1/1] 预热实时缓存（从数据库加载已有数据）...")
		s.preloadRealtimeCache(ctx)
		log.Println("========== 初始化完成，如需同步数据请通过 Web 界面操作 ==========")
	}()

	// 启动定时任务（保留交易时间的实时同步等）
	go s.runScheduledTasks()
}

// Stop 停止调度器
func (s *Scheduler) Stop() {
	close(s.stopChan)
	log.Println("调度器停止")
}

// ============== 部署策略 ==============

// regularDeployment 常规部署（日常更新）
func (s *Scheduler) regularDeployment() {
	ctx := context.Background()
	log.Println("========== 常规部署数据初始化 ==========")

	// 1. 预热内存缓存（从数据库加载最新数据到实时缓存）
	log.Println("[1/5] 预热实时缓存...")
	s.preloadRealtimeCache(ctx)

	// 2. 检查股票列表完整性
	log.Println("[2/5] 检查股票列表...")
	s.checkAndSyncStockList(ctx)

	// 3. 检查K线数据完整性
	log.Println("[3/5] 检查K线数据完整性...")
	s.checkAndSyncKlines(ctx)

	// 4. 同步当日实时数据（如果是交易时间）
	log.Println("[4/5] 同步当日实时数据...")
	s.syncCurrentDayData(ctx)

	// 5. 验证数据完整性
	log.Println("[5/5] 验证数据完整性...")
	s.validateDataIntegrity(ctx)

	log.Println("========== 常规部署完成 ==========")
}

// firstTimeDeployment 首次部署（全量同步）
func (s *Scheduler) firstTimeDeployment() {
	ctx := context.Background()
	log.Println("========== 首次部署数据初始化 ==========")

	// 1. 全量同步股票列表
	log.Println("[1/4] 全量同步A股列表...")
	if err := s.stockService.SyncAndCache(ctx, "a"); err != nil {
		log.Printf("同步A股失败: %v", err)
	}

	log.Println("[2/4] 全量同步港股列表...")
	if err := s.stockService.SyncAndCache(ctx, "hk"); err != nil {
		log.Printf("同步港股失败: %v", err)
	}

	// 2. 同步近期历史K线（最近30天）
	log.Println("[3/4] 同步近期历史K线...")
	s.klineService.SyncAHistoryDataFull(ctx)
	s.klineService.SyncHKHistoryDataFull(ctx)

	// 3. 验证数据完整性
	log.Println("[4/4] 验证数据完整性...")
	s.validateDataIntegrity(ctx)

	log.Println("========== 首次部署完成 ==========")
}

// hotfixDeployment 紧急修复部署（快速启动）
func (s *Scheduler) hotfixDeployment() {
	ctx := context.Background()
	log.Println("========== 紧急修复快速启动 ==========")

	// 只做最基础的数据检查，快速启动
	s.preloadRealtimeCache(ctx)

	// 异步进行数据检查，不阻塞服务启动
	go func() {
		time.Sleep(30 * time.Second) // 等待服务稳定
		bgCtx := context.Background()
		s.checkAndSyncStockList(bgCtx)
		s.syncCurrentDayData(bgCtx)
	}()

	log.Println("========== 紧急修复启动完成 ==========")
}

// ============== 数据预热和检查 ==============

// preloadRealtimeCache 预热实时缓存
func (s *Scheduler) preloadRealtimeCache(ctx context.Context) {
	// 从数据库加载最新的股票数据到实时缓存
	// 这样用户访问时就不会看到空白页面

	// 加载A股最新数据
	if err := s.stockService.PreloadRealtimeCache(ctx, "a"); err != nil {
		log.Printf("预热A股缓存失败: %v", err)
	}

	// 加载港股最新数据
	if err := s.stockService.PreloadRealtimeCache(ctx, "hk"); err != nil {
		log.Printf("预热港股缓存失败: %v", err)
	}

	stats := s.stockService.GetRealtimeCacheStats()
	log.Printf("实时缓存预热完成: A股 %v只, 港股 %v只", stats["aCount"], stats["hkCount"])

	// 预热K线缓存（异步，不阻塞启动）
	go s.preloadKlineCache(ctx)
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

	// 验证缓存是否已初始化
	if klineCache.IsInitialized() {
		log.Printf("K线缓存已成功初始化")
	} else {
		log.Printf("警告: K线缓存初始化状态异常")
	}
}

// syncCurrentDayData 同步当日实时数据
func (s *Scheduler) syncCurrentDayData(ctx context.Context) {
	now := utils.GetChinaTime()

	// 如果是交易时间，立即同步一次实时数据
	if utils.IsAStockTradingTime(now) {
		log.Println("检测到A股交易时间，同步实时数据...")
		if err := s.stockService.UpdateRealtimeCache(ctx, "a"); err != nil {
			log.Printf("同步A股实时数据失败: %v", err)
		}
	}

	if utils.IsHKTradingTime(now) {
		log.Println("检测到港股交易时间，同步实时数据...")
		if err := s.stockService.UpdateRealtimeCache(ctx, "hk"); err != nil {
			log.Printf("同步港股实时数据失败: %v", err)
		}
	}

	// 如果是非交易时间，使用预热的缓存数据即可
	if !utils.IsTradingDay(now) || (!utils.IsAStockTradingTime(now) && !utils.IsHKTradingTime(now)) {
		log.Println("非交易时间，使用缓存数据")
	}
}

// validateDataIntegrity 验证数据完整性
func (s *Scheduler) validateDataIntegrity(ctx context.Context) {
	// 检查关键数据是否存在
	aCount, _ := s.stockService.CountByMarket(ctx, "a")
	hkCount, _ := s.stockService.CountByMarket(ctx, "hk")

	log.Printf("数据完整性检查: A股 %d只, 港股 %d只", aCount, hkCount)

	// 如果数据量异常少，发出警告
	if aCount < 3000 {
		log.Printf("警告: A股数量异常 (%d < 3000)", aCount)
	}
	if hkCount < 1000 {
		log.Printf("警告: 港股数量异常 (%d < 1000)", hkCount)
	}

	// 检查实时缓存是否正常
	if !s.stockService.IsRealtimeCacheHealthy() {
		log.Println("警告: 实时缓存未正常加载")
	} else {
		log.Println("实时缓存状态: 健康")
	}
}

// checkAndSyncStockList 检查并同步股票列表
func (s *Scheduler) checkAndSyncStockList(ctx context.Context) {
	now := utils.GetChinaTime()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	// 检查港股
	hkLastUpdate, err := s.stockService.GetLastUpdateTime(ctx, "hk")
	if err != nil || hkLastUpdate.Before(today) {
		log.Printf("[港股] 数据需要更新（上次更新: %v）", hkLastUpdate)
		if err := s.stockService.SyncAndCache(ctx, "hk"); err != nil {
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
		if err := s.stockService.SyncAndCache(ctx, "a"); err != nil {
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
				// 使用断点续传模式，跳过已同步的股票
				log.Printf("[A股] K线数据需要更新（最新: %s < %s），启动断点续传同步...", aLastDate, today)
				s.klineService.SyncAHistoryDataResume(bgCtx)
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
				// 使用断点续传模式，跳过已同步的股票
				log.Printf("[港股] K线数据需要更新（最新: %s < %s），启动断点续传同步...", hkLastDate, today)
				s.klineService.SyncHKHistoryDataResume(bgCtx)
			}
		} else {
			log.Printf("[港股] K线数据已是最新")
		}
	}()
}

// ============== 定时任务 ==============

// runScheduledTasks 运行定时任务
func (s *Scheduler) runScheduledTasks() {
	// 使用1秒的ticker实现更精细的时间控制
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			now := utils.GetChinaTime()

			// 历史K线同步 - 每天凌晨2点
			if now.Hour() == 2 && now.Minute() == 0 && now.Second() == 0 {
				go s.syncHistoryData()
			}

			// 缓存清理 - 每天凌晨3点
			if now.Hour() == 3 && now.Minute() == 0 && now.Second() == 0 {
				go s.cleanupOldCache()
			}
		}
	}
}

// shouldSyncRealtime 是否应该同步实时数据到内存
func (s *Scheduler) shouldSyncRealtime(now time.Time) bool {
	// 非交易日不同步
	if !utils.IsTradingDay(now) {
		return false
	}

	// 交易时间：每30秒同步一次
	if utils.IsAStockTradingTime(now) || utils.IsHKTradingTime(now) {
		return now.Second()%30 == 0
	}

	// 盘前盘后：每2分钟同步一次
	if s.isPrePostMarket(now) {
		return now.Minute()%2 == 0 && now.Second() == 0
	}

	// 其他时间：每30分钟同步一次
	return now.Minute()%30 == 0 && now.Second() == 0
}

// shouldPersistToDB 是否应该持久化到数据库
func (s *Scheduler) shouldPersistToDB(now time.Time) bool {
	// 收盘后30分钟：批量持久化当日数据
	// A股收盘后 15:30
	if now.Hour() == 15 && now.Minute() == 30 && now.Second() == 0 {
		return true
	}
	// 港股收盘后 16:30
	if now.Hour() == 16 && now.Minute() == 30 && now.Second() == 0 {
		return true
	}

	// 交易中：每10分钟持久化一次（防止数据丢失）
	if utils.IsAStockTradingTime(now) || utils.IsHKTradingTime(now) {
		return now.Minute()%10 == 0 && now.Second() == 0
	}

	// 非交易时间：每小时持久化一次
	return now.Minute() == 0 && now.Second() == 0
}

// isPrePostMarket 判断是否为盘前盘后时间
func (s *Scheduler) isPrePostMarket(now time.Time) bool {
	hour := now.Hour()
	minute := now.Minute()

	// 8:00-9:30 盘前
	if hour == 8 || (hour == 9 && minute < 30) {
		return true
	}

	// 11:30-13:00 午休
	if (hour == 11 && minute >= 30) || hour == 12 || (hour == 13 && minute == 0) {
		return true
	}

	// 15:00-17:00 盘后
	if hour >= 15 && hour < 17 {
		return true
	}

	return false
}

// syncRealtimeToMemory 同步实时数据到内存（高频，轻量）
func (s *Scheduler) syncRealtimeToMemory() {
	now := utils.GetChinaTime()
	log.Printf("[定时任务] 同步实时数据到内存 - %s", now.Format("15:04:05"))

	// 只更新内存缓存，不写数据库
	if utils.IsAStockTradingTime(now) {
		if err := s.stockService.UpdateRealtimeCacheOnly(context.Background(), "a"); err != nil {
			log.Printf("同步A股实时数据失败: %v", err)
		}
	}

	if utils.IsHKTradingTime(now) {
		if err := s.stockService.UpdateRealtimeCacheOnly(context.Background(), "hk"); err != nil {
			log.Printf("同步港股实时数据失败: %v", err)
		}
	}
}

// persistMemoryToDB 持久化内存数据到数据库（中频，重量）
func (s *Scheduler) persistMemoryToDB() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	log.Println("[定时任务] 持久化内存数据到数据库...")

	// 批量写入数据库
	if err := s.stockService.SyncToDatabase(ctx, "a"); err != nil {
		log.Printf("持久化A股数据失败: %v", err)
	}

	if err := s.stockService.SyncToDatabase(ctx, "hk"); err != nil {
		log.Printf("持久化港股数据失败: %v", err)
	}

	log.Println("[定时任务] 持久化完成")
}

// syncHistoryData 同步历史数据
func (s *Scheduler) syncHistoryData() {
	ctx := context.Background()
	log.Println("[定时任务] 开始增量同步历史K线...")

	if err := s.klineService.SyncAHistoryData(ctx); err != nil {
		log.Printf("增量同步A股K线失败: %v", err)
	}

	if err := s.klineService.SyncHKHistoryDataIncremental(ctx); err != nil {
		log.Printf("增量同步港股K线失败: %v", err)
	}
}

// cleanupOldCache 清理旧缓存
func (s *Scheduler) cleanupOldCache() {
	ctx := context.Background()
	deleted, err := s.rangeService.ClearOldCache(ctx)
	if err != nil {
		log.Printf("[定时任务] 清理旧缓存失败: %v", err)
	} else if deleted > 0 {
		log.Printf("[定时任务] 清理了 %d 条旧缓存", deleted)
	}
}

// ============== 手动同步接口 ==============

// ManualSync 手动同步
func (s *Scheduler) ManualSync(market string) error {
	ctx := context.Background()

	switch market {
	case "hk":
		return s.stockService.SyncAndCache(ctx, "hk")
	case "a":
		return s.stockService.SyncAndCache(ctx, "a")
	default:
		if err := s.stockService.SyncAndCache(ctx, "hk"); err != nil {
			return err
		}
		return s.stockService.SyncAndCache(ctx, "a")
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

// GetCacheStats 获取缓存统计信息
func (s *Scheduler) GetCacheStats() map[string]interface{} {
	return s.stockService.GetRealtimeCacheStats()
}

// ForcePreloadCache 强制预热缓存
func (s *Scheduler) ForcePreloadCache() error {
	ctx := context.Background()
	s.preloadRealtimeCache(ctx)
	return nil
}
