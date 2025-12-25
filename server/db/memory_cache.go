package db

import (
	"sync"
	"time"
)

// MemoryCache 内存缓存，用于加速热点数据访问
type MemoryCache struct {
	data      map[string]*memoryCacheItem
	mu        sync.RWMutex
	maxItems  int
	defaultTTL time.Duration
}

type memoryCacheItem struct {
	value     interface{}
	expireAt  time.Time
}

var (
	rangeMemoryCache *MemoryCache
	once             sync.Once
)

// GetRangeMemoryCache 获取 range 数据的内存缓存单例
func GetRangeMemoryCache() *MemoryCache {
	once.Do(func() {
		rangeMemoryCache = &MemoryCache{
			data:       make(map[string]*memoryCacheItem),
			maxItems:   100, // 最多缓存100个不同的日期范围
			defaultTTL: 30 * time.Minute, // 内存缓存30分钟
		}
		// 启动清理协程
		go rangeMemoryCache.cleanupLoop()
	})
	return rangeMemoryCache
}

// Get 获取缓存
func (c *MemoryCache) Get(key string) (interface{}, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	item, exists := c.data[key]
	if !exists {
		return nil, false
	}

	if time.Now().After(item.expireAt) {
		return nil, false
	}

	return item.value, true
}

// Set 设置缓存
func (c *MemoryCache) Set(key string, value interface{}, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// 如果缓存满了，删除最旧的
	if len(c.data) >= c.maxItems {
		c.evictOldest()
	}

	if ttl == 0 {
		ttl = c.defaultTTL
	}

	c.data[key] = &memoryCacheItem{
		value:    value,
		expireAt: time.Now().Add(ttl),
	}
}

// Delete 删除缓存
func (c *MemoryCache) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.data, key)
}

// evictOldest 删除最旧的缓存项
func (c *MemoryCache) evictOldest() {
	var oldestKey string
	var oldestTime time.Time

	for key, item := range c.data {
		if oldestKey == "" || item.expireAt.Before(oldestTime) {
			oldestKey = key
			oldestTime = item.expireAt
		}
	}

	if oldestKey != "" {
		delete(c.data, oldestKey)
	}
}

// cleanupLoop 定期清理过期缓存
func (c *MemoryCache) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		c.cleanup()
	}
}

// cleanup 清理过期缓存
func (c *MemoryCache) cleanup() {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	for key, item := range c.data {
		if now.After(item.expireAt) {
			delete(c.data, key)
		}
	}
}
