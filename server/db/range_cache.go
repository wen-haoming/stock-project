package db

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// RangeStockData 区间涨幅数据
type RangeStockData struct {
	Symbol         string  `bson:"symbol" json:"symbol"`
	Name           string  `bson:"name" json:"name"`
	StartPrice     float64 `bson:"startPrice" json:"startPrice"`
	EndPrice       float64 `bson:"endPrice" json:"endPrice"`
	ChangePct      float64 `bson:"changePct" json:"changePct"`
	LatestPrice    float64 `bson:"latestPrice" json:"latestPrice"`
	TotalMarketCap float64 `bson:"totalMarketCap" json:"totalMarketCap"`
	CircMarketCap  float64 `bson:"circMarketCap" json:"circMarketCap"`
	PERatio        float64 `bson:"peRatio" json:"peRatio"`
	PBRatio        float64 `bson:"pbRatio" json:"pbRatio"`
	TurnoverRate   float64 `bson:"turnoverRate" json:"turnoverRate"`
	Industry       string  `bson:"industry" json:"industry"`
}

// RangeCacheData 区间数据缓存
type RangeCacheData struct {
	CacheKey  string           `bson:"cacheKey"` // startDate_endDate
	StartDate string           `bson:"startDate"`
	EndDate   string           `bson:"endDate"`
	Data      []RangeStockData `bson:"data"`
	UpdatedAt time.Time        `bson:"updatedAt"`
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
func (r *RangeCacheRepository) GetCache(ctx context.Context, startDate, endDate string) (*RangeCacheData, error) {
	cacheKey := startDate + "_" + endDate

	var cache RangeCacheData
	err := r.collection.FindOne(ctx, bson.M{"cacheKey": cacheKey}).Decode(&cache)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &cache, nil
}

// SetCache 设置缓存
func (r *RangeCacheRepository) SetCache(ctx context.Context, startDate, endDate string, data []RangeStockData) error {
	cacheKey := startDate + "_" + endDate

	cache := RangeCacheData{
		CacheKey:  cacheKey,
		StartDate: startDate,
		EndDate:   endDate,
		Data:      data,
		UpdatedAt: time.Now(),
	}

	opts := options.Update().SetUpsert(true)
	_, err := r.collection.UpdateOne(
		ctx,
		bson.M{"cacheKey": cacheKey},
		bson.M{"$set": cache},
		opts,
	)
	return err
}

// IsCacheValid 检查缓存是否有效（24小时内有效）
func (r *RangeCacheRepository) IsCacheValid(cache *RangeCacheData) bool {
	if cache == nil {
		return false
	}
	// 缓存24小时有效（历史数据变化不大）
	return time.Since(cache.UpdatedAt) < 24*time.Hour
}

// ClearOldCache 清理旧缓存（保留最近7天的）
func (r *RangeCacheRepository) ClearOldCache(ctx context.Context) error {
	cutoff := time.Now().AddDate(0, 0, -7)
	_, err := r.collection.DeleteMany(ctx, bson.M{"updatedAt": bson.M{"$lt": cutoff}})
	return err
}
