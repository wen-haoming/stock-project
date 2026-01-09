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
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// StockService 股票服务
type StockService struct {
	stockRepo     *repositories.StockRepository
	cache         *repositories.MemoryCache
	realtimeCache *repositories.RealtimeCache
}

// NewStockService 创建股票服务
func NewStockService() *StockService {
	return &StockService{
		stockRepo:     repositories.NewStockRepository(),
		cache:         repositories.GetMemoryCache(),
		realtimeCache: repositories.GetRealtimeCache(),
	}
}

// GetAllStocksWithCache 获取所有股票（带缓存）
// 优先从实时缓存读取，如果缓存未初始化则从数据库读取
func (s *StockService) GetAllStocksWithCache(ctx context.Context) ([]models.StockData, error) {
	// 1. 优先从实时缓存读取
	if s.realtimeCache.IsInitialized() {
		aStocks := s.realtimeCache.GetAllAsStockData("a")
		hkStocks := s.realtimeCache.GetAllAsStockData("hk")
		allStocks := append(aStocks, hkStocks...)
		if len(allStocks) > 0 {
			return allStocks, nil
		}
	}

	// 2. 实时缓存未命中，从内存缓存读取
	cacheKey := "all_stocks"
	if data, ok := s.cache.Get(cacheKey); ok {
		return data.([]models.StockData), nil
	}

	// 3. 从数据库读取
	stocks, err := s.stockRepo.GetAllStocks(ctx)
	if err != nil {
		return nil, err
	}

	ttl := repositories.GetCacheTTL("")
	s.cache.Set(cacheKey, stocks, ttl)

	// 4. 异步触发实时缓存更新（不阻塞响应）
	go s.asyncUpdateRealtimeCache(ctx)

	return stocks, nil
}

// GetStocksByMarketWithCache 获取指定市场股票（带缓存）
// 读取优先级：实时缓存 -> 内存缓存 -> 数据库 -> 异步补全
func (s *StockService) GetStocksByMarketWithCache(ctx context.Context, market string) ([]models.StockData, error) {
	// 1. 优先从实时缓存读取
	if s.realtimeCache.IsInitialized() && s.realtimeCache.Count(market) > 0 {
		stocks := s.realtimeCache.GetAllAsStockData(market)
		if len(stocks) > 0 {
			return stocks, nil
		}
	}

	// 2. 实时缓存未命中，从内存缓存读取
	cacheKey := fmt.Sprintf("stocks_%s", market)
	if data, ok := s.cache.Get(cacheKey); ok {
		return data.([]models.StockData), nil
	}

	// 3. 从数据库读取
	stocks, err := s.stockRepo.GetStocksByMarket(ctx, market, 10000, 0)
	if err != nil {
		return nil, err
	}

	ttl := repositories.GetCacheTTL(market)
	s.cache.Set(cacheKey, stocks, ttl)

	// 4. 异步触发实时缓存更新（不阻塞响应）
	go s.asyncUpdateMarketCache(market)

	return stocks, nil
}

// SearchStocks 搜索股票（支持代码和名称模糊搜索）
// 从内存缓存搜索，不再从数据库读取
func (s *StockService) SearchStocks(ctx context.Context, keyword string, limit int) ([]models.StockData, error) {
	if keyword == "" {
		return []models.StockData{}, nil
	}
	if limit <= 0 {
		limit = 20
	}
	
	// 从实时缓存搜索
	var allStocks []models.StockData
	
	// 搜索A股
	if s.realtimeCache.IsInitialized() {
		aStocks := s.realtimeCache.GetAllAsStockData("a")
		allStocks = append(allStocks, aStocks...)
	}
	
	// 搜索港股
	if s.realtimeCache.IsInitialized() {
		hkStocks := s.realtimeCache.GetAllAsStockData("hk")
		allStocks = append(allStocks, hkStocks...)
	}
	
	// 如果缓存未初始化，返回空结果
	if len(allStocks) == 0 {
		return []models.StockData{}, nil
	}
	
	// 过滤匹配的股票
	var matched []models.StockData
	keywordLower := strings.ToLower(keyword)
	for _, stock := range allStocks {
		if strings.Contains(strings.ToLower(stock.Symbol), keywordLower) ||
			strings.Contains(strings.ToLower(stock.Name), keywordLower) {
			matched = append(matched, stock)
		}
	}
	
	// 排序：个股优先（有行业信息的优先），然后按市值排序
	sort.Slice(matched, func(i, j int) bool {
		// 判断是否为衍生品
		iIsDerivative := isDerivativeStock(matched[i])
		jIsDerivative := isDerivativeStock(matched[j])
		
		// 个股优先
		if iIsDerivative != jIsDerivative {
			return !iIsDerivative
		}
		
		// 同类型按市值排序
		return matched[i].TotalMarketCap > matched[j].TotalMarketCap
	})
	
	// 限制返回数量
	if len(matched) > limit {
		matched = matched[:limit]
	}
	
	return matched, nil
}

// isDerivativeStock 判断是否为衍生品（从stock_repo.go复制）
func isDerivativeStock(stock models.StockData) bool {
	// 港股衍生品判断
	if stock.Market == "hk" {
		// 行业为空或"-"
		if stock.Industry == "" || stock.Industry == "-" {
			return true
		}
		// 代码 >= 10000 通常是衍生品
		if len(stock.Symbol) == 5 {
			if code, err := strconv.Atoi(stock.Symbol); err == nil && code >= 10000 {
				return true
			}
		}
		// 名称包含衍生品关键词
		keywords := []string{"牛", "熊", "购", "沽", "轮", "界内证"}
		for _, kw := range keywords {
			if strings.Contains(stock.Name, kw) {
				return true
			}
		}
	}
	return false
}

// FetchHKStockData 从东方财富获取港股数据（分页获取全部）
func (s *StockService) FetchHKStockData() ([]models.StockData, error) {
	return s.fetchStockDataPaginated("m:116,m:117", "hk")
}

// FetchAStockData 从东方财富获取A股数据（分页获取全部）
func (s *StockService) FetchAStockData() ([]models.StockData, error) {
	return s.fetchStockDataPaginated("m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23", "a")
}

// fetchStockDataPaginated 分页获取股票数据
func (s *StockService) fetchStockDataPaginated(fs, market string) ([]models.StockData, error) {
	var allStocks []models.StockData
	pageSize := 100 // 东方财富API每页最多100条
	page := 1

	for {
		params := url.Values{}
		params.Set("pn", strconv.Itoa(page))
		params.Set("pz", strconv.Itoa(pageSize))
		params.Set("po", "1")
		params.Set("np", "1")
		params.Set("fltt", "2")
		params.Set("invt", "2")
		params.Set("fid", "f3")
		params.Set("fs", fs)
		params.Set("fields", "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f100,f115")

		apiURL := "https://push2.eastmoney.com/api/qt/clist/get?" + params.Encode()
		body, err := utils.FetchURL(apiURL)
		if err != nil {
			return nil, err
		}

		stocks, err := s.parseEastMoneyResponse(body, market)
		if err != nil {
			return nil, err
		}

		if len(stocks) == 0 {
			break
		}

		allStocks = append(allStocks, stocks...)
		log.Printf("获取%s第%d页，本页%d条，累计%d条", market, page, len(stocks), len(allStocks))

		if len(stocks) < pageSize {
			break // 最后一页
		}

		page++
		time.Sleep(100 * time.Millisecond) // 限流
	}

	return allStocks, nil
}

func (s *StockService) parseEastMoneyResponse(body []byte, market string) ([]models.StockData, error) {
	var resp struct {
		Data struct {
			Diff []map[string]any `json:"diff"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, err
	}

	var stocks []models.StockData
	for _, item := range resp.Data.Diff {
		stock := models.StockData{
			Symbol:         getString(item, "f12"),
			Name:           getString(item, "f14"),
			Market:         market,
			LatestPrice:    getFloat(item, "f2"),
			ChangePct:      getFloat(item, "f3"),
			ChangeAmt:      getFloat(item, "f4"),
			Volume:         getInt64(item, "f5"),
			Turnover:       getFloat(item, "f6"),
			Amplitude:      getFloat(item, "f7"),
			TurnoverRate:   getFloat(item, "f8"),
			PERatio:        getFloat(item, "f9"),   // 动态市盈率(TTM)
			PERatioStatic:  getFloat(item, "f115"), // 静态市盈率(LYR)
			High:           getFloat(item, "f15"),
			Low:            getFloat(item, "f16"),
			Open:           getFloat(item, "f17"),
			Close:          getFloat(item, "f18"),
			TotalMarketCap: getFloat(item, "f20"),
			CircMarketCap:  getFloat(item, "f21"),
			PBRatio:        getFloat(item, "f23"),
			Industry:       getString(item, "f100"),
			UpdatedAt:      time.Now(),
			CreatedAt:      time.Now(),
		}

		// 只要有股票代码就保存，停牌股票价格可能为0
		if stock.Symbol != "" {
			stocks = append(stocks, stock)
		}
	}

	return stocks, nil
}

// FetchStockKline 获取股票K线数据
func (s *StockService) FetchStockKline(symbol, market, startDate, endDate string) ([]models.StockKline, error) {
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

// FetchStockSector 获取股票所属板块
func (s *StockService) FetchStockSector(symbol, market string) (string, error) {
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

	apiURL := fmt.Sprintf("https://push2.eastmoney.com/api/qt/stock/get?secid=%s&fields=f127", secid)
	body, err := utils.FetchURL(apiURL)
	if err != nil {
		return "", err
	}

	var resp struct {
		Data struct {
			F127 string `json:"f127"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &resp); err != nil {
		return "", err
	}

	return resp.Data.F127, nil
}

// SaveStocks 保存股票数据到数据库
func (s *StockService) SaveStocks(ctx context.Context, stocks []models.StockData, market string) error {
	return s.stockRepo.UpsertStocks(ctx, stocks, market)
}

// GetStockBySymbol 获取单只股票
// 从内存缓存读取，不再从数据库读取
func (s *StockService) GetStockBySymbol(ctx context.Context, symbol, market string) (*models.StockData, error) {
	// 优先从实时缓存读取
	if s.realtimeCache.IsInitialized() {
		stock, ok := s.GetStockFromRealtimeCache(symbol, market)
		if ok {
			return stock, nil
		}
	}
	
	// 如果缓存未初始化或未找到，返回错误
	return nil, fmt.Errorf("stock not found in cache: %s/%s", symbol, market)
}

// GetStocksBySymbols 批量获取股票
// 从内存缓存读取，不再从数据库读取
func (s *StockService) GetStocksBySymbols(ctx context.Context, symbols []string, market string) ([]models.StockData, error) {
	// 从实时缓存读取
	if !s.realtimeCache.IsInitialized() {
		return []models.StockData{}, nil
	}
	
	var result []models.StockData
	for _, symbol := range symbols {
		if stock, ok := s.GetStockFromRealtimeCache(symbol, market); ok {
			result = append(result, *stock)
		}
	}
	
	return result, nil
}

// ClearCache 清除缓存
func (s *StockService) ClearCache() {
	s.cache.Clear()
}

// 辅助函数
func getString(m map[string]any, key string) string {
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

func getFloat(m map[string]any, key string) float64 {
	if v, ok := m[key]; ok {
		switch val := v.(type) {
		case float64:
			return val
		case string:
			f, _ := strconv.ParseFloat(val, 64)
			return f
		}
	}
	return 0
}

func getInt64(m map[string]any, key string) int64 {
	if v, ok := m[key]; ok {
		switch val := v.(type) {
		case float64:
			return int64(val)
		case string:
			i, _ := strconv.ParseInt(val, 10, 64)
			return i
		}
	}
	return 0
}

func parseFloat(s string) float64 {
	f, _ := strconv.ParseFloat(s, 64)
	return f
}

func parseInt64(s string) int64 {
	i, _ := strconv.ParseInt(s, 10, 64)
	return i
}

// GetLastUpdateTime 获取最后更新时间
func (s *StockService) GetLastUpdateTime(ctx context.Context, market string) (time.Time, error) {
	return s.stockRepo.GetLastUpdateTime(ctx, market)
}

// CountByMarket 统计市场股票数量
func (s *StockService) CountByMarket(ctx context.Context, market string) (int64, error) {
	return s.stockRepo.CountByMarket(ctx, market)
}

// SyncHKStockData 同步港股数据
func (s *StockService) SyncHKStockData(ctx context.Context) error {
	stocks, err := s.FetchHKStockData()
	if err != nil {
		return err
	}
	log.Printf("获取到 %d 条港股数据", len(stocks))
	return s.SaveStocks(ctx, stocks, "hk")
}

// SyncAStockData 同步A股数据
func (s *StockService) SyncAStockData(ctx context.Context) error {
	stocks, err := s.FetchAStockData()
	if err != nil {
		return err
	}
	log.Printf("获取到 %d 条A股数据", len(stocks))
	return s.SaveStocks(ctx, stocks, "a")
}

// ============== 新增：实时缓存相关方法 ==============

// asyncUpdateRealtimeCache 异步更新实时缓存（不阻塞主请求）
func (s *StockService) asyncUpdateRealtimeCache(_ context.Context) {
	now := utils.GetChinaTime()

	// 根据交易时间决定更新哪个市场
	if utils.IsAStockTradingTime(now) && s.realtimeCache.NeedsUpdate("a") {
		s.UpdateRealtimeCache(context.Background(), "a")
	}
	if utils.IsHKTradingTime(now) && s.realtimeCache.NeedsUpdate("hk") {
		s.UpdateRealtimeCache(context.Background(), "hk")
	}
}

// asyncUpdateMarketCache 异步更新指定市场的缓存
func (s *StockService) asyncUpdateMarketCache(market string) {
	if s.realtimeCache.NeedsUpdate(market) {
		s.UpdateRealtimeCache(context.Background(), market)
	}
}

// UpdateRealtimeCache 更新实时缓存（只更新内存，不写数据库）
func (s *StockService) UpdateRealtimeCache(ctx context.Context, market string) error {
	var stocks []models.StockData
	var err error

	if market == "a" {
		stocks, err = s.FetchAStockData()
	} else {
		stocks, err = s.FetchHKStockData()
	}

	if err != nil {
		log.Printf("[RealtimeCache] 获取%s数据失败: %v", market, err)
		return err
	}

	// 更新实时缓存
	s.realtimeCache.BatchSet(stocks, market)
	log.Printf("[RealtimeCache] 更新%s实时缓存: %d只股票", market, len(stocks))

	// 同时清除旧的内存缓存
	s.cache.Delete(fmt.Sprintf("stocks_%s", market))
	s.cache.Delete("all_stocks")

	return nil
}

// UpdateRealtimeCacheOnly 仅更新实时缓存（不触发数据库写入）
// 用于交易时间的高频更新
func (s *StockService) UpdateRealtimeCacheOnly(ctx context.Context, market string) error {
	return s.UpdateRealtimeCache(ctx, market)
}

// SyncToDatabase 将实时缓存数据同步到数据库
// 用于收盘后的批量持久化
func (s *StockService) SyncToDatabase(ctx context.Context, market string) error {
	stocks := s.realtimeCache.GetAllAsStockData(market)
	if len(stocks) == 0 {
		log.Printf("[SyncToDatabase] %s 实时缓存为空，跳过同步", market)
		return nil
	}

	log.Printf("[SyncToDatabase] 开始同步 %s 数据到数据库: %d只股票", market, len(stocks))
	return s.stockRepo.UpsertStocks(ctx, stocks, market)
}

// PreloadRealtimeCache 预热实时缓存（从数据库加载）
// 用于服务启动时
func (s *StockService) PreloadRealtimeCache(ctx context.Context, market string) error {
	stocks, err := s.stockRepo.GetStocksByMarket(ctx, market, 10000, 0)
	if err != nil {
		return err
	}

	if len(stocks) > 0 {
		s.realtimeCache.BatchSet(stocks, market)
		log.Printf("[PreloadRealtimeCache] 预热%s缓存: %d只股票", market, len(stocks))
	}

	return nil
}

// SyncAndCache 同步数据并更新缓存（完整同步流程）
// 1. 从东财获取数据
// 2. 更新实时缓存
// 3. 写入数据库
func (s *StockService) SyncAndCache(ctx context.Context, market string) error {
	marketName := "A股"
	if market == "hk" {
		marketName = "港股"
	}

	var stocks []models.StockData
	var err error

	log.Printf("[SyncAndCache] 开始同步%s数据...", marketName)

	if market == "a" {
		stocks, err = s.FetchAStockData()
	} else {
		stocks, err = s.FetchHKStockData()
	}

	if err != nil {
		log.Printf("[SyncAndCache] 获取%s数据失败: %v", marketName, err)
		return err
	}

	// 更新缓存
	s.realtimeCache.BatchSet(stocks, market)

	// 写入数据库
	if err := s.stockRepo.UpsertStocks(ctx, stocks, market); err != nil {
		log.Printf("[SyncAndCache] 写入数据库失败: %v", err)
		return err
	}

	log.Printf("[SyncAndCache] %s数据同步完成: %d 只股票", marketName, len(stocks))
	return nil
}

// GetRealtimeCacheStats 获取实时缓存统计信息
func (s *StockService) GetRealtimeCacheStats() map[string]interface{} {
	return s.realtimeCache.GetStats()
}

// IsRealtimeCacheHealthy 检查实时缓存是否健康
func (s *StockService) IsRealtimeCacheHealthy() bool {
	return s.realtimeCache.IsHealthy()
}

// GetStockFromRealtimeCache 从实时缓存获取单只股票
func (s *StockService) GetStockFromRealtimeCache(symbol, market string) (*models.StockData, bool) {
	data, ok := s.realtimeCache.Get(symbol, market)
	if !ok {
		return nil, false
	}

	stock := &models.StockData{
		Symbol:         data.Symbol,
		Name:           data.Name,
		Market:         data.Market,
		LatestPrice:    data.LatestPrice,
		Open:           data.Open,
		Close:          data.Close,
		High:           data.High,
		Low:            data.Low,
		ChangePct:      data.ChangePct,
		ChangeAmt:      data.ChangeAmt,
		Volume:         data.Volume,
		Turnover:       data.Turnover,
		TurnoverRate:   data.TurnoverRate,
		Amplitude:      data.Amplitude,
		TotalMarketCap: data.TotalMarketCap,
		CircMarketCap:  data.CircMarketCap,
		PERatio:        data.PERatio,
		PERatioStatic:  data.PERatioStatic,
		PBRatio:        data.PBRatio,
		Industry:       data.Industry,
		UpdatedAt:      data.UpdatedAt,
	}

	return stock, true
}

// BatchSyncAndCache 批量同步（A股和港股同时进行）
func (s *StockService) BatchSyncAndCache(ctx context.Context) error {
	var wg sync.WaitGroup
	var aErr, hkErr error

	wg.Add(2)

	// 同步A股
	go func() {
		defer wg.Done()
		aErr = s.SyncAndCache(ctx, "a")
	}()

	// 同步港股
	go func() {
		defer wg.Done()
		hkErr = s.SyncAndCache(ctx, "hk")
	}()

	wg.Wait()

	if aErr != nil {
		return aErr
	}
	return hkErr
}

// DeleteAllStocks 清空指定市场的所有股票数据
func (s *StockService) DeleteAllStocks(ctx context.Context, market string) (int64, error) {
	// 同时清空实时缓存
	s.realtimeCache.Clear(market)
	return s.stockRepo.DeleteAllStocks(ctx, market)
}
