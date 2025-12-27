package repositories

import (
	"context"
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
	return &KlineRepository{
		hkCollection: GetCollection("klines_hk"), // 港股 K 线
		aCollection:  GetCollection("klines_a"),  // A 股 K 线
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

// RangeAggregationResult 区间聚合结果
type RangeAggregationResult struct {
	Symbol     string  `bson:"_id"`
	StartPrice float64 `bson:"startPrice"`
	EndPrice   float64 `bson:"endPrice"`
	StartDate  string  `bson:"startDate"`
	EndDate    string  `bson:"endDate"`
}

// CalculateRangeByAggregation 使用聚合计算区间涨幅
func (r *KlineRepository) CalculateRangeByAggregation(ctx context.Context, startDate, endDate, market string) ([]RangeAggregationResult, error) {
	collection := r.getCollection(market)
	pipeline := mongo.Pipeline{
		// 先按日期排序，确保 $first/$last 正确
		{{Key: "$match", Value: bson.M{
			"date": bson.M{"$gte": startDate, "$lte": endDate},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "symbol", Value: 1}, {Key: "date", Value: 1}}}},
		// 按股票分组，获取首尾价格
		{{Key: "$group", Value: bson.M{
			"_id":        "$symbol",
			"startPrice": bson.M{"$first": "$open"},
			"endPrice":   bson.M{"$last": "$close"},
			"startDate":  bson.M{"$first": "$date"},
			"endDate":    bson.M{"$last": "$date"},
		}}},
	}

	cursor, err := collection.Aggregate(ctx, pipeline)
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
