package services

import (
	"context"
	"fmt"
	"log"
	"server/models"
	"server/repositories"
	"strconv"
)

// RangeService 区间涨幅服务
type RangeService struct {
	klineRepo      *repositories.KlineRepository
	stockRepo      *repositories.StockRepository
	rangeCacheRepo *repositories.RangeCacheRepository
	memoryCache    *repositories.MemoryCache
	stockService   *StockService
}

// NewRangeService 创建区间服务
func NewRangeService() *RangeService {
	return &RangeService{
		klineRepo:      repositories.NewKlineRepository(),
		stockRepo:      repositories.NewStockRepository(),
		rangeCacheRepo: repositories.NewRangeCacheRepository(),
		memoryCache:    repositories.GetMemoryCache(),
		stockService:   NewStockService(),
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

	// 1. 检查内存缓存（非强制刷新时）
	if !query.Refresh {
		if data, ok := s.memoryCache.Get(cacheKey); ok {
			log.Printf("命中内存缓存: %s", cacheKey)
			return s.filterRangeData(data.([]models.RangeStockData), query), nil
		}
	}

	// 2. 检查 MongoDB 缓存（非强制刷新时）
	if !query.Refresh {
		cache, err := s.rangeCacheRepo.GetCache(ctx, query.StartDate, query.EndDate, query.Market)
		if err == nil && s.rangeCacheRepo.IsCacheValid(cache) {
			log.Printf("命中 MongoDB 缓存: %s", cacheKey)
			// 使用智能 TTL
			ttl := repositories.GetSmartCacheTTL(query.EndDate, query.Market)
			s.memoryCache.Set(cacheKey, cache.Data, ttl)
			return s.filterRangeData(cache.Data, query), nil
		}
	}

	// 3. 从数据库计算区间涨幅
	data, err := s.calculateRangeData(ctx, query)
	if err != nil {
		return nil, err
	}

	// 4. 缓存结果（使用智能 TTL）
	ttl := repositories.GetSmartCacheTTL(query.EndDate, query.Market)
	s.memoryCache.Set(cacheKey, data, ttl)
	s.rangeCacheRepo.SetCache(ctx, &models.RangeCacheData{
		StartDate: query.StartDate,
		EndDate:   query.EndDate,
		Market:    query.Market,
		Data:      data,
	})

	return s.filterRangeData(data, query), nil
}

// calculateRangeData 计算区间涨幅数据
func (s *RangeService) calculateRangeData(ctx context.Context, query RangeQuery) ([]models.RangeStockData, error) {
	log.Printf("开始计算区间涨幅: %s ~ %s, market=%s", query.StartDate, query.EndDate, query.Market)

	// 使用聚合查询计算区间涨幅（传入 market 参数查询对应的表）
	aggResults, err := s.klineRepo.CalculateRangeByAggregation(ctx, query.StartDate, query.EndDate, query.Market)
	if err != nil {
		return nil, err
	}

	log.Printf("聚合查询返回 %d 条结果", len(aggResults))

	// 获取股票基础信息
	symbols := make([]string, 0, len(aggResults))
	for _, r := range aggResults {
		symbols = append(symbols, r.Symbol)
	}

	stocks, err := s.stockRepo.GetStocksBySymbols(ctx, symbols, query.Market)
	if err != nil {
		return nil, err
	}

	// 构建股票信息映射
	stockMap := make(map[string]models.StockData)
	for _, stock := range stocks {
		stockMap[stock.Symbol] = stock
	}

	// 组装结果
	var result []models.RangeStockData
	for _, agg := range aggResults {
		if agg.StartPrice <= 0 {
			continue
		}

		stock, exists := stockMap[agg.Symbol]
		if !exists {
			continue
		}

		changePct := (agg.EndPrice - agg.StartPrice) / agg.StartPrice * 100

		item := models.RangeStockData{
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
			PBRatio:        stock.PBRatio,
			Industry:       stock.Industry,
			Turnover:       stock.Turnover,
			TurnoverRate:   stock.TurnoverRate,
		}

		result = append(result, item)
	}

	log.Printf("计算完成，共 %d 条有效数据", len(result))
	return result, nil
}

// filterRangeData 过滤区间数据
func (s *RangeService) filterRangeData(data []models.RangeStockData, query RangeQuery) []models.RangeStockData {
	var result []models.RangeStockData

	for _, item := range data {
		// 涨幅过滤
		if query.MinChangePct != 0 && item.ChangePct < query.MinChangePct {
			continue
		}

		// 市值过滤（亿）
		marketCapBillion := item.TotalMarketCap / 100000000
		if query.MinMarketCap > 0 && marketCapBillion < query.MinMarketCap {
			continue
		}
		if query.MaxMarketCap > 0 && marketCapBillion > query.MaxMarketCap {
			continue
		}

		// 行业过滤
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

// RefreshRangeData 强制刷新区间数据
func (s *RangeService) RefreshRangeData(ctx context.Context, query RangeQuery) ([]models.RangeStockData, error) {
	query.Refresh = true
	return s.GetRangeData(ctx, query)
}

// ClearOldCache 清理旧缓存
func (s *RangeService) ClearOldCache(ctx context.Context) (int64, error) {
	return s.rangeCacheRepo.ClearOldCache(ctx)
}

// ParseRangeQuery 解析查询参数
func ParseRangeQuery(params map[string]string) RangeQuery {
	query := RangeQuery{
		StartDate: params["start_date"],
		EndDate:   params["end_date"],
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
