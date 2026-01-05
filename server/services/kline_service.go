package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"runtime"
	"server/models"
	"server/repositories"
	"server/utils"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// SyncProgress 同步进度
type SyncProgress struct {
	Market    string    `json:"market"`
	Status    string    `json:"status"` // idle, syncing, fetching, caching, saving, completed, failed, error
	Phase     string    `json:"phase"`  // 当前阶段描述
	Total     int       `json:"total"`
	Current   int       `json:"current"`
	Percent   int       `json:"percent"` // 百分比
	Success   int       `json:"success"`
	Failed    int       `json:"failed"`
	StartTime time.Time `json:"startTime"`
	UpdatedAt time.Time `json:"updatedAt"`
	Message   string    `json:"message"`
	Error     string    `json:"error,omitempty"`
}

// 全局同步进度和取消控制
var (
	syncProgressMu sync.RWMutex
	syncProgress   = map[string]*SyncProgress{
		"a":  {Market: "a", Status: "idle"},
		"hk": {Market: "hk", Status: "idle"},
	}
	// 取消函数映射
	syncCancelMu sync.RWMutex
	syncCancelFn = map[string]context.CancelFunc{}
)

// GetSyncProgress 获取同步进度
func GetSyncProgress(market string) *SyncProgress {
	syncProgressMu.RLock()
	defer syncProgressMu.RUnlock()
	if p, ok := syncProgress[market]; ok {
		return p
	}
	return &SyncProgress{Market: market, Status: "idle"}
}

// GetAllSyncProgress 获取所有同步进度
func GetAllSyncProgress() map[string]*SyncProgress {
	syncProgressMu.RLock()
	defer syncProgressMu.RUnlock()
	result := make(map[string]*SyncProgress)
	for k, v := range syncProgress {
		result[k] = v
	}
	return result
}

// updateSyncProgress 更新同步进度（用于K线同步）
func updateSyncProgress(market, status string, current, total, success, failed int, message string) {
	syncProgressMu.Lock()
	defer syncProgressMu.Unlock()

	p := syncProgress[market]
	if p == nil {
		p = &SyncProgress{Market: market}
		syncProgress[market] = p
	}

	// 如果已经被取消，不要覆盖 cancelled 状态
	if p.Status == "cancelled" {
		return
	}

	if status == "syncing" && p.Status != "syncing" {
		p.StartTime = time.Now()
	}

	p.Status = status
	p.Phase = message
	p.Total = total
	p.Current = current
	p.Success = success
	p.Failed = failed
	p.Message = message
	p.UpdatedAt = time.Now()

	// 计算百分比
	if total > 0 {
		p.Percent = current * 100 / total
	}
}

// UpdateStockSyncProgress 更新股票实时数据同步进度
func UpdateStockSyncProgress(market, status, phase string, current, total int, message string) {
	syncProgressMu.Lock()
	defer syncProgressMu.Unlock()

	p := syncProgress[market]
	if p == nil {
		p = &SyncProgress{Market: market}
		syncProgress[market] = p
	}

	// 如果已经被取消，不要覆盖 cancelled 状态
	if p.Status == "cancelled" {
		return
	}

	if (status == "fetching" || status == "syncing") && p.Status == "idle" {
		p.StartTime = time.Now()
	}

	p.Status = status
	p.Phase = phase
	p.Total = total
	p.Current = current
	p.Message = message
	p.UpdatedAt = time.Now()
	p.Error = ""

	// 计算百分比
	if total > 0 {
		p.Percent = current * 100 / total
	}
	if status == "completed" || status == "error" {
		p.Percent = 100
	}
}

// SetStockSyncError 设置股票同步错误
func SetStockSyncError(market string, err error) {
	syncProgressMu.Lock()
	defer syncProgressMu.Unlock()

	p := syncProgress[market]
	if p == nil {
		p = &SyncProgress{Market: market}
		syncProgress[market] = p
	}

	// 如果已经被取消，不要覆盖 cancelled 状态
	if p.Status == "cancelled" {
		return
	}

	p.Status = "error"
	p.Error = err.Error()
	p.UpdatedAt = time.Now()
}

// IsSyncing 检查是否正在同步
func IsSyncing(market string) bool {
	syncProgressMu.RLock()
	defer syncProgressMu.RUnlock()

	if p, ok := syncProgress[market]; ok {
		return p.Status != "idle" && p.Status != "completed" && p.Status != "failed" && p.Status != "error" && p.Status != "cancelled"
	}
	return false
}

// SetSyncCancel 设置同步取消函数
func SetSyncCancel(market string, cancel context.CancelFunc) {
	syncCancelMu.Lock()
	defer syncCancelMu.Unlock()
	syncCancelFn[market] = cancel
}

// ClearSyncCancel 清除同步取消函数
func ClearSyncCancel(market string) {
	syncCancelMu.Lock()
	defer syncCancelMu.Unlock()
	delete(syncCancelFn, market)
}

// CancelSync 取消同步
func CancelSync(market string) bool {
	syncCancelMu.Lock()
	cancel, ok := syncCancelFn[market]
	if ok {
		delete(syncCancelFn, market)
	}
	syncCancelMu.Unlock()

	if ok && cancel != nil {
		cancel()
		// 更新状态为已取消
		syncProgressMu.Lock()
		if p, exists := syncProgress[market]; exists {
			p.Status = "cancelled"
			p.Phase = "已取消"
			p.Message = "用户取消了同步"
			p.UpdatedAt = time.Now()
		}
		syncProgressMu.Unlock()
		log.Printf("[CancelSync] %s 同步已取消", market)
		return true
	}
	return false
}

// ResetSyncStatus 重置同步状态为idle
func ResetSyncStatus(market string) {
	syncProgressMu.Lock()
	defer syncProgressMu.Unlock()
	if p, ok := syncProgress[market]; ok {
		p.Status = "idle"
		p.Phase = ""
		p.Message = ""
		p.Error = ""
		p.Current = 0
		p.Total = 0
		p.Percent = 0
		p.Success = 0
		p.Failed = 0
	}
}

// KlineService K线服务
type KlineService struct {
	klineRepo  *repositories.KlineRepository
	stockRepo  *repositories.StockRepository
	klineCache *repositories.KlineCache
}

// NewKlineService 创建K线服务
func NewKlineService() *KlineService {
	return &KlineService{
		klineRepo:  repositories.NewKlineRepository(),
		stockRepo:  repositories.NewStockRepository(),
		klineCache: repositories.GetKlineCache(),
	}
}

// GetKlinesBySymbol 获取股票K线数据
// 从内存缓存读取，不再从数据库读取
func (s *KlineService) GetKlinesBySymbol(ctx context.Context, symbol, market, startDate, endDate string) ([]models.StockKline, error) {
	// 从内存缓存读取
	if s.klineCache.IsInitialized() {
		klines, ok := s.klineCache.Get(symbol, market, startDate, endDate)
		if ok {
			return klines, nil
		}
	}

	// 如果缓存未初始化或未找到，返回空结果
	return []models.StockKline{}, nil
}

// FetchAndSaveKlines 获取并保存K线数据
// 同时更新内存缓存和数据库
func (s *KlineService) FetchAndSaveKlines(ctx context.Context, symbol, market, startDate, endDate string) error {
	klines, err := s.fetchKlineFromAPI(symbol, market, startDate, endDate)
	if err != nil {
		return err
	}

	if len(klines) == 0 {
		return nil
	}

	// 更新内存缓存
	s.klineCache.Set(symbol, market, klines)

	// 同时写入数据库（用于持久化）
	return s.klineRepo.UpsertKlines(ctx, klines, market)
}

// PreloadKlineCache 从数据库加载K线数据到内存缓存
func (s *KlineService) PreloadKlineCache(ctx context.Context, symbol, market string) error {
	// 从数据库读取K线数据
	klines, err := s.klineRepo.GetKlinesBySymbol(ctx, symbol, market, "", "")
	if err != nil {
		return err
	}

	if len(klines) > 0 {
		// 更新内存缓存
		s.klineCache.Set(symbol, market, klines)
	}

	return nil
}

// fetchKlineFromAPI 从API获取K线数据
func (s *KlineService) fetchKlineFromAPI(symbol, market, startDate, endDate string) ([]models.StockKline, error) {
	var secid string
	if market == "a" {
		if strings.HasPrefix(symbol, "6") {
			secid = "1." + symbol
		} else {
			secid = "0." + symbol
		}
	} else {
		secid = "116." + symbol
	}

	params := url.Values{}
	params.Set("secid", secid)
	params.Set("fields1", "f1,f2,f3,f4,f5,f6")
	params.Set("fields2", "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61")
	params.Set("klt", "101") // 日K
	params.Set("fqt", "1")   // 前复权
	params.Set("beg", strings.ReplaceAll(startDate, "-", ""))
	params.Set("end", strings.ReplaceAll(endDate, "-", ""))

	apiURL := "https://push2his.eastmoney.com/api/qt/stock/kline/get?" + params.Encode()
	body, err := utils.FetchURL(apiURL)
	if err != nil {
		return nil, err
	}

	var resp struct {
		Data struct {
			Klines []string `json:"klines"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, err
	}

	var klines []models.StockKline
	for _, line := range resp.Data.Klines {
		parts := strings.Split(line, ",")
		if len(parts) < 11 {
			continue
		}

		kline := models.StockKline{
			Symbol:       symbol,
			Date:         parts[0],
			Open:         parseFloat(parts[1]),
			Close:        parseFloat(parts[2]),
			High:         parseFloat(parts[3]),
			Low:          parseFloat(parts[4]),
			Volume:       parseInt64(parts[5]),
			Turnover:     parseFloat(parts[6]),
			Amplitude:    parseFloat(parts[7]),
			ChangePct:    parseFloat(parts[8]),
			ChangeAmt:    parseFloat(parts[9]),
			TurnoverRate: parseFloat(parts[10]),
		}
		klines = append(klines, kline)
	}

	return klines, nil
}

// SyncHKHistoryData 智能同步港股历史K线数据
// 根据实际缺失天数决定同步范围
func (s *KlineService) SyncHKHistoryData(ctx context.Context) error {
	return s.syncHistoryDataSmart(ctx, "hk")
}

// SyncAHistoryData 智能同步A股历史K线数据
// 根据实际缺失天数决定同步范围
func (s *KlineService) SyncAHistoryData(ctx context.Context) error {
	return s.syncHistoryDataSmart(ctx, "a")
}

// syncHistoryDataSmart 智能同步历史K线数据
// 根据最新K线日期与今天的差距决定同步范围
func (s *KlineService) syncHistoryDataSmart(ctx context.Context, market string) error {
	marketName := "港股"
	if market == "a" {
		marketName = "A股"
	}

	// 获取全局最新K线日期
	latestDate, err := s.klineRepo.GetGlobalLatestKlineDate(ctx, market)
	if err != nil {
		// 无数据，需要全量同步
		log.Printf("[%s] 无K线数据，启动后台全量同步...", marketName)
		return s.syncFullData(ctx, market, false)
	}

	// 计算缺失天数
	missingDays := s.calculateMissingDays(latestDate)
	log.Printf("[%s] 最新K线日期: %s, 缺失约 %d 个交易日", marketName, latestDate, missingDays)

	if missingDays <= 0 {
		log.Printf("[%s] K线数据已是最新，无需同步", marketName)
		return nil
	}

	// 根据缺失天数决定同步范围（多同步几天以确保覆盖）
	syncDays := missingDays + 3 // 多同步3天作为缓冲
	if syncDays > 365 {
		// 如果缺失超过一年，执行断点续传同步
		log.Printf("[%s] 缺失超过一年，启动断点续传同步...", marketName)
		return s.syncFullData(ctx, market, true)
	}

	log.Printf("[%s] 启动增量同步（最近 %d 天）...", marketName, syncDays)
	return s.syncIncrementalData(ctx, market, syncDays)
}

// calculateMissingDays 计算缺失的交易日天数
func (s *KlineService) calculateMissingDays(latestDateStr string) int {
	// 解析最新K线日期
	latestDate, err := time.Parse("2006-01-02", latestDateStr)
	if err != nil {
		return 365 // 解析失败，返回较大值触发全量同步
	}

	now := utils.GetChinaTime()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	// 计算自然日差距
	daysDiff := int(today.Sub(latestDate).Hours() / 24)

	// 粗略估算交易日（约70%是交易日，考虑周末和节假日）
	tradingDays := int(float64(daysDiff) * 0.7)

	// 如果是当天或前一天，检查是否需要更新
	if daysDiff <= 1 {
		// 如果今天是交易日且已收盘，需要更新1天
		if utils.IsTradingDay(now) && now.Hour() >= 16 {
			return 1
		}
		return 0
	}

	return tradingDays
}

// SyncHKHistoryDataIncremental 增量同步港股历史K线（最近7天）
func (s *KlineService) SyncHKHistoryDataIncremental(ctx context.Context) error {
	return s.syncIncrementalData(ctx, "hk", 7)
}

// SyncAHistoryDataIncremental 增量同步A股历史K线（最近7天）
func (s *KlineService) SyncAHistoryDataIncremental(ctx context.Context) error {
	return s.syncIncrementalData(ctx, "a", 7)
}

// syncIncrementalData 增量同步K线数据（并发版本）
func (s *KlineService) syncIncrementalData(ctx context.Context, market string, days int) error {
	// 从内存缓存获取股票列表
	stockService := NewStockService()
	stocks, err := stockService.GetStocksByMarketWithCache(ctx, market)
	if err != nil {
		return err
	}

	limit := len(stocks)
	if limit > 50000 {
		limit = 50000
	}
	if market == "a" && limit > 10000 {
		limit = 10000
	}
	stocks = stocks[:limit]

	total := len(stocks)
	marketName := "港股"
	if market == "a" {
		marketName = "A股"
	}

	log.Printf("开始增量同步 %d 只%s的K线数据（最近%d天）", total, marketName, days)
	UpdateStockSyncProgress(market, "syncing_kline", fmt.Sprintf("开始增量同步%sK线...", marketName), 85, 100, fmt.Sprintf("共 %d 只股票", total))

	endDate := time.Now().Format("2006-01-02")
	startDate := time.Now().AddDate(0, 0, -days).Format("2006-01-02")

	// 并发控制 - 增量同步用20个并发worker（适配2核2G）
	const workerCount = 20
	var wg sync.WaitGroup
	stockChan := make(chan models.StockData, workerCount*2)

	var successCount, failedCount, processedCount int64
	var cancelled int32 // 取消标志

	// 启动worker
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer runtime.GC() // 主动GC，释放内存
			for stock := range stockChan {
				// 检查是否被取消
				if atomic.LoadInt32(&cancelled) == 1 {
					continue // 消费完channel但不处理
				}
				select {
				case <-ctx.Done():
					atomic.StoreInt32(&cancelled, 1)
					continue
				default:
				}

				if err := s.FetchAndSaveKlines(ctx, stock.Symbol, market, startDate, endDate); err != nil {
					atomic.AddInt64(&failedCount, 1)
				} else {
					atomic.AddInt64(&successCount, 1)
				}
				current := atomic.AddInt64(&processedCount, 1)

				// 每500只或最后一批更新进度（取消后不再更新）
				if atomic.LoadInt32(&cancelled) == 0 && (current%500 == 0 || current == int64(total)) {
					success := atomic.LoadInt64(&successCount)
					failed := atomic.LoadInt64(&failedCount)
					// K线同步占 85-99%
					percent := 85 + int(float64(current)/float64(total)*14)
					msg := fmt.Sprintf("%sK线增量同步 %d/%d", marketName, current, total)
					UpdateStockSyncProgress(market, "syncing_kline", msg, percent, 100, fmt.Sprintf("成功:%d 失败:%d", success, failed))
					log.Printf("%s增量同步 %d/%d (成功:%d 失败:%d)", marketName, current, total, success, failed)
				}
				time.Sleep(10 * time.Millisecond) // 增加间隔，防止接口限流
			}
		}()
	}

	// 发送任务（支持取消）
sendLoop:
	for _, stock := range stocks {
		select {
		case <-ctx.Done():
			log.Printf("[%s] 同步被取消，停止发送任务", marketName)
			break sendLoop
		case stockChan <- stock:
		}
	}
	close(stockChan)

	// 等待完成
	wg.Wait()

	// 检查是否被取消
	if ctx.Err() != nil {
		log.Printf("%sK线同步被取消", marketName)
		return ctx.Err()
	}

	success := atomic.LoadInt64(&successCount)
	failed := atomic.LoadInt64(&failedCount)
	log.Printf("%sK线增量同步完成，成功 %d/%d，失败 %d", marketName, success, total, failed)
	// 不设置 completed，由调用方统一管理
	return nil
}

// SyncHKHistoryDataFull 强制全量同步港股历史K线
func (s *KlineService) SyncHKHistoryDataFull(ctx context.Context) error {
	return s.syncFullData(ctx, "hk", false)
}

// SyncAHistoryDataFull 强制全量同步A股历史K线
func (s *KlineService) SyncAHistoryDataFull(ctx context.Context) error {
	return s.syncFullData(ctx, "a", false)
}

// SyncHKHistoryDataResume 断点续传同步港股历史K线
func (s *KlineService) SyncHKHistoryDataResume(ctx context.Context) error {
	return s.syncFullData(ctx, "hk", true)
}

// SyncAHistoryDataResume 断点续传同步A股历史K线
func (s *KlineService) SyncAHistoryDataResume(ctx context.Context) error {
	return s.syncFullData(ctx, "a", true)
}

// syncFullData 全量同步K线数据（支持断点续传）
// resume: true表示断点续传（跳过已同步的股票），false表示强制全量
func (s *KlineService) syncFullData(ctx context.Context, market string, resume bool) error {
	// 从内存缓存获取股票列表
	stockService := NewStockService()
	stocks, err := stockService.GetStocksByMarketWithCache(ctx, market)
	if err != nil {
		UpdateStockSyncProgress(market, "error", "获取股票列表失败", 0, 100, err.Error())
		return err
	}

	limit := len(stocks)
	if limit > 50000 {
		limit = 50000
	}
	if market == "a" && limit > 10000 {
		limit = 10000
	}
	stocks = stocks[:limit]

	marketName := "港股"
	if market == "a" {
		marketName = "A股"
	}

	endDate := time.Now().Format("2006-01-02")
	startDate := "2006-01-01"

	// 断点续传：获取已同步的股票列表
	var syncedSymbols map[string]bool
	var pendingStocks []models.StockData

	if resume {
		log.Printf("[%s] 断点续传模式，检查已同步的股票...", marketName)
		UpdateStockSyncProgress(market, "syncing_kline", "检查已同步数据...", 85, 100, "断点续传准备中")

		syncedSymbols, err = s.klineRepo.GetSyncedSymbols(ctx, market, startDate)
		if err != nil {
			log.Printf("[%s] 获取已同步股票列表失败: %v，将进行全量同步", marketName, err)
			syncedSymbols = make(map[string]bool)
		}

		// 过滤出未同步的股票
		for _, stock := range stocks {
			if !syncedSymbols[stock.Symbol] {
				pendingStocks = append(pendingStocks, stock)
			}
		}

		log.Printf("[%s] 断点续传: 总共 %d 只，已同步 %d 只，待同步 %d 只",
			marketName, len(stocks), len(syncedSymbols), len(pendingStocks))

		if len(pendingStocks) == 0 {
			log.Printf("[%s] 所有股票K线已同步完成", marketName)
			return nil
		}
	} else {
		pendingStocks = stocks
	}

	total := len(pendingStocks)
	alreadySynced := len(stocks) - total

	log.Printf("开始同步 %d 只%s的历史K线数据（已跳过 %d 只）", total, marketName, alreadySynced)
	UpdateStockSyncProgress(market, "syncing_kline", fmt.Sprintf("开始同步%sK线...", marketName), 85, 100,
		fmt.Sprintf("待同步 %d 只，已跳过 %d 只", total, alreadySynced))

	// 并发控制 - 全量同步用15个并发worker（适配2核2G）
	const workerCount = 15
	var wg sync.WaitGroup
	stockChan := make(chan models.StockData, workerCount*2)

	var successCount, failedCount, processedCount int64
	var cancelled int32 // 取消标志

	// 启动worker
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer runtime.GC() // 主动GC，释放内存
			for stock := range stockChan {
				// 检查是否被取消
				if atomic.LoadInt32(&cancelled) == 1 {
					continue // 消费完channel但不处理
				}
				select {
				case <-ctx.Done():
					atomic.StoreInt32(&cancelled, 1)
					continue
				default:
				}

				if err := s.FetchAndSaveKlines(ctx, stock.Symbol, market, startDate, endDate); err != nil {
					atomic.AddInt64(&failedCount, 1)
				} else {
					atomic.AddInt64(&successCount, 1)
				}
				current := atomic.AddInt64(&processedCount, 1)

				// 每100只或最后一批更新进度（取消后不再更新）
				if atomic.LoadInt32(&cancelled) == 0 && (current%100 == 0 || current == int64(total)) {
					success := atomic.LoadInt64(&successCount)
					failed := atomic.LoadInt64(&failedCount)
					// K线同步占 85-99%
					percent := 85 + int(float64(current)/float64(total)*14)
					msg := fmt.Sprintf("%sK线同步 %d/%d", marketName, current, total)
					UpdateStockSyncProgress(market, "syncing_kline", msg, percent, 100,
						fmt.Sprintf("成功:%d 失败:%d 跳过:%d", success, failed, alreadySynced))
					log.Printf("同步 %d/%d 只%s (成功:%d 失败:%d 跳过:%d)",
						current, total, marketName, success, failed, alreadySynced)
				}
				time.Sleep(15 * time.Millisecond) // 增加间隔，防止接口限流
			}
		}()
	}

	// 发送任务（支持取消）
sendLoop:
	for _, stock := range pendingStocks {
		select {
		case <-ctx.Done():
			log.Printf("[%s] 同步被取消，停止发送任务", marketName)
			break sendLoop
		case stockChan <- stock:
		}
	}
	close(stockChan)

	// 等待完成
	wg.Wait()

	// 检查是否被取消
	if ctx.Err() != nil {
		log.Printf("%sK线同步被取消", marketName)
		return ctx.Err()
	}

	success := atomic.LoadInt64(&successCount)
	failed := atomic.LoadInt64(&failedCount)
	log.Printf("%sK线同步完成，成功 %d/%d，失败 %d，跳过 %d", marketName, success, total, failed, alreadySynced)
	// 不设置 completed，由调用方统一管理
	return nil
}

// GetLatestKlineDate 获取最新K线日期
func (s *KlineService) GetLatestKlineDate(ctx context.Context, symbol, market string) (string, error) {
	return s.klineRepo.GetLatestKlineDate(ctx, symbol, market)
}

// CountKlines 统计K线数量
func (s *KlineService) CountKlines(ctx context.Context) (int64, error) {
	hkCount, _ := s.klineRepo.CountKlines(ctx, "hk")
	aCount, _ := s.klineRepo.CountKlines(ctx, "a")
	return hkCount + aCount, nil
}

// CountKlinesByMarket 统计指定市场的K线数量
func (s *KlineService) CountKlinesByMarket(ctx context.Context, market string) (int64, error) {
	return s.klineRepo.CountKlines(ctx, market)
}

// GetLastKlineDate 获取最后一条K线的日期
func (s *KlineService) GetLastKlineDate(ctx context.Context, market string) (string, error) {
	return s.klineRepo.GetLastKlineDate(ctx, market)
}

// GetAllSymbols 获取所有有K线数据的股票代码
func (s *KlineService) GetAllSymbols(ctx context.Context, market string) ([]string, error) {
	return s.klineRepo.GetAllSymbols(ctx, market)
}

// CalculateRangeByAggregation 使用聚合计算区间涨幅
// 直接从数据库查询
func (s *KlineService) CalculateRangeByAggregation(ctx context.Context, startDate, endDate, market string) ([]repositories.RangeAggregationResult, error) {
	// 标准化日期格式
	startDate = normalizeDateForKline(startDate)
	endDate = normalizeDateForKline(endDate)
	
	log.Printf("[CalculateRangeByAggregation] 查询区间: %s ~ %s, market=%s", startDate, endDate, market)
	
	// 直接从数据库查询
	results, err := s.klineRepo.CalculateRangeByAggregation(ctx, startDate, endDate, market)
	if err != nil {
		log.Printf("[CalculateRangeByAggregation] 数据库查询失败: %v", err)
		return nil, err
	}
	log.Printf("[CalculateRangeByAggregation] 查询结果: %d 条", len(results))
	return results, nil
}

// normalizeDateForKline 标准化K线日期格式
func normalizeDateForKline(date string) string {
	// 如果已经是标准格式 (YYYY-MM-DD)，直接返回
	if len(date) == 10 && date[4] == '-' && date[7] == '-' {
		return date
	}
	// 如果是8位数字格式 (YYYYMMDD)，转换为标准格式
	if len(date) == 8 {
		return date[:4] + "-" + date[4:6] + "-" + date[6:]
	}
	// 其他格式直接返回
	return date
}

// FetchStockHistory 获取历史K线数据（用于API返回）
func (s *KlineService) FetchStockHistory(symbol, market, period, adjust, startDate, endDate string) ([]map[string]any, error) {
	var secid string
	if market == "a" {
		if strings.HasPrefix(symbol, "6") {
			secid = "1." + symbol
		} else {
			secid = "0." + symbol
		}
	} else {
		secid = "116." + symbol
	}

	// 周期映射
	kltMap := map[string]string{
		"daily":   "101",
		"weekly":  "102",
		"monthly": "103",
	}
	klt := kltMap[period]
	if klt == "" {
		klt = "101"
	}

	// 复权映射
	fqtMap := map[string]string{
		"qfq": "1",
		"hfq": "2",
		"":    "0",
	}
	fqt := fqtMap[adjust]
	if fqt == "" {
		fqt = "0"
	}

	params := url.Values{}
	params.Set("secid", secid)
	params.Set("fields1", "f1,f2,f3,f4,f5,f6")
	params.Set("fields2", "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61")
	params.Set("klt", klt)
	params.Set("fqt", fqt)
	params.Set("beg", strings.ReplaceAll(startDate, "-", ""))
	params.Set("end", strings.ReplaceAll(endDate, "-", ""))

	apiURL := "https://push2his.eastmoney.com/api/qt/stock/kline/get?" + params.Encode()
	body, err := utils.FetchURL(apiURL)
	if err != nil {
		return nil, err
	}

	var resp struct {
		Data struct {
			Code   string   `json:"code"`
			Name   string   `json:"name"`
			Klines []string `json:"klines"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, err
	}

	var result []map[string]any
	for _, line := range resp.Data.Klines {
		parts := strings.Split(line, ",")
		if len(parts) < 11 {
			continue
		}

		item := map[string]any{
			"date":         parts[0],
			"open":         parseFloat(parts[1]),
			"close":        parseFloat(parts[2]),
			"high":         parseFloat(parts[3]),
			"low":          parseFloat(parts[4]),
			"volume":       parseInt64(parts[5]),
			"turnover":     parseFloat(parts[6]),
			"amplitude":    parseFloat(parts[7]),
			"changePct":    parseFloat(parts[8]),
			"changeAmt":    parseFloat(parts[9]),
			"turnoverRate": parseFloat(parts[10]),
		}
		result = append(result, item)
	}

	return result, nil
}

// GetStockDetailWithIndicators 获取股票详情和技术指标
// 从内存缓存读取，不再从数据库读取
func (s *KlineService) GetStockDetailWithIndicators(ctx context.Context, symbol, market string) (*models.StockData, error) {
	// 获取基础数据（从实时缓存）
	stockService := NewStockService()
	stock, err := stockService.GetStockBySymbol(ctx, symbol, market)
	if err != nil {
		return nil, err
	}

	// 获取历史K线计算指标（从K线缓存）
	endDate := time.Now().Format("2006-01-02")
	startDate := time.Now().AddDate(0, -3, 0).Format("2006-01-02")
	klines, err := s.GetKlinesBySymbol(ctx, symbol, market, startDate, endDate)
	if err != nil || len(klines) < 26 {
		return stock, nil
	}

	// 提取价格序列
	highs := make([]float64, len(klines))
	lows := make([]float64, len(klines))
	closes := make([]float64, len(klines))
	for i, k := range klines {
		highs[i] = k.High
		lows[i] = k.Low
		closes[i] = k.Close
	}

	// 计算指标
	stock.KDJ = utils.CalcKDJ(highs, lows, closes, 9)
	stock.MACD = utils.CalcMACD(closes, 12, 26, 9)

	return stock, nil
}

// FetchStockDetailFromAPI 从API获取股票详情
func (s *KlineService) FetchStockDetailFromAPI(symbol, market string) (*models.StockData, error) {
	var secid string
	if market == "a" {
		if strings.HasPrefix(symbol, "6") {
			secid = "1." + symbol
		} else {
			secid = "0." + symbol
		}
	} else {
		secid = "116." + symbol
	}

	params := url.Values{}
	params.Set("secid", secid)
	params.Set("fields", "f43,f44,f45,f46,f47,f48,f50,f51,f52,f55,f57,f58,f60,f115,f116,f117,f162,f167,f168,f169,f170")

	apiURL := "https://push2.eastmoney.com/api/qt/stock/get?" + params.Encode()
	body, err := utils.FetchURL(apiURL)
	if err != nil {
		return nil, err
	}

	var resp struct {
		Data map[string]any `json:"data"`
	}

	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, err
	}

	if resp.Data == nil {
		return nil, fmt.Errorf("stock not found")
	}

	stock := &models.StockData{
		Symbol:         symbol,
		Market:         market,
		Name:           getString(resp.Data, "f58"),
		LatestPrice:    getFloat(resp.Data, "f43") / 100,
		High:           getFloat(resp.Data, "f44") / 100,
		Low:            getFloat(resp.Data, "f45") / 100,
		Open:           getFloat(resp.Data, "f46") / 100,
		Volume:         getInt64(resp.Data, "f47"),
		Turnover:       getFloat(resp.Data, "f48"),
		TurnoverRate:   getFloat(resp.Data, "f168"),
		Amplitude:      getFloat(resp.Data, "f52"),
		ChangePct:      getFloat(resp.Data, "f170"),
		ChangeAmt:      getFloat(resp.Data, "f169") / 100,
		TotalMarketCap: getFloat(resp.Data, "f116"),
		CircMarketCap:  getFloat(resp.Data, "f117"),
		PERatio:        getFloat(resp.Data, "f162"), // 动态市盈率(TTM)
		PERatioStatic:  getFloat(resp.Data, "f115"), // 静态市盈率(LYR)
		PBRatio:        getFloat(resp.Data, "f167"),
		UpdatedAt:      time.Now(),
	}

	return stock, nil
}

// 辅助函数
func getString2(m map[string]any, key string) string {
	if v, ok := m[key]; ok {
		switch val := v.(type) {
		case string:
			return val
		case float64:
			return strconv.FormatFloat(val, 'f', -1, 64)
		}
	}
	return ""
}

// DeleteAllKlines 清空指定市场的所有K线数据
func (s *KlineService) DeleteAllKlines(ctx context.Context, market string) (int64, error) {
	return s.klineRepo.DeleteAllKlines(ctx, market)
}

// DeleteKlinesByDateRange 删除指定日期范围的K线数据
func (s *KlineService) DeleteKlinesByDateRange(ctx context.Context, market, startDate, endDate string) (int64, error) {
	// 标准化日期格式
	startDate = normalizeDateForKline(startDate)
	endDate = normalizeDateForKline(endDate)
	return s.klineRepo.DeleteKlinesByDateRange(ctx, market, startDate, endDate)
}

// GetKlineDateRange 获取K线数据的日期范围
func (s *KlineService) GetKlineDateRange(ctx context.Context, market string) (minDate, maxDate string, count int64, err error) {
	return s.klineRepo.GetKlineDateRange(ctx, market)
}

// SyncKlinesByDateRange 按日期范围同步K线数据
func (s *KlineService) SyncKlinesByDateRange(ctx context.Context, market, startDate, endDate string) error {
	// 标准化日期格式
	startDate = normalizeDateForKline(startDate)
	endDate = normalizeDateForKline(endDate)

	marketName := "A股"
	if market == "hk" {
		marketName = "港股"
	}

	log.Printf("[SyncKlinesByDateRange] 开始同步%s K线数据，日期范围: %s ~ %s", marketName, startDate, endDate)

	// 从内存缓存获取股票列表
	stockService := NewStockService()
	stocks, err := stockService.GetStocksByMarketWithCache(ctx, market)
	if err != nil {
		log.Printf("[SyncKlinesByDateRange] 获取股票列表失败: %v", err)
		return err
	}

	// 限制数量
	limit := len(stocks)
	if limit > 50000 {
		limit = 50000
	}
	if market == "a" && limit > 10000 {
		limit = 10000
	}
	stocks = stocks[:limit]

	total := len(stocks)
	log.Printf("[SyncKlinesByDateRange] 共 %d 只股票需要同步", total)

	// 并发控制 - 使用20个并发worker
	const workerCount = 20
	var wg sync.WaitGroup
	stockChan := make(chan models.StockData, workerCount*2)

	var successCount, failedCount, processedCount int64
	var cancelled int32

	// 启动worker
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for stock := range stockChan {
				if atomic.LoadInt32(&cancelled) == 1 {
					continue
				}
				select {
				case <-ctx.Done():
					atomic.StoreInt32(&cancelled, 1)
					continue
				default:
				}

				// 转换日期格式为 API 需要的格式 YYYYMMDD
				apiStartDate := strings.ReplaceAll(startDate, "-", "")
				apiEndDate := strings.ReplaceAll(endDate, "-", "")

				if err := s.FetchAndSaveKlines(ctx, stock.Symbol, market, apiStartDate, apiEndDate); err != nil {
					atomic.AddInt64(&failedCount, 1)
				} else {
					atomic.AddInt64(&successCount, 1)
				}

				// 更新进度
				current := int(atomic.AddInt64(&processedCount, 1))
				percent := current * 100 / total
				updateSyncProgress(market, "syncing_kline", current, total, int(successCount), int(failedCount),
					fmt.Sprintf("正在同步%sK线 (%d/%d)", marketName, current, total))
				UpdateStockSyncProgress(market, "syncing_kline", fmt.Sprintf("正在同步%sK线", marketName), percent, 100,
					fmt.Sprintf("%d/%d 成功:%d 失败:%d", current, total, atomic.LoadInt64(&successCount), atomic.LoadInt64(&failedCount)))
			}
		}()
	}

	// 发送任务
	for _, stock := range stocks {
		if ctx.Err() != nil {
			atomic.StoreInt32(&cancelled, 1)
			break
		}
		stockChan <- stock
	}
	close(stockChan)

	wg.Wait()

	if atomic.LoadInt32(&cancelled) == 1 {
		log.Printf("[SyncKlinesByDateRange] %s K线同步已取消", marketName)
		return ctx.Err()
	}

	log.Printf("[SyncKlinesByDateRange] %s K线同步完成，成功: %d, 失败: %d", marketName, successCount, failedCount)
	return nil
}
