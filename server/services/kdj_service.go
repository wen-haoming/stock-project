package services

import (
	"context"
	"encoding/json"
	"log"
	"net/url"
	"server/models"
	"server/repositories"
	"server/utils"
	"strings"
	"time"
)

// KDJService KDJ 筛选服务
type KDJService struct {
	stockRepo *repositories.StockRepository
	cache     *repositories.MemoryCache
}

// NewKDJService 创建 KDJ 服务
func NewKDJService() *KDJService {
	return &KDJService{
		stockRepo: repositories.NewStockRepository(),
		cache:     repositories.GetMemoryCache(),
	}
}

// KDJStockData 带 KDJ 的股票数据
type KDJStockData struct {
	models.StockData
	KDJ models.KDJIndicator `json:"kdj"`
}

// GetAStocksWithKDJ 获取 A 股数据并计算 KDJ
func (s *KDJService) GetAStocksWithKDJ(ctx context.Context, filterJLessThanZero bool) ([]KDJStockData, error) {
	cacheKey := "a_stocks_kdj"
	if data, ok := s.cache.Get(cacheKey); ok {
		result := data.([]KDJStockData)
		if filterJLessThanZero {
			return s.filterByJ(result), nil
		}
		return result, nil
	}

	// 获取 A 股列表
	stocks, err := s.fetchAStockList()
	if err != nil {
		return nil, err
	}

	log.Printf("获取到 %d 只 A 股", len(stocks))

	// 计算 KDJ 指标
	var result []KDJStockData
	for i, stock := range stocks {
		kdj, err := s.calculateKDJForStock(stock.Symbol, "a")
		if err != nil {
			continue
		}

		kdjStock := KDJStockData{
			StockData: stock,
			KDJ:       *kdj,
		}
		result = append(result, kdjStock)

		// 进度日志
		if (i+1)%500 == 0 {
			log.Printf("已计算 %d/%d 只股票的 KDJ", i+1, len(stocks))
		}

		// 限流
		time.Sleep(20 * time.Millisecond)
	}

	// 缓存结果
	ttl := repositories.GetCacheTTL("a")
	s.cache.Set(cacheKey, result, ttl)

	if filterJLessThanZero {
		return s.filterByJ(result), nil
	}
	return result, nil
}

// fetchAStockList 获取 A 股列表
func (s *KDJService) fetchAStockList() ([]models.StockData, error) {
	params := url.Values{}
	params.Set("pn", "1")
	params.Set("pz", "5000")
	params.Set("po", "1")
	params.Set("np", "1")
	params.Set("fltt", "2")
	params.Set("invt", "2")
	params.Set("fid", "f3")
	params.Set("fs", "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23")
	params.Set("fields", "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f100,f115")

	apiURL := "https://push2.eastmoney.com/api/qt/clist/get?" + params.Encode()
	body, err := utils.FetchURL(apiURL)
	if err != nil {
		return nil, err
	}

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
			Market:         "a",
			LatestPrice:    getFloat(item, "f2"),
			ChangePct:      getFloat(item, "f3"),
			ChangeAmt:      getFloat(item, "f4"),
			Volume:         getInt64(item, "f5"),
			Turnover:       getFloat(item, "f6"),
			Amplitude:      getFloat(item, "f7"),
			TurnoverRate:   getFloat(item, "f8"),
			PERatio:        getFloat(item, "f9"),  // 动态市盈率(TTM)
			PERatioStatic:  getFloat(item, "f115"), // 静态市盈率(LYR)
			High:           getFloat(item, "f15"),
			Low:            getFloat(item, "f16"),
			Open:           getFloat(item, "f17"),
			Close:          getFloat(item, "f18"),
			TotalMarketCap: getFloat(item, "f20"),
			CircMarketCap:  getFloat(item, "f21"),
			PBRatio:        getFloat(item, "f23"),
			Industry:       getString(item, "f100"),
		}

		if stock.Symbol != "" && stock.LatestPrice > 0 {
			stocks = append(stocks, stock)
		}
	}

	return stocks, nil
}

// calculateKDJForStock 计算单只股票的 KDJ
func (s *KDJService) calculateKDJForStock(symbol, market string) (*models.KDJIndicator, error) {
	// 获取历史 K 线
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

	endDate := time.Now().Format("20060102")
	startDate := time.Now().AddDate(0, -1, 0).Format("20060102")

	params := url.Values{}
	params.Set("secid", secid)
	params.Set("fields1", "f1,f2,f3,f4,f5,f6")
	params.Set("fields2", "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61")
	params.Set("klt", "101")
	params.Set("fqt", "1")
	params.Set("beg", startDate)
	params.Set("end", endDate)

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

	if len(resp.Data.Klines) < 9 {
		return nil, nil
	}

	// 解析 K 线数据
	highs := make([]float64, len(resp.Data.Klines))
	lows := make([]float64, len(resp.Data.Klines))
	closes := make([]float64, len(resp.Data.Klines))

	for i, line := range resp.Data.Klines {
		parts := strings.Split(line, ",")
		if len(parts) < 5 {
			continue
		}
		highs[i] = parseFloat(parts[3])
		lows[i] = parseFloat(parts[4])
		closes[i] = parseFloat(parts[2])
	}

	return utils.CalcKDJ(highs, lows, closes, 9), nil
}

// filterByJ 过滤 J < 0 的股票
func (s *KDJService) filterByJ(stocks []KDJStockData) []KDJStockData {
	var result []KDJStockData
	for _, stock := range stocks {
		if stock.KDJ.J < 0 {
			result = append(result, stock)
		}
	}
	return result
}
