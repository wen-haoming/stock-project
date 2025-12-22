package db

import (
	"context"
	"time"
)

const (
	// CacheDuration 缓存有效期（交易时间内5分钟，非交易时间1小时）
	TradingCacheDuration    = 5 * time.Minute
	NonTradingCacheDuration = 1 * time.Hour
)

// StockCache 股票数据缓存服务
type StockCache struct {
	repo *StockRepository
}

// NewStockCache 创建缓存服务
func NewStockCache() *StockCache {
	return &StockCache{
		repo: NewStockRepository(),
	}
}

// IsCacheValid 检查缓存是否有效
func (c *StockCache) IsCacheValid(ctx context.Context) bool {
	lastUpdate, err := c.repo.GetLastUpdateTime(ctx)
	if err != nil || lastUpdate.IsZero() {
		return false
	}

	cacheDuration := c.getCacheDuration()
	return time.Since(lastUpdate) < cacheDuration
}

// getCacheDuration 根据是否交易时间返回缓存时长
func (c *StockCache) getCacheDuration() time.Duration {
	if IsTradingTime() {
		return TradingCacheDuration
	}
	return NonTradingCacheDuration
}

// GetCachedStocks 获取缓存的股票数据
func (c *StockCache) GetCachedStocks(ctx context.Context, market string, page, pageSize int) ([]StockData, int64, bool, error) {
	if !c.IsCacheValid(ctx) {
		return nil, 0, false, nil
	}

	stocks, total, err := c.repo.GetStocksByMarket(ctx, market, page, pageSize)
	if err != nil {
		return nil, 0, false, err
	}

	return stocks, total, true, nil
}

// UpdateCache 更新缓存
func (c *StockCache) UpdateCache(ctx context.Context, stocks []StockData) error {
	return c.repo.UpsertStocks(ctx, stocks)
}

// IsTradingTime 判断当前是否为交易时间
// 港股交易时间: 9:30-12:00, 13:00-16:00 (香港时间)
// A股交易时间: 9:30-11:30, 13:00-15:00 (北京时间)
func IsTradingTime() bool {
	loc, _ := time.LoadLocation("Asia/Shanghai")
	now := time.Now().In(loc)

	// 周末不交易
	weekday := now.Weekday()
	if weekday == time.Saturday || weekday == time.Sunday {
		return false
	}

	hour := now.Hour()
	minute := now.Minute()
	totalMinutes := hour*60 + minute

	// A股交易时间段
	// 上午: 9:30 - 11:30 (570 - 690)
	// 下午: 13:00 - 15:00 (780 - 900)
	morningStart := 9*60 + 30  // 9:30
	morningEnd := 11*60 + 30   // 11:30
	afternoonStart := 13 * 60  // 13:00
	afternoonEnd := 15 * 60    // 15:00

	if (totalMinutes >= morningStart && totalMinutes <= morningEnd) ||
		(totalMinutes >= afternoonStart && totalMinutes <= afternoonEnd) {
		return true
	}

	return false
}

// IsHKTradingTime 判断是否为港股交易时间
func IsHKTradingTime() bool {
	loc, _ := time.LoadLocation("Asia/Hong_Kong")
	now := time.Now().In(loc)

	weekday := now.Weekday()
	if weekday == time.Saturday || weekday == time.Sunday {
		return false
	}

	hour := now.Hour()
	minute := now.Minute()
	totalMinutes := hour*60 + minute

	// 港股交易时间段
	// 上午: 9:30 - 12:00
	// 下午: 13:00 - 16:00
	morningStart := 9*60 + 30
	morningEnd := 12 * 60
	afternoonStart := 13 * 60
	afternoonEnd := 16 * 60

	if (totalMinutes >= morningStart && totalMinutes <= morningEnd) ||
		(totalMinutes >= afternoonStart && totalMinutes <= afternoonEnd) {
		return true
	}

	return false
}

// IsTradingDay 判断是否为交易日（简单判断，不包含节假日）
func IsTradingDay() bool {
	loc, _ := time.LoadLocation("Asia/Shanghai")
	now := time.Now().In(loc)
	weekday := now.Weekday()
	return weekday != time.Saturday && weekday != time.Sunday
}
