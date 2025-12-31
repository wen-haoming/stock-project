package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
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
	Status    string    `json:"status"`  // idle, syncing, fetching, caching, saving, completed, failed, error
	Phase     string    `json:"phase"`   // 当前阶段描述
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

// 全局同步进度
var (
	syncProgressMu sync.RWMutex
	syncProgress   = map[string]*SyncProgress{
		"a":  {Market: "a", Status: "idle"},
		"hk": {Market: "hk", Status: "idle"},
	}
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

	p.Status = "error"
	p.Error = err.Error()
	p.UpdatedAt = time.Now()
}

// IsSyncing 检查是否正在同步
func IsSyncing(market string) bool {
	syncProgressMu.RLock()
	defer syncProgressMu.RUnlock()

	if p, ok := syncProgress[market]; ok {
		return p.Status != "idle" && p.Status != "completed" && p.Status != "failed" && p.Status != "error"
	}
	return false
}

// KlineService K线服务
type KlineService struct {
	klineRepo *repositories.KlineRepository
	stockRepo *repositories.StockRepository
}

// NewKlineService 创建K线服务
func NewKlineService() *KlineService {
	return &KlineService{
		klineRepo: repositories.NewKlineRepository(),
		stockRepo: repositories.NewStockRepository(),
	}
}

// GetKlinesBySymbol 获取股票K线数据
func (s *KlineService) GetKlinesBySymbol(ctx context.Context, symbol, market, startDate, endDate string) ([]models.StockKline, error) {
	return s.klineRepo.GetKlinesBySymbol(ctx, symbol, market, startDate, endDate)
}

// FetchAndSaveKlines 获取并保存K线数据
func (s *KlineService) FetchAndSaveKlines(ctx context.Context, symbol, market, startDate, endDate string) error {
	klines, err := s.fetchKlineFromAPI(symbol, market, startDate, endDate)
	if err != nil {
		return err
	}

	if len(klines) == 0 {
		return nil
	}

	return s.klineRepo.UpsertKlines(ctx, klines, market)
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
		return s.syncFullData(ctx, market)
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
		// 如果缺失超过一年，执行全量同步
		log.Printf("[%s] 缺失超过一年，启动全量同步...", marketName)
		return s.syncFullData(ctx, market)
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
	limit := 50000
	if market == "a" {
		limit = 10000
	}

	stocks, err := s.stockRepo.GetStocksByMarket(ctx, market, limit, 0)
	if err != nil {
		return err
	}

	total := len(stocks)
	marketName := "港股"
	if market == "a" {
		marketName = "A股"
	}

	log.Printf("开始增量同步 %d 只%s的K线数据（最近%d天）", total, marketName, days)
	UpdateStockSyncProgress(market, "syncing_kline", fmt.Sprintf("开始增量同步%sK线...", marketName), 85, 100, fmt.Sprintf("共 %d 只股票", total))

	endDate := time.Now().Format("2006-01-02")
	startDate := time.Now().AddDate(0, 0, -days).Format("2006-01-02")

	// 并发控制
	const workerCount = 10 // 10个并发worker
	var wg sync.WaitGroup
	stockChan := make(chan models.StockData, workerCount*2)

	var successCount, failedCount, processedCount int64

	// 启动worker
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for stock := range stockChan {
				if err := s.FetchAndSaveKlines(ctx, stock.Symbol, market, startDate, endDate); err != nil {
					atomic.AddInt64(&failedCount, 1)
				} else {
					atomic.AddInt64(&successCount, 1)
				}
				current := atomic.AddInt64(&processedCount, 1)

				// 每500只更新一次进度
				if current%500 == 0 {
					success := atomic.LoadInt64(&successCount)
					failed := atomic.LoadInt64(&failedCount)
					// K线同步占 85-99%
					percent := 85 + int(float64(current)/float64(total)*14)
					msg := fmt.Sprintf("%sK线增量同步 %d/%d", marketName, current, total)
					UpdateStockSyncProgress(market, "syncing_kline", msg, percent, 100, fmt.Sprintf("成功:%d 失败:%d", success, failed))
					log.Printf("%s增量同步 %d/%d (成功:%d 失败:%d)", marketName, current, total, success, failed)
				}

				time.Sleep(10 * time.Millisecond) // 每个worker稍微延迟，避免API限流
			}
		}()
	}

	// 发送任务
	for _, stock := range stocks {
		stockChan <- stock
	}
	close(stockChan)

	// 等待完成
	wg.Wait()

	success := atomic.LoadInt64(&successCount)
	failed := atomic.LoadInt64(&failedCount)
	log.Printf("%sK线增量同步完成，成功 %d/%d，失败 %d", marketName, success, total, failed)
	// 不设置 completed，由调用方统一管理
	return nil
}

// SyncHKHistoryDataFull 强制全量同步港股历史K线
func (s *KlineService) SyncHKHistoryDataFull(ctx context.Context) error {
	return s.syncFullData(ctx, "hk")
}

// SyncAHistoryDataFull 强制全量同步A股历史K线
func (s *KlineService) SyncAHistoryDataFull(ctx context.Context) error {
	return s.syncFullData(ctx, "a")
}

// syncFullData 强制全量同步K线数据（并发版本）
func (s *KlineService) syncFullData(ctx context.Context, market string) error {
	limit := 50000
	if market == "a" {
		limit = 10000
	}

	stocks, err := s.stockRepo.GetStocksByMarket(ctx, market, limit, 0)
	if err != nil {
		UpdateStockSyncProgress(market, "error", "获取股票列表失败", 0, 100, err.Error())
		return err
	}

	total := len(stocks)
	marketName := "港股"
	if market == "a" {
		marketName = "A股"
	}

	log.Printf("开始全量同步 %d 只%s的历史K线数据", total, marketName)
	UpdateStockSyncProgress(market, "syncing_kline", fmt.Sprintf("开始全量同步%sK线...", marketName), 85, 100, fmt.Sprintf("共 %d 只股票", total))

	endDate := time.Now().Format("2006-01-02")
	startDate := "1990-01-01"

	// 并发控制（全量同步用5个worker，因为数据量大）
	const workerCount = 5
	var wg sync.WaitGroup
	stockChan := make(chan models.StockData, workerCount*2)

	var successCount, failedCount, processedCount int64

	// 启动worker
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for stock := range stockChan {
				if err := s.FetchAndSaveKlines(ctx, stock.Symbol, market, startDate, endDate); err != nil {
					atomic.AddInt64(&failedCount, 1)
				} else {
					atomic.AddInt64(&successCount, 1)
				}
				current := atomic.AddInt64(&processedCount, 1)

				// 每100只更新一次进度
				if current%100 == 0 {
					success := atomic.LoadInt64(&successCount)
					failed := atomic.LoadInt64(&failedCount)
					// K线同步占 85-99%
					percent := 85 + int(float64(current)/float64(total)*14)
					msg := fmt.Sprintf("%sK线全量同步 %d/%d", marketName, current, total)
					UpdateStockSyncProgress(market, "syncing_kline", msg, percent, 100, fmt.Sprintf("成功:%d 失败:%d", success, failed))
					log.Printf("全量同步 %d/%d 只%s (成功:%d 失败:%d)", current, total, marketName, success, failed)
				}

				time.Sleep(20 * time.Millisecond) // 全量同步稍微慢一点，避免API限流
			}
		}()
	}

	// 发送任务
	for _, stock := range stocks {
		stockChan <- stock
	}
	close(stockChan)

	// 等待完成
	wg.Wait()

	success := atomic.LoadInt64(&successCount)
	failed := atomic.LoadInt64(&failedCount)
	log.Printf("%sK线全量同步完成，成功 %d/%d，失败 %d", marketName, success, total, failed)
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
func (s *KlineService) CalculateRangeByAggregation(ctx context.Context, startDate, endDate, market string) ([]repositories.RangeAggregationResult, error) {
	return s.klineRepo.CalculateRangeByAggregation(ctx, startDate, endDate, market)
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
func (s *KlineService) GetStockDetailWithIndicators(ctx context.Context, symbol, market string) (*models.StockData, error) {
	// 获取基础数据
	stock, err := s.stockRepo.GetStockBySymbol(ctx, symbol, market)
	if err != nil {
		return nil, err
	}

	// 获取历史K线计算指标
	endDate := time.Now().Format("2006-01-02")
	startDate := time.Now().AddDate(0, -3, 0).Format("2006-01-02")
	klines, err := s.klineRepo.GetKlinesBySymbol(ctx, symbol, market, startDate, endDate)
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
		PERatio:        getFloat(resp.Data, "f162"),  // 动态市盈率(TTM)
		PERatioStatic:  getFloat(resp.Data, "f115"),  // 静态市盈率(LYR)
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
