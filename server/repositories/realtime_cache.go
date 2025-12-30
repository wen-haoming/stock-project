package repositories

import (
	"log"
	"server/models"
	"server/utils"
	"sync"
	"time"
)

// RealtimeStockData 实时股票数据（轻量级，用于高频更新）
type RealtimeStockData struct {
	Symbol         string    `json:"symbol"`
	Name           string    `json:"name"`
	Market         string    `json:"market"`
	LatestPrice    float64   `json:"latestPrice"`
	Open           float64   `json:"open"`
	Close          float64   `json:"close"`
	High           float64   `json:"high"`
	Low            float64   `json:"low"`
	ChangePct      float64   `json:"changePct"`
	ChangeAmt      float64   `json:"changeAmt"`
	Volume         int64     `json:"volume"`
	Turnover       float64   `json:"turnover"`
	TurnoverRate   float64   `json:"turnoverRate"`
	Amplitude      float64   `json:"amplitude"`
	TotalMarketCap float64   `json:"totalMarketCap"`
	CircMarketCap  float64   `json:"circMarketCap"`
	PERatio        float64   `json:"peRatio"`
	PERatioStatic  float64   `json:"peRatioStatic"`
	PBRatio        float64   `json:"pbRatio"`
	Industry       string    `json:"industry"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

// RealtimeCache 实时数据缓存（使用 sync.Map 实现高并发读写）
type RealtimeCache struct {
	aStocks  sync.Map // A股: key=symbol, value=*RealtimeStockData
	hkStocks sync.Map // 港股: key=symbol, value=*RealtimeStockData

	// 统计信息
	aCount      int64
	hkCount     int64
	lastSyncA   time.Time
	lastSyncHK  time.Time
	initialized bool
	mu          sync.RWMutex
}

var realtimeCache *RealtimeCache
var realtimeCacheOnce sync.Once

// GetRealtimeCache 获取实时缓存单例
func GetRealtimeCache() *RealtimeCache {
	realtimeCacheOnce.Do(func() {
		realtimeCache = &RealtimeCache{}
		log.Println("[RealtimeCache] 实时缓存初始化完成")
	})
	return realtimeCache
}

// getStockMap 根据市场获取对应的 sync.Map
func (c *RealtimeCache) getStockMap(market string) *sync.Map {
	if market == "a" {
		return &c.aStocks
	}
	return &c.hkStocks
}

// Get 获取单只股票的实时数据
func (c *RealtimeCache) Get(symbol, market string) (*RealtimeStockData, bool) {
	stockMap := c.getStockMap(market)
	if data, ok := stockMap.Load(symbol); ok {
		return data.(*RealtimeStockData), true
	}
	return nil, false
}

// Set 设置单只股票的实时数据
func (c *RealtimeCache) Set(symbol, market string, data *RealtimeStockData) {
	stockMap := c.getStockMap(market)
	stockMap.Store(symbol, data)
}

// BatchSet 批量设置股票实时数据
func (c *RealtimeCache) BatchSet(stocks []models.StockData, market string) {
	stockMap := c.getStockMap(market)
	now := time.Now()
	count := int64(0)

	for _, stock := range stocks {
		realtimeData := &RealtimeStockData{
			Symbol:         stock.Symbol,
			Name:           stock.Name,
			Market:         market,
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
			PERatioStatic:  stock.PERatioStatic,
			PBRatio:        stock.PBRatio,
			Industry:       stock.Industry,
			UpdatedAt:      now,
		}
		stockMap.Store(stock.Symbol, realtimeData)
		count++
	}

	// 更新统计信息
	c.mu.Lock()
	if market == "a" {
		c.aCount = count
		c.lastSyncA = now
	} else {
		c.hkCount = count
		c.lastSyncHK = now
	}
	c.initialized = true
	c.mu.Unlock()
}

// GetAll 获取指定市场的所有实时数据
func (c *RealtimeCache) GetAll(market string) []*RealtimeStockData {
	stockMap := c.getStockMap(market)
	var result []*RealtimeStockData

	stockMap.Range(func(key, value interface{}) bool {
		result = append(result, value.(*RealtimeStockData))
		return true
	})

	return result
}

// GetAllAsStockData 获取所有数据并转换为 StockData 格式
func (c *RealtimeCache) GetAllAsStockData(market string) []models.StockData {
	stockMap := c.getStockMap(market)
	var result []models.StockData

	stockMap.Range(func(key, value interface{}) bool {
		rd := value.(*RealtimeStockData)
		stock := models.StockData{
			Symbol:         rd.Symbol,
			Name:           rd.Name,
			Market:         rd.Market,
			LatestPrice:    rd.LatestPrice,
			Open:           rd.Open,
			Close:          rd.Close,
			High:           rd.High,
			Low:            rd.Low,
			ChangePct:      rd.ChangePct,
			ChangeAmt:      rd.ChangeAmt,
			Volume:         rd.Volume,
			Turnover:       rd.Turnover,
			TurnoverRate:   rd.TurnoverRate,
			Amplitude:      rd.Amplitude,
			TotalMarketCap: rd.TotalMarketCap,
			CircMarketCap:  rd.CircMarketCap,
			PERatio:        rd.PERatio,
			PERatioStatic:  rd.PERatioStatic,
			PBRatio:        rd.PBRatio,
			Industry:       rd.Industry,
			UpdatedAt:      rd.UpdatedAt,
		}
		result = append(result, stock)
		return true
	})

	return result
}

// GetBySymbols 批量获取股票数据
func (c *RealtimeCache) GetBySymbols(symbols []string, market string) []*RealtimeStockData {
	stockMap := c.getStockMap(market)
	var result []*RealtimeStockData

	for _, symbol := range symbols {
		if data, ok := stockMap.Load(symbol); ok {
			result = append(result, data.(*RealtimeStockData))
		}
	}

	return result
}

// Count 获取缓存中的股票数量
func (c *RealtimeCache) Count(market string) int64 {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if market == "a" {
		return c.aCount
	}
	return c.hkCount
}

// GetLastSyncTime 获取最后同步时间
func (c *RealtimeCache) GetLastSyncTime(market string) time.Time {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if market == "a" {
		return c.lastSyncA
	}
	return c.lastSyncHK
}

// IsInitialized 检查缓存是否已初始化
func (c *RealtimeCache) IsInitialized() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.initialized
}

// IsHealthy 检查缓存是否健康
func (c *RealtimeCache) IsHealthy() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()

	// 至少有一个市场有数据
	return c.aCount > 100 || c.hkCount > 100
}

// NeedsUpdate 检查是否需要更新
func (c *RealtimeCache) NeedsUpdate(market string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()

	now := utils.GetChinaTime()
	var lastSync time.Time
	var count int64

	if market == "a" {
		lastSync = c.lastSyncA
		count = c.aCount
	} else {
		lastSync = c.lastSyncHK
		count = c.hkCount
	}

	// 如果没有数据，需要更新
	if count == 0 {
		return true
	}

	// 交易时间：超过30秒需要更新
	if utils.IsTradingTime(now, market) {
		return time.Since(lastSync) > 30*time.Second
	}

	// 非交易时间：超过30分钟需要更新
	return time.Since(lastSync) > 30*time.Minute
}

// Clear 清空指定市场的缓存
func (c *RealtimeCache) Clear(market string) {
	if market == "a" || market == "" {
		c.aStocks = sync.Map{}
		c.mu.Lock()
		c.aCount = 0
		c.mu.Unlock()
	}
	if market == "hk" || market == "" {
		c.hkStocks = sync.Map{}
		c.mu.Lock()
		c.hkCount = 0
		c.mu.Unlock()
	}
}

// GetStats 获取缓存统计信息
func (c *RealtimeCache) GetStats() map[string]interface{} {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return map[string]interface{}{
		"aCount":      c.aCount,
		"hkCount":     c.hkCount,
		"lastSyncA":   c.lastSyncA,
		"lastSyncHK":  c.lastSyncHK,
		"initialized": c.initialized,
		"healthy":     c.aCount > 100 || c.hkCount > 100,
	}
}
