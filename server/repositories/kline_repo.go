package repositories

import (
	"context"
	"log"
	"server/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// KlineRepository K线数据仓库
type KlineRepository struct {
	hkCollection *mongo.Collection
	aCollection  *mongo.Collection
}

// NewKlineRepository 创建K线仓库实例
func NewKlineRepository() *KlineRepository {
	repo := &KlineRepository{
		hkCollection: GetCollection("klines_hk"),
		aCollection:  GetCollection("klines_a"),
	}
	// 确保索引存在
	repo.ensureIndexes()
	return repo
}

// ensureIndexes 创建必要的索引
func (r *KlineRepository) ensureIndexes() {
	ctx := context.Background()
	
	// 为两个集合创建复合索引
	for _, coll := range []*mongo.Collection{r.hkCollection, r.aCollection} {
		if coll == nil {
			continue
		}
		indexes := []mongo.IndexModel{
			// 复合索引：symbol + date（用于聚合查询）
			{
				Keys:    bson.D{{Key: "symbol", Value: 1}, {Key: "date", Value: 1}},
				Options: options.Index().SetBackground(true),
			},
			// 日期索引（用于范围查询）
			{
				Keys:    bson.D{{Key: "date", Value: 1}},
				Options: options.Index().SetBackground(true),
			},
		}
		
		_, err := coll.Indexes().CreateMany(ctx, indexes)
		if err != nil {
			log.Printf("创建索引失败: %v", err)
		}
	}
}

// getCollection 根据市场获取对应的集合
func (r *KlineRepository) getCollection(market string) *mongo.Collection {
	if market == "a" {
		return r.aCollection
	}
	return r.hkCollection
}

// UpsertKlines 批量插入或更新K线数据
func (r *KlineRepository) UpsertKlines(ctx context.Context, klines []models.StockKline, market string) error {
	if len(klines) == 0 {
		return nil
	}

	collection := r.getCollection(market)
	var operations []mongo.WriteModel
	for _, kline := range klines {
		filter := bson.M{"symbol": kline.Symbol, "date": kline.Date}
		update := bson.M{"$set": kline}
		operation := mongo.NewUpdateOneModel().SetFilter(filter).SetUpdate(update).SetUpsert(true)
		operations = append(operations, operation)
	}

	opts := options.BulkWrite().SetOrdered(false)
	_, err := collection.BulkWrite(ctx, operations, opts)
	return err
}

// GetKlinesBySymbol 获取指定股票的K线数据
func (r *KlineRepository) GetKlinesBySymbol(ctx context.Context, symbol, market, startDate, endDate string) ([]models.StockKline, error) {
	filter := bson.M{"symbol": symbol}
	if startDate != "" && endDate != "" {
		filter["date"] = bson.M{"$gte": startDate, "$lte": endDate}
	} else if startDate != "" {
		filter["date"] = bson.M{"$gte": startDate}
	} else if endDate != "" {
		filter["date"] = bson.M{"$lte": endDate}
	}

	collection := r.getCollection(market)
	opts := options.Find().SetSort(bson.D{{Key: "date", Value: 1}})
	cursor, err := collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var klines []models.StockKline
	if err = cursor.All(ctx, &klines); err != nil {
		return nil, err
	}
	return klines, nil
}

// GetLatestKlineDate 获取最新K线日期
func (r *KlineRepository) GetLatestKlineDate(ctx context.Context, symbol, market string) (string, error) {
	collection := r.getCollection(market)
	opts := options.FindOne().SetSort(bson.D{{Key: "date", Value: -1}})
	var kline models.StockKline
	err := collection.FindOne(ctx, bson.M{"symbol": symbol}, opts).Decode(&kline)
	if err != nil {
		return "", err
	}
	return kline.Date, nil
}

// GetGlobalLatestKlineDate 获取整个市场最新的K线日期
func (r *KlineRepository) GetGlobalLatestKlineDate(ctx context.Context, market string) (string, error) {
	collection := r.getCollection(market)
	opts := options.FindOne().SetSort(bson.D{{Key: "date", Value: -1}})
	var kline models.StockKline
	err := collection.FindOne(ctx, bson.M{}, opts).Decode(&kline)
	if err != nil {
		return "", err
	}
	return kline.Date, nil
}

// GetAllSymbols 获取所有有K线数据的股票代码
func (r *KlineRepository) GetAllSymbols(ctx context.Context, market string) ([]string, error) {
	collection := r.getCollection(market)
	symbols, err := collection.Distinct(ctx, "symbol", bson.M{})
	if err != nil {
		return nil, err
	}

	result := make([]string, 0, len(symbols))
	for _, s := range symbols {
		if str, ok := s.(string); ok {
			result = append(result, str)
		}
	}
	return result, nil
}

// CountKlines 统计K线数量
func (r *KlineRepository) CountKlines(ctx context.Context, market string) (int64, error) {
	collection := r.getCollection(market)
	return collection.CountDocuments(ctx, bson.M{})
}

// CountKlinesBySymbol 统计指定股票的K线数量
func (r *KlineRepository) CountKlinesBySymbol(ctx context.Context, symbol, market string) (int64, error) {
	collection := r.getCollection(market)
	return collection.CountDocuments(ctx, bson.M{"symbol": symbol})
}

// GetLastKlineDate 获取最后一条K线的日期
func (r *KlineRepository) GetLastKlineDate(ctx context.Context, market string) (string, error) {
	collection := r.getCollection(market)
	opts := options.FindOne().SetSort(bson.D{{Key: "date", Value: -1}})

	var result struct {
		Date string `bson:"date"`
	}
	err := collection.FindOne(ctx, bson.M{}, opts).Decode(&result)
	if err != nil {
		return "", err
	}
	return result.Date, nil
}

// RangeAggregationResult 区间聚合结果
type RangeAggregationResult struct {
	Symbol     string  `bson:"_id"`
	StartPrice float64 `bson:"startPrice"`
	EndPrice   float64 `bson:"endPrice"`
	StartDate  string  `bson:"startDate"`
	EndDate    string  `bson:"endDate"`
}

// CalculateRangeByAggregation 使用聚合计算区间涨幅（优化版）
func (r *KlineRepository) CalculateRangeByAggregation(ctx context.Context, startDate, endDate, market string) ([]RangeAggregationResult, error) {
	collection := r.getCollection(market)
	
	// 优化的聚合管道：使用 $facet 并行获取首尾记录
	pipeline := mongo.Pipeline{
		// 1. 筛选日期范围
		{{Key: "$match", Value: bson.M{
			"date": bson.M{"$gte": startDate, "$lte": endDate},
		}}},
		// 2. 按股票分组，直接获取首尾价格（利用索引排序）
		{{Key: "$group", Value: bson.M{
			"_id": "$symbol",
			"dates": bson.M{"$push": bson.M{
				"date":  "$date",
				"open":  "$open",
				"close": "$close",
			}},
		}}},
		// 3. 提取首尾数据
		{{Key: "$project", Value: bson.M{
			"_id":        1,
			"startPrice": bson.M{"$arrayElemAt": bson.A{"$dates.open", 0}},
			"endPrice":   bson.M{"$arrayElemAt": bson.A{"$dates.close", -1}},
			"startDate":  bson.M{"$arrayElemAt": bson.A{"$dates.date", 0}},
			"endDate":    bson.M{"$arrayElemAt": bson.A{"$dates.date", -1}},
		}}},
	}

	// 设置允许使用磁盘
	opts := options.Aggregate().SetAllowDiskUse(true)
	cursor, err := collection.Aggregate(ctx, pipeline, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var results []RangeAggregationResult
	if err = cursor.All(ctx, &results); err != nil {
		return nil, err
	}
	return results, nil
}

// DeleteKlinesBySymbol 删除指定股票的K线数据
func (r *KlineRepository) DeleteKlinesBySymbol(ctx context.Context, symbol, market string) (int64, error) {
	collection := r.getCollection(market)
	result, err := collection.DeleteMany(ctx, bson.M{"symbol": symbol})
	if err != nil {
		return 0, err
	}
	return result.DeletedCount, nil
}
