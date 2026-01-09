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
	"strings"
	"time"
)

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

// GetKlineDateRange 获取K线数据的日期范围
func (s *KlineService) GetKlineDateRange(ctx context.Context, market string) (minDate, maxDate string, count int64, err error) {
	return s.klineRepo.GetKlineDateRange(ctx, market)
}
