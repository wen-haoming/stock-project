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
	"time"
)

// StockService 股票服务
type StockService struct {
	stockRepo *repositories.StockRepository
	cache     *repositories.MemoryCache
}

// NewStockService 创建股票服务
func NewStockService() *StockService {
	return &StockService{
		stockRepo: repositories.NewStockRepository(),
		cache:     repositories.GetMemoryCache(),
	}
}

// GetAllStocksWithCache 获取所有股票（带缓存）
func (s *StockService) GetAllStocksWithCache(ctx context.Context) ([]models.StockData, error) {
	cacheKey := "all_stocks"
	if data, ok := s.cache.Get(cacheKey); ok {
		return data.([]models.StockData), nil
	}

	stocks, err := s.stockRepo.GetAllStocks(ctx)
	if err != nil {
		return nil, err
	}

	ttl := repositories.GetCacheTTL("")
	s.cache.Set(cacheKey, stocks, ttl)
	return stocks, nil
}

// GetStocksByMarketWithCache 获取指定市场股票（带缓存）
func (s *StockService) GetStocksByMarketWithCache(ctx context.Context, market string) ([]models.StockData, error) {
	cacheKey := fmt.Sprintf("stocks_%s", market)
	if data, ok := s.cache.Get(cacheKey); ok {
		return data.([]models.StockData), nil
	}

	stocks, err := s.stockRepo.GetStocksByMarket(ctx, market, 10000, 0)
	if err != nil {
		return nil, err
	}

	ttl := repositories.GetCacheTTL(market)
	s.cache.Set(cacheKey, stocks, ttl)
	return stocks, nil
}

// FetchHKStockData 从东方财富获取港股数据
func (s *StockService) FetchHKStockData() ([]models.StockData, error) {
	params := url.Values{}
	params.Set("pn", "1")
	params.Set("pz", "5000")
	params.Set("po", "1")
	params.Set("np", "1")
	params.Set("fltt", "2")
	params.Set("invt", "2")
	params.Set("fid", "f3")
	params.Set("fs", "m:116,m:117")
	params.Set("fields", "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f100")

	apiURL := "https://push2.eastmoney.com/api/qt/clist/get?" + params.Encode()
	body, err := utils.FetchURL(apiURL)
	if err != nil {
		return nil, err
	}

	return s.parseEastMoneyResponse(body, "hk")
}

// FetchAStockData 从东方财富获取A股数据
func (s *StockService) FetchAStockData() ([]models.StockData, error) {
	params := url.Values{}
	params.Set("pn", "1")
	params.Set("pz", "5000")
	params.Set("po", "1")
	params.Set("np", "1")
	params.Set("fltt", "2")
	params.Set("invt", "2")
	params.Set("fid", "f3")
	params.Set("fs", "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23")
	params.Set("fields", "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f100")

	apiURL := "https://push2.eastmoney.com/api/qt/clist/get?" + params.Encode()
	body, err := utils.FetchURL(apiURL)
	if err != nil {
		return nil, err
	}

	return s.parseEastMoneyResponse(body, "a")
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
			PERatio:        getFloat(item, "f9"),
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

		if stock.Symbol != "" && stock.LatestPrice > 0 {
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
func (s *StockService) GetStockBySymbol(ctx context.Context, symbol, market string) (*models.StockData, error) {
	return s.stockRepo.GetStockBySymbol(ctx, symbol, market)
}

// GetStocksBySymbols 批量获取股票
func (s *StockService) GetStocksBySymbols(ctx context.Context, symbols []string, market string) ([]models.StockData, error) {
	return s.stockRepo.GetStocksBySymbols(ctx, symbols, market)
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
