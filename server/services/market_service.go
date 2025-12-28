package services

import (
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"server/repositories"
	"server/utils"
	"sort"
	"strconv"
	"strings"
	"time"
)

// MarketService 大盘行情服务
type MarketService struct {
	cache *repositories.MemoryCache
}

// NewMarketService 创建大盘行情服务
func NewMarketService() *MarketService {
	return &MarketService{
		cache: repositories.GetMemoryCache(),
	}
}

// IndexData 指数数据
type IndexData struct {
	Symbol      string    `json:"symbol"`
	Name        string    `json:"name"`
	LatestPrice float64   `json:"latestPrice"`
	ChangePct   float64   `json:"changePct"`
	ChangeAmt   float64   `json:"changeAmt"`
	Open        float64   `json:"open"`
	High        float64   `json:"high"`
	Low         float64   `json:"low"`
	PreClose    float64   `json:"preClose"`
	Volume      int64     `json:"volume"`
	Turnover    float64   `json:"turnover"`
	TrendData   [][]any   `json:"trendData"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// DistributionData 涨跌分布数据
type DistributionData struct {
	Up   map[string]int `json:"up"`
	Down map[string]int `json:"down"`
	Flat int            `json:"flat"`
}

// SectorData 板块数据
type SectorData struct {
	Name      string       `json:"name"`
	ChangePct float64      `json:"changePct"`
	Stocks    []SectorStock `json:"stocks"`
}

// SectorStock 板块内股票
type SectorStock struct {
	Symbol    string  `json:"symbol"`
	Name      string  `json:"name"`
	ChangePct float64 `json:"changePct"`
}

// TopGainerData 涨幅榜数据
type TopGainerData struct {
	Symbol       string  `json:"symbol"`
	Name         string  `json:"name"`
	LatestPrice  float64 `json:"latestPrice"`
	ChangePct    float64 `json:"changePct"`
	ChangeAmt    float64 `json:"changeAmt"`
	Amount       float64 `json:"amount"`
	TurnoverRate float64 `json:"turnoverRate"`
}

// GetIndexList 获取指数行情列表
func (s *MarketService) GetIndexList(market string) ([]IndexData, error) {
	cacheKey := fmt.Sprintf("index_list_%s", market)
	if data, ok := s.cache.Get(cacheKey); ok {
		return data.([]IndexData), nil
	}

	var indices []IndexData
	var err error

	if market == "a" {
		indices, err = s.fetchAIndexList()
	} else {
		indices, err = s.fetchHKIndexList()
	}

	if err != nil {
		return nil, err
	}

	// 缓存30秒
	s.cache.Set(cacheKey, indices, 30*time.Second)
	return indices, nil
}

// fetchAIndexList 获取A股指数列表
func (s *MarketService) fetchAIndexList() ([]IndexData, error) {
	// A股主要指数
	indexCodes := []struct {
		secid string
		name  string
	}{
		{"1.000001", "上证指数"},
		{"0.399001", "深证成指"},
		{"0.399006", "创业板指"},
		{"1.000688", "科创50"},
	}

	var indices []IndexData
	for _, idx := range indexCodes {
		data, err := s.fetchIndexData(idx.secid, idx.name)
		if err != nil {
			log.Printf("获取指数 %s 失败: %v", idx.name, err)
			continue
		}
		indices = append(indices, *data)
	}

	return indices, nil
}

// fetchHKIndexList 获取港股指数列表
func (s *MarketService) fetchHKIndexList() ([]IndexData, error) {
	indexCodes := []struct {
		secid string
		name  string
	}{
		{"100.HSI", "恒生指数"},
		{"100.HSCEI", "国企指数"},
		{"124.HSTECH", "恒生科技"},
	}

	var indices []IndexData
	for _, idx := range indexCodes {
		data, err := s.fetchIndexData(idx.secid, idx.name)
		if err != nil {
			log.Printf("获取指数 %s 失败: %v", idx.name, err)
			continue
		}
		indices = append(indices, *data)
	}

	return indices, nil
}

// fetchIndexData 获取单个指数数据
func (s *MarketService) fetchIndexData(secid, name string) (*IndexData, error) {
	params := url.Values{}
	params.Set("secid", secid)
	params.Set("fields", "f43,f44,f45,f46,f47,f48,f57,f58,f60,f169,f170")

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
		return nil, fmt.Errorf("no data for %s", secid)
	}

	// 解析数据
	symbol := secid
	if parts := strings.Split(secid, "."); len(parts) == 2 {
		symbol = parts[1]
	}

	data := &IndexData{
		Symbol:      symbol,
		Name:        name,
		LatestPrice: getFloatValue(resp.Data, "f43"),
		ChangePct:   getFloatValue(resp.Data, "f170"),
		ChangeAmt:   getFloatValue(resp.Data, "f169"),
		Open:        getFloatValue(resp.Data, "f46"),
		High:        getFloatValue(resp.Data, "f44"),
		Low:         getFloatValue(resp.Data, "f45"),
		PreClose:    getFloatValue(resp.Data, "f60"),
		Volume:      getInt64Value(resp.Data, "f47"),
		Turnover:    getFloatValue(resp.Data, "f48"),
		UpdatedAt:   time.Now(),
	}

	// 获取分时数据
	trendData, err := s.fetchIndexTrend(secid)
	if err == nil {
		data.TrendData = trendData
	}

	return data, nil
}

// fetchIndexTrend 获取指数分时数据
func (s *MarketService) fetchIndexTrend(secid string) ([][]any, error) {
	params := url.Values{}
	params.Set("secid", secid)
	params.Set("fields1", "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13")
	params.Set("fields2", "f51,f52,f53,f54,f55,f56,f57,f58")

	apiURL := "https://push2.eastmoney.com/api/qt/stock/trends2/get?" + params.Encode()
	body, err := utils.FetchURL(apiURL)
	if err != nil {
		return nil, err
	}

	var resp struct {
		Data struct {
			Trends   []string `json:"trends"`
			PreClose float64  `json:"preClose"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, err
	}

	var trendData [][]any
	for _, line := range resp.Data.Trends {
		parts := strings.Split(line, ",")
		if len(parts) < 2 {
			continue
		}
		// 时间,价格
		price, _ := strconv.ParseFloat(parts[1], 64)
		trendData = append(trendData, []any{parts[0], price})
	}

	return trendData, nil
}

// GetDistribution 获取涨跌分布
func (s *MarketService) GetDistribution(market string) (*DistributionData, error) {
	cacheKey := fmt.Sprintf("distribution_%s", market)
	if data, ok := s.cache.Get(cacheKey); ok {
		return data.(*DistributionData), nil
	}

	// 获取市场所有股票
	var fs string
	if market == "a" {
		fs = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23"
	} else {
		fs = "m:116,m:117"
	}

	params := url.Values{}
	params.Set("pn", "1")
	params.Set("pz", "5000")
	params.Set("po", "1")
	params.Set("np", "1")
	params.Set("fltt", "2")
	params.Set("invt", "2")
	params.Set("fid", "f3")
	params.Set("fs", fs)
	params.Set("fields", "f3")

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

	dist := &DistributionData{
		Up:   make(map[string]int),
		Down: make(map[string]int),
		Flat: 0,
	}

	for _, item := range resp.Data.Diff {
		pct := getFloatValue(item, "f3")
		if pct > 7 {
			dist.Up[">7%"]++
		} else if pct > 5 {
			dist.Up["5-7%"]++
		} else if pct > 3 {
			dist.Up["3-5%"]++
		} else if pct > 0 {
			dist.Up["0-3%"]++
		} else if pct == 0 {
			dist.Flat++
		} else if pct > -3 {
			dist.Down["0-3%"]++
		} else if pct > -5 {
			dist.Down["3-5%"]++
		} else if pct > -7 {
			dist.Down["5-7%"]++
		} else {
			dist.Down[">7%"]++
		}
	}

	// 缓存30秒
	s.cache.Set(cacheKey, dist, 30*time.Second)
	return dist, nil
}

// GetHotSectors 获取热门板块
func (s *MarketService) GetHotSectors(market string, limit int) ([]SectorData, error) {
	cacheKey := fmt.Sprintf("hot_sectors_%s", market)
	if data, ok := s.cache.Get(cacheKey); ok {
		return data.([]SectorData), nil
	}

	if limit <= 0 {
		limit = 10
	}

	var fs string
	if market == "a" {
		// A股行业板块
		fs = "m:90+t:2"
	} else {
		// 港股暂时用A股板块
		fs = "m:90+t:2"
	}

	params := url.Values{}
	params.Set("pn", "1")
	params.Set("pz", strconv.Itoa(limit))
	params.Set("po", "1")
	params.Set("np", "1")
	params.Set("fltt", "2")
	params.Set("invt", "2")
	params.Set("fid", "f3")
	params.Set("fs", fs)
	params.Set("fields", "f1,f2,f3,f4,f12,f14")

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

	var sectors []SectorData
	for _, item := range resp.Data.Diff {
		sector := SectorData{
			Name:      getStringValue(item, "f14"),
			ChangePct: getFloatValue(item, "f3"),
		}

		// 获取板块内领涨股票
		sectorCode := getStringValue(item, "f12")
		stocks, _ := s.fetchSectorStocks(sectorCode, 3)
		sector.Stocks = stocks

		sectors = append(sectors, sector)
	}

	// 缓存60秒
	s.cache.Set(cacheKey, sectors, 60*time.Second)
	return sectors, nil
}

// fetchSectorStocks 获取板块内股票
func (s *MarketService) fetchSectorStocks(sectorCode string, limit int) ([]SectorStock, error) {
	params := url.Values{}
	params.Set("pn", "1")
	params.Set("pz", strconv.Itoa(limit))
	params.Set("po", "1")
	params.Set("np", "1")
	params.Set("fltt", "2")
	params.Set("invt", "2")
	params.Set("fid", "f3")
	params.Set("fs", fmt.Sprintf("b:%s", sectorCode))
	params.Set("fields", "f12,f14,f3")

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

	var stocks []SectorStock
	for _, item := range resp.Data.Diff {
		stock := SectorStock{
			Symbol:    getStringValue(item, "f12"),
			Name:      getStringValue(item, "f14"),
			ChangePct: getFloatValue(item, "f3"),
		}
		stocks = append(stocks, stock)
	}

	return stocks, nil
}

// GetTopGainers 获取涨幅榜
func (s *MarketService) GetTopGainers(market string, limit int) ([]TopGainerData, error) {
	cacheKey := fmt.Sprintf("top_gainers_%s_%d", market, limit)
	if data, ok := s.cache.Get(cacheKey); ok {
		return data.([]TopGainerData), nil
	}

	if limit <= 0 {
		limit = 20
	}

	var fs string
	if market == "a" {
		// A股：沪市主板+深市主板+创业板+科创板
		fs = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23"
	} else {
		// 港股：主板
		fs = "m:116+t:3,m:117+t:3"
	}

	params := url.Values{}
	params.Set("pn", "1")
	params.Set("pz", strconv.Itoa(limit))
	params.Set("po", "1")
	params.Set("np", "1")
	params.Set("fltt", "2")
	params.Set("invt", "2")
	params.Set("fid", "f3")
	params.Set("fs", fs)
	params.Set("fields", "f2,f3,f4,f6,f8,f12,f14")

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

	var gainers []TopGainerData
	for _, item := range resp.Data.Diff {
		gainer := TopGainerData{
			Symbol:       getStringValue(item, "f12"),
			Name:         getStringValue(item, "f14"),
			LatestPrice:  getFloatValue(item, "f2"),
			ChangePct:    getFloatValue(item, "f3"),
			ChangeAmt:    getFloatValue(item, "f4"),
			Amount:       getFloatValue(item, "f6"),
			TurnoverRate: getFloatValue(item, "f8"),
		}
		gainers = append(gainers, gainer)
	}

	// 按涨幅排序
	sort.Slice(gainers, func(i, j int) bool {
		return gainers[i].ChangePct > gainers[j].ChangePct
	})

	// 缓存30秒
	s.cache.Set(cacheKey, gainers, 30*time.Second)
	return gainers, nil
}

// 辅助函数
func getFloatValue(m map[string]any, key string) float64 {
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

func getInt64Value(m map[string]any, key string) int64 {
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

func getStringValue(m map[string]any, key string) string {
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
