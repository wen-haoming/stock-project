package stock

import (
	"context"
	"log"
	"time"

	"server/db"
)

// StockService 股票服务
type StockService struct {
	cache *db.StockCache
	repo  *db.StockRepository
}

// NewStockService 创建股票服务
func NewStockService() *StockService {
	return &StockService{
		cache: db.NewStockCache(),
		repo:  db.NewStockRepository(),
	}
}

// 全局服务实例
var stockService *StockService

// GetService 获取服务实例
func GetService() *StockService {
	if stockService == nil {
		stockService = NewStockService()
	}
	return stockService
}

// GetAllStocksWithCache 获取所有股票数据（带缓存）
func (s *StockService) GetAllStocksWithCache(ctx context.Context, market string, page, pageSize int, code, name string) ([]db.StockData, int64, error) {
	// 先尝试从缓存获取
	if code == "" && name == "" {
		stocks, total, valid, err := s.cache.GetCachedStocks(ctx, market, page, pageSize)
		if err == nil && valid && len(stocks) > 0 {
			log.Printf("Cache hit for market=%s, page=%d", market, page)
			return stocks, total, nil
		}
	}

	// 缓存未命中，从数据库搜索
	if code != "" || name != "" {
		stocks, total, err := s.repo.SearchStocks(ctx, code, name, page, pageSize)
		if err == nil && len(stocks) > 0 {
			return stocks, total, nil
		}
	}

	// 数据库也没有，返回空（等待调度器同步数据）
	log.Printf("No cached data available, waiting for scheduler to sync")
	return []db.StockData{}, 0, nil
}

// GetHKStocksWithCache 获取港股数据（带缓存）
func (s *StockService) GetHKStocksWithCache(ctx context.Context, page, pageSize int, code, name string) ([]HKStockData, int, error) {
	// 先尝试从数据库获取
	stocks, total, err := s.repo.SearchStocks(context.Background(), code, name, page, pageSize)
	if err == nil && len(stocks) > 0 {
		// 检查是否是港股数据且数据新鲜
		var hkStocks []HKStockData
		for _, stock := range stocks {
			if stock.Market == "hk" {
				hkStocks = append(hkStocks, HKStockData{
					Symbol:         stock.Symbol,
					Name:           stock.Name,
					LatestPrice:    stock.LatestPrice,
					Open:           stock.Open,
					Close:          stock.Close,
					High:           stock.High,
					Low:            stock.Low,
					ChangePct:      stock.ChangePct,
					ChangeAmt:      stock.ChangeAmt,
					Volume:         stock.Volume,
					Turnover:       stock.Turnover,
					TurnoverRate:   stock.TurnoverRate,
					Amplitude:      stock.Amplitude,
					TotalMarketCap: stock.TotalMarketCap,
					CircMarketCap:  stock.CircMarketCap,
					PERatio:        stock.PERatio,
					PBRatio:        stock.PBRatio,
					Industry:       stock.Industry,
				})
			}
		}
		if len(hkStocks) > 0 {
			// 检查数据是否新鲜
			lastUpdate, _ := s.repo.GetLastUpdateTime(context.Background())
			cacheDuration := db.NonTradingCacheDuration
			if db.IsHKTradingTime() {
				cacheDuration = db.TradingCacheDuration
			}
			if time.Since(lastUpdate) < cacheDuration {
				log.Printf("DB cache hit for HK stocks")
				return hkStocks, int(total), nil
			}
		}
	}

	// 缓存未命中，从API获取
	log.Printf("DB cache miss, fetching from API")
	return fetchHKStockData(page, pageSize, code, name)
}

// GetDetailStocksWithCache 获取详细股票数据（带缓存）
func (s *StockService) GetDetailStocksWithCache(ctx context.Context, market string, page, pageSize int, code, name string, withIndicators bool) ([]StockDetailData, int, error) {
	// 如果不需要技术指标，先尝试从数据库获取
	if !withIndicators {
		stocks, total, err := s.repo.GetStocksByMarket(ctx, market, page, pageSize)
		if err == nil && len(stocks) > 0 {
			lastUpdate, _ := s.repo.GetLastUpdateTime(ctx)
			cacheDuration := db.NonTradingCacheDuration
			if db.IsTradingTime() {
				cacheDuration = db.TradingCacheDuration
			}
			if time.Since(lastUpdate) < cacheDuration {
				log.Printf("DB cache hit for detail stocks")
				var result []StockDetailData
				for _, stock := range stocks {
					result = append(result, StockDetailData{
						Symbol:         stock.Symbol,
						Name:           stock.Name,
						Market:         stock.Market,
						LatestPrice:    stock.LatestPrice,
						Open:           stock.Open,
						Close:          stock.Close,
						High:           stock.High,
						Low:            stock.Low,
						ChangePct:      stock.ChangePct,
						ChangeAmt:      stock.ChangeAmt,
						Amplitude:      stock.Amplitude,
						Volume:         stock.Volume,
						Turnover:       stock.Turnover,
						TurnoverRate:   stock.TurnoverRate,
						TotalMarketCap: stock.TotalMarketCap,
						CircMarketCap:  stock.CircMarketCap,
						PEDynamic:      stock.PERatio,
						PB:             stock.PBRatio,
						Industry:       stock.Industry,
					})
				}
				return result, int(total), nil
			}
		}
	}

	// 从API获取
	log.Printf("Fetching detail stocks from API")
	return fetchStockDetailData(market, page, pageSize, code, name, withIndicators)
}
