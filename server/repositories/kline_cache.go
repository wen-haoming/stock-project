package repositories

import (
	"log"
	"server/models"
	"sort"
	"sync"
	"time"
)

// KlineCache K线数据内存缓存（使用 sync.Map 实现高并发读写）
type KlineCache struct {
	// A股: key=symbol, value=[]*models.StockKline (按日期排序)
	aKlines sync.Map
	// 港股: key=symbol, value=[]*models.StockKline (按日期排序)
	hkKlines sync.Map

	// 统计信息
	aCount      int64
	hkCount     int64
	lastSyncA   time.Time
	lastSyncHK  time.Time
	initialized bool
	mu          sync.RWMutex
}

var klineCache *KlineCache
var klineCacheOnce sync.Once

// GetKlineCache 获取K线缓存单例
func GetKlineCache() *KlineCache {
	klineCacheOnce.Do(func() {
		klineCache = &KlineCache{}
		log.Println("[KlineCache] K线缓存初始化完成")
	})
	return klineCache
}

// getKlineMap 根据市场获取对应的 sync.Map
func (c *KlineCache) getKlineMap(market string) *sync.Map {
	if market == "a" {
		return &c.aKlines
	}
	return &c.hkKlines
}

// Get 获取指定股票的K线数据
func (c *KlineCache) Get(symbol, market, startDate, endDate string) ([]models.StockKline, bool) {
	klineMap := c.getKlineMap(market)
	data, ok := klineMap.Load(symbol)
	if !ok {
		return nil, false
	}

	klines := data.([]*models.StockKline)
	if len(klines) == 0 {
		return nil, false
	}

	// 过滤日期范围
	var result []models.StockKline
	for _, kline := range klines {
		if startDate != "" && kline.Date < startDate {
			continue
		}
		if endDate != "" && kline.Date > endDate {
			continue
		}
		result = append(result, *kline)
	}

	return result, len(result) > 0
}

// Set 设置单只股票的K线数据
func (c *KlineCache) Set(symbol, market string, klines []models.StockKline) {
	klineMap := c.getKlineMap(market)
	
	// 转换为指针切片并排序
	ptrKlines := make([]*models.StockKline, len(klines))
	for i := range klines {
		ptrKlines[i] = &klines[i]
	}
	
	// 按日期排序
	sort.Slice(ptrKlines, func(i, j int) bool {
		return ptrKlines[i].Date < ptrKlines[j].Date
	})
	
	klineMap.Store(symbol, ptrKlines)
}

// BatchSet 批量设置K线数据
func (c *KlineCache) BatchSet(klines []models.StockKline, market string) {
	klineMap := c.getKlineMap(market)
	
	// 按股票分组
	symbolMap := make(map[string][]models.StockKline)
	for _, kline := range klines {
		symbolMap[kline.Symbol] = append(symbolMap[kline.Symbol], kline)
	}
	
	// 存储每个股票的K线数据
	for symbol, stockKlines := range symbolMap {
		c.Set(symbol, market, stockKlines)
	}
	
	// 更新统计信息
	c.mu.Lock()
	if market == "a" {
		c.aCount = int64(len(symbolMap))
		c.lastSyncA = time.Now()
	} else {
		c.hkCount = int64(len(symbolMap))
		c.lastSyncHK = time.Now()
	}
	c.initialized = true
	c.mu.Unlock()
}

// GetAllSymbols 获取所有有K线数据的股票代码
func (c *KlineCache) GetAllSymbols(market string) []string {
	klineMap := c.getKlineMap(market)
	var symbols []string
	
	klineMap.Range(func(key, value interface{}) bool {
		if symbol, ok := key.(string); ok {
			symbols = append(symbols, symbol)
		}
		return true
	})
	
	return symbols
}

// Count 获取缓存中的股票数量
func (c *KlineCache) Count(market string) int64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	
	if market == "a" {
		return c.aCount
	}
	return c.hkCount
}

// IsInitialized 检查缓存是否已初始化
func (c *KlineCache) IsInitialized() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.initialized
}

// Clear 清空指定市场的缓存
func (c *KlineCache) Clear(market string) {
	if market == "a" || market == "" {
		c.aKlines = sync.Map{}
		c.mu.Lock()
		c.aCount = 0
		c.mu.Unlock()
	}
	if market == "hk" || market == "" {
		c.hkKlines = sync.Map{}
		c.mu.Lock()
		c.hkCount = 0
		c.mu.Unlock()
	}
}

// CalculateRangeByAggregation 从内存计算区间涨幅（类似数据库聚合）
func (c *KlineCache) CalculateRangeByAggregation(startDate, endDate, market string) ([]RangeAggregationResult, error) {
	klineMap := c.getKlineMap(market)
	var results []RangeAggregationResult
	
	klineMap.Range(func(key, value interface{}) bool {
		symbol := key.(string)
		klines := value.([]*models.StockKline)
		
		// 找到范围内的第一条和最后一条
		var startKline, endKline *models.StockKline
		for _, kline := range klines {
			if kline.Date >= startDate && kline.Date <= endDate {
				if startKline == nil {
					startKline = kline
				}
				endKline = kline
			}
		}
		
		if startKline != nil && endKline != nil && startKline.Open > 0 {
			results = append(results, RangeAggregationResult{
				Symbol:     symbol,
				StartPrice: startKline.Open,
				EndPrice:   endKline.Close,
				StartDate:  startKline.Date,
				EndDate:    endKline.Date,
			})
		}
		
		return true
	})
	
	return results, nil
}

