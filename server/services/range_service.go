package services

import (
	"context"
	"fmt"
	"log"
	"server/models"
	"server/repositories"
	"server/services"
	"strconv"
	"strings"
)

// RangeService 区间涨幅服务
type RangeService struct {
	klineRepo      *repositories.KlineRepository
	stockRepo      *repositories.StockRepository
	rangeCacheRepo *repositories.RangeCacheRepository
	memoryCache    *repositories.MemoryCache
}

// NewRangeService 创建区间服务
func NewRangeService() *RangeService {
	return &RangeService{
		klineRepo:      repositories.NewKlineRepository(),
		stockRepo:      repositories.NewStockRepository(),
		rangeCacheRepo: repositories.NewRangeCacheRepository(),
		memoryCache:    repositories.GetMemoryCache(),
	}
}

// RangeQuery 区间查询参数
type RangeQuery struct {
	StartDate    string
	EndDate      string
	MinChangePct float64
	MinMarketCap float64
	MaxMarketCap float64
	Industry     string
	Market       string
	Refresh      bool
}

// GetRangeData 获取区间涨幅数据
func (s *RangeService) GetRangeData(ctx context.Context, query RangeQuery) ([]models.RangeStockData, error) {
	cacheKey := s.buildCacheKey(query)

	// 1. 检查内存缓存
	if !query.Refresh {
		if data, ok := s.memoryCache.Get(cacheKey); ok {
			cachedData := data.([]models.RangeStockData)
			if len(cachedData) > 0 {
				return s.filterRangeData(cachedData, query), nil
			}
		}
	}

	// 2. 检查 MongoDB 缓存
	if !query.Refresh {
		cache, err := s.rangeCacheRepo.GetCache(ctx, query.StartDate, query.EndDate, query.Market)
		if err == nil && s.rangeCacheRepo.IsCacheValid(cache) {
			ttl := repositories.GetSmartCacheTTL(query.EndDate, query.Market)
			s.memoryCache.Set(cacheKey, cache.Data, ttl)
			return s.filterRangeData(cache.Data, query), nil
		}
	}

	// 3. 从数据库计算
	data, err := s.calculateRangeData(ctx, query)
	if err != nil {
		return nil, err
	}

	// 4. 缓存结果
	if len(data) > 0 {
		ttl := repositories.GetSmartCacheTTL(query.EndDate, query.Market)
		s.memoryCache.Set(cacheKey, data, ttl)
		s.rangeCacheRepo.SetCache(ctx, &models.RangeCacheData{
			StartDate: query.StartDate,
			EndDate:   query.EndDate,
			Market:    query.Market,
			Data:      data,
		})
	}

	return s.filterRangeData(data, query), nil
}

// calculateRangeData 计算区间涨幅数据
// 从内存缓存计算，不再从数据库读取
func (s *RangeService) calculateRangeData(ctx context.Context, query RangeQuery) ([]models.RangeStockData, error) {
	log.Printf("计算区间涨幅: %s ~ %s, market=%s", query.StartDate, query.EndDate, query.Market)

	// 从内存缓存计算区间涨幅
	klineService := services.NewKlineService()
	aggResults, err := klineService.CalculateRangeByAggregation(ctx, query.StartDate, query.EndDate, query.Market)
	if err != nil {
		return nil, err
	}
	log.Printf("聚合返回 %d 条", len(aggResults))

	// 获取股票基础信息（从内存缓存）
	symbols := make([]string, 0, len(aggResults))
	for _, r := range aggResults {
		symbols = append(symbols, r.Symbol)
	}

	stockService := services.NewStockService()
	stocks, err := stockService.GetStocksBySymbols(ctx, symbols, query.Market)
	if err != nil {
		return nil, err
	}

	stockMap := make(map[string]models.StockData, len(stocks))
	for _, stock := range stocks {
		stockMap[stock.Symbol] = stock
	}

	result := make([]models.RangeStockData, 0, len(aggResults))
	for _, agg := range aggResults {
		if agg.StartPrice <= 0 {
			continue
		}
		stock, exists := stockMap[agg.Symbol]
		if !exists {
			continue
		}

		// 过滤涡轮/牛熊证（港股）
		if query.Market == "hk" && isDerivative(agg.Symbol, stock.Name, stock.Industry) {
			continue
		}

		changePct := (agg.EndPrice - agg.StartPrice) / agg.StartPrice * 100
		result = append(result, models.RangeStockData{
			Symbol:         agg.Symbol,
			Name:           stock.Name,
			Market:         stock.Market,
			StartPrice:     agg.StartPrice,
			EndPrice:       agg.EndPrice,
			LatestPrice:    stock.LatestPrice,
			ChangePct:      changePct,
			TotalMarketCap: stock.TotalMarketCap,
			CircMarketCap:  stock.CircMarketCap,
			PERatio:        stock.PERatio,
			PERatioStatic:  stock.PERatioStatic,
			PBRatio:        stock.PBRatio,
			Industry:       stock.Industry,
			Turnover:       stock.Turnover,
			TurnoverRate:   stock.TurnoverRate,
		})
	}

	log.Printf("计算完成，共 %d 条有效数据", len(result))
	return result, nil
}

// isDerivative 判断是否为衍生品（涡轮/牛熊证）
func isDerivative(symbol, name, industry string) bool {
	// 1. 行业为空或"-"
	if industry == "" || industry == "-" {
		return true
	}
	// 2. 代码5位数且>=10000（涡轮/牛熊证代码范围）
	if len(symbol) == 5 {
		if code, err := strconv.Atoi(symbol); err == nil && code >= 10000 {
			return true
		}
	}
	// 3. 名称包含衍生品关键词
	keywords := []string{"牛", "熊", "购", "沽", "轮", "界内证"}
	for _, kw := range keywords {
		if strings.Contains(name, kw) {
			return true
		}
	}
	return false
}

// filterRangeData 过滤区间数据
func (s *RangeService) filterRangeData(data []models.RangeStockData, query RangeQuery) []models.RangeStockData {
	result := make([]models.RangeStockData, 0, len(data))

	for _, item := range data {
		if query.MinChangePct != 0 && item.ChangePct < query.MinChangePct {
			continue
		}
		marketCapBillion := item.TotalMarketCap / 100000000
		if query.MinMarketCap > 0 && marketCapBillion < query.MinMarketCap {
			continue
		}
		if query.MaxMarketCap > 0 && marketCapBillion > query.MaxMarketCap {
			continue
		}
		if query.Industry != "" && item.Industry != query.Industry {
			continue
		}
		result = append(result, item)
	}
	return result
}

// buildCacheKey 构建缓存键
func (s *RangeService) buildCacheKey(query RangeQuery) string {
	return fmt.Sprintf("range_%s_%s_%s", query.StartDate, query.EndDate, query.Market)
}

// ClearOldCache 清理旧缓存
func (s *RangeService) ClearOldCache(ctx context.Context) (int64, error) {
	return s.rangeCacheRepo.ClearOldCache(ctx)
}

// normalizeDate 标准化日期格式
func normalizeDate(date string) string {
	if len(date) == 10 && date[4] == '-' && date[7] == '-' {
		return date
	}
	if len(date) == 8 {
		return date[:4] + "-" + date[4:6] + "-" + date[6:]
	}
	return date
}

// ParseRangeQuery 解析查询参数
func ParseRangeQuery(params map[string]string) RangeQuery {
	query := RangeQuery{
		StartDate: normalizeDate(params["start_date"]),
		EndDate:   normalizeDate(params["end_date"]),
		Industry:  params["industry"],
		Market:    params["market"],
	}
	if v, ok := params["min_change_pct"]; ok && v != "" {
		query.MinChangePct, _ = strconv.ParseFloat(v, 64)
	}
	if v, ok := params["min_market_cap"]; ok && v != "" {
		query.MinMarketCap, _ = strconv.ParseFloat(v, 64)
	}
	if v, ok := params["max_market_cap"]; ok && v != "" {
		query.MaxMarketCap, _ = strconv.ParseFloat(v, 64)
	}
	if v, ok := params["refresh"]; ok && v == "true" {
		query.Refresh = true
	}
	return query
}
