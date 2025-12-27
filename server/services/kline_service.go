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

// SyncHKHistoryData 同步港股历史K线数据（全量）
func (s *KlineService) SyncHKHistoryData(ctx context.Context) error {
	// 获取所有港股
	stocks, err := s.stockRepo.GetStocksByMarket(ctx, "hk", 10000, 0)
	if err != nil {
		return err
	}

	log.Printf("开始同步 %d 只港股的历史K线数据", len(stocks))

	// 2年数据
	endDate := time.Now().Format("2006-01-02")
	startDate := time.Now().AddDate(-2, 0, 0).Format("2006-01-02")

	successCount := 0
	for i, stock := range stocks {
		if err := s.FetchAndSaveKlines(ctx, stock.Symbol, "hk", startDate, endDate); err != nil {
			log.Printf("同步 %s K线失败: %v", stock.Symbol, err)
			continue
		}
		successCount++

		// 每100只股票打印进度
		if (i+1)%100 == 0 {
			log.Printf("已同步 %d/%d 只股票", i+1, len(stocks))
		}

		// 限流，避免请求过快
		time.Sleep(50 * time.Millisecond)
	}

	log.Printf("港股历史K线同步完成，成功 %d/%d", successCount, len(stocks))
	return nil
}

// SyncHKHistoryDataIncremental 增量同步港股历史K线
func (s *KlineService) SyncHKHistoryDataIncremental(ctx context.Context) error {
	stocks, err := s.stockRepo.GetStocksByMarket(ctx, "hk", 10000, 0)
	if err != nil {
		return err
	}

	log.Printf("开始增量同步 %d 只港股的K线数据", len(stocks))

	// 最近7天
	endDate := time.Now().Format("2006-01-02")
	startDate := time.Now().AddDate(0, 0, -7).Format("2006-01-02")

	successCount := 0
	for _, stock := range stocks {
		if err := s.FetchAndSaveKlines(ctx, stock.Symbol, "hk", startDate, endDate); err != nil {
			continue
		}
		successCount++
		time.Sleep(30 * time.Millisecond)
	}

	log.Printf("港股K线增量同步完成，成功 %d/%d", successCount, len(stocks))
	return nil
}

// SyncAHistoryData 同步A股历史K线数据（全量）
func (s *KlineService) SyncAHistoryData(ctx context.Context) error {
	// 获取所有A股
	stocks, err := s.stockRepo.GetStocksByMarket(ctx, "a", 10000, 0)
	if err != nil {
		return err
	}

	log.Printf("开始同步 %d 只A股的历史K线数据", len(stocks))

	// 2年数据
	endDate := time.Now().Format("2006-01-02")
	startDate := time.Now().AddDate(-2, 0, 0).Format("2006-01-02")

	successCount := 0
	for i, stock := range stocks {
		if err := s.FetchAndSaveKlines(ctx, stock.Symbol, "a", startDate, endDate); err != nil {
			log.Printf("同步 %s K线失败: %v", stock.Symbol, err)
			continue
		}
		successCount++

		// 每100只股票打印进度
		if (i+1)%100 == 0 {
			log.Printf("已同步 %d/%d 只A股", i+1, len(stocks))
		}

		// 限流，避免请求过快
		time.Sleep(50 * time.Millisecond)
	}

	log.Printf("A股历史K线同步完成，成功 %d/%d", successCount, len(stocks))
	return nil
}

// SyncAHistoryDataIncremental 增量同步A股历史K线
func (s *KlineService) SyncAHistoryDataIncremental(ctx context.Context) error {
	stocks, err := s.stockRepo.GetStocksByMarket(ctx, "a", 10000, 0)
	if err != nil {
		return err
	}

	log.Printf("开始增量同步 %d 只A股的K线数据", len(stocks))

	// 最近7天
	endDate := time.Now().Format("2006-01-02")
	startDate := time.Now().AddDate(0, 0, -7).Format("2006-01-02")

	successCount := 0
	for _, stock := range stocks {
		if err := s.FetchAndSaveKlines(ctx, stock.Symbol, "a", startDate, endDate); err != nil {
			continue
		}
		successCount++
		time.Sleep(30 * time.Millisecond)
	}

	log.Printf("A股K线增量同步完成，成功 %d/%d", successCount, len(stocks))
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
	params.Set("fields", "f43,f44,f45,f46,f47,f48,f50,f51,f52,f55,f57,f58,f60,f116,f117,f162,f167,f168,f169,f170")

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
		PERatio:        getFloat(resp.Data, "f162"),
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
