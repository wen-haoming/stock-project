package models

import "time"

// CacheInfo 缓存信息
type CacheInfo struct {
	Key       string    `json:"key" bson:"key"`
	Data      any       `json:"data" bson:"data"`
	ExpireAt  time.Time `json:"expireAt" bson:"expireAt"`
	CreatedAt time.Time `json:"createdAt" bson:"createdAt"`
}

// RangeCacheData 区间缓存数据
type RangeCacheData struct {
	StartDate string           `json:"startDate" bson:"startDate"`
	EndDate   string           `json:"endDate" bson:"endDate"`
	Market    string           `json:"market" bson:"market"`
	Data      []RangeStockData `json:"data" bson:"data"`
	UpdatedAt time.Time        `json:"updatedAt" bson:"updatedAt"`
	CreatedAt time.Time        `json:"createdAt" bson:"createdAt"`
}

// MemoryCacheEntry 内存缓存条目
type MemoryCacheEntry struct {
	Data      any
	ExpireAt  time.Time
	CreatedAt time.Time
}

// IsExpired 检查是否过期
func (e *MemoryCacheEntry) IsExpired() bool {
	return time.Now().After(e.ExpireAt)
}
