package repositories

import (
	"context"
	"server/config"
	"server/models"
	"server/utils"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// MemoryCache 内存缓存
type MemoryCache struct {
	data    map[string]*models.MemoryCacheEntry
	mu      sync.RWMutex
	maxSize int
	ttl     time.Duration
}

var memoryCache *MemoryCache
var memoryCacheOnce sync.Once

// GetMemoryCache 获取内存缓存单例
func GetMemoryCache() *MemoryCache {
	memoryCacheOnce.Do(func() {
		cfg := config.Get()
		memoryCache = &MemoryCache{
			data:    make(map[string]*models.MemoryCacheEntry),
			maxSize: cfg.Cache.MemoryMaxSize,
			ttl:     cfg.Cache.MemoryTTL,
		}
		// 启动清理协程
		go memoryCache.cleanupLoop()
	})
	return memoryCache
}

// Get 获取缓存
func (c *MemoryCache) Get(key string) (any, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entry, exists := c.data[key]
	if !exists || entry.IsExpired() {
		return nil, false
	}
	return entry.Data, true
}

// Set 设置缓存
func (c *MemoryCache) Set(key string, value any, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// 如果超过最大容量，清理过期数据
	if len(c.data) >= c.maxSize {
		c.cleanupExpired()
	}

	if ttl == 0 {
		ttl = c.ttl
	}

	c.data[key] = &models.MemoryCacheEntry{
		Data:      value,
		ExpireAt:  time.Now().Add(ttl),
		CreatedAt: time.Now(),
	}
}

// Delete 删除缓存
func (c *MemoryCache) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.data, key)
}

// Clear 清空缓存
func (c *MemoryCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.data = make(map[string]*models.MemoryCacheEntry)
}

func (c *MemoryCache) cleanupExpired() {
	for key, entry := range c.data {
		if entry.IsExpired() {
			delete(c.data, key)
		}
	}
}

func (c *MemoryCache) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		c.mu.Lock()
		c.cleanupExpired()
		c.mu.Unlock()
	}
}

// RangeCacheRepository 区间缓存仓库
type RangeCacheRepository struct {
	collection *mongo.Collection
}

// NewRangeCacheRepository 创建区间缓存仓库
func NewRangeCacheRepository() *RangeCacheRepository {
	return &RangeCacheRepository{
		collection: GetCollection("range_cache"),
	}
}

// GetCache 获取缓存
func (r *RangeCacheRepository) GetCache(ctx context.Context, startDate, endDate, market string) (*models.RangeCacheData, error) {
	filter := bson.M{
		"startDate": startDate,
		"endDate":   endDate,
		"market":    market,
	}

	var cache models.RangeCacheData
	err := r.collection.FindOne(ctx, filter).Decode(&cache)
	if err != nil {
		return nil, err
	}
	return &cache, nil
}

// SetCache 设置缓存
func (r *RangeCacheRepository) SetCache(ctx context.Context, cache *models.RangeCacheData) error {
	cache.UpdatedAt = time.Now()
	if cache.CreatedAt.IsZero() {
		cache.CreatedAt = time.Now()
	}

	filter := bson.M{
		"startDate": cache.StartDate,
		"endDate":   cache.EndDate,
		"market":    cache.Market,
	}
	update := bson.M{"$set": cache}
	opts := options.Update().SetUpsert(true)

	_, err := r.collection.UpdateOne(ctx, filter, update, opts)
	return err
}

// IsCacheValid 检查缓存是否有效（24小时内）
func (r *RangeCacheRepository) IsCacheValid(cache *models.RangeCacheData) bool {
	if cache == nil {
		return false
	}
	return time.Since(cache.UpdatedAt) < 24*time.Hour
}

// ClearOldCache 清理旧缓存（7天前）
func (r *RangeCacheRepository) ClearOldCache(ctx context.Context) (int64, error) {
	cutoff := time.Now().AddDate(0, 0, -7)
	result, err := r.collection.DeleteMany(ctx, bson.M{"updatedAt": bson.M{"$lt": cutoff}})
	if err != nil {
		return 0, err
	}
	return result.DeletedCount, nil
}

// GetCacheTTL 根据交易时间获取缓存 TTL
func GetCacheTTL(market string) time.Duration {
	cfg := config.Get()
	if utils.IsTradingTime(time.Now(), market) {
		return cfg.Cache.TradingTTL
	}
	return cfg.Cache.NonTradingTTL
}
