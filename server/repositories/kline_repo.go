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
			// TTL索引：自动清理90天前的旧数据，释放磁盘空间
			{
				Keys:    bson.D{{Key: "date", Value: 1}},
				Options: options.Index().SetExpireAfterSeconds(90 * 24 * 3600).SetName("idx_ttl_date"),
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
	// 使用 EstimatedDocumentCount 更快（基于集合元数据）
	return collection.EstimatedDocumentCount(ctx)
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

// DeleteAllKlines 清空指定市场的所有K线数据
func (r *KlineRepository) DeleteAllKlines(ctx context.Context, market string) (int64, error) {
	collection := r.getCollection(market)
	result, err := collection.DeleteMany(ctx, bson.M{})
	if err != nil {
		return 0, err
	}
	return result.DeletedCount, nil
}

// DeleteKlinesByDateRange 删除指定日期范围的K线数据
func (r *KlineRepository) DeleteKlinesByDateRange(ctx context.Context, market, startDate, endDate string) (int64, error) {
	collection := r.getCollection(market)
	filter := bson.M{
		"date": bson.M{"$gte": startDate, "$lte": endDate},
	}
	result, err := collection.DeleteMany(ctx, filter)
	if err != nil {
		return 0, err
	}
	return result.DeletedCount, nil
}

// GetKlineDateRange 获取K线数据的日期范围
func (r *KlineRepository) GetKlineDateRange(ctx context.Context, market string) (minDate, maxDate string, count int64, err error) {
	collection := r.getCollection(market)

	// 获取最早日期
	optsMin := options.FindOne().SetSort(bson.D{{Key: "date", Value: 1}})
	var minResult struct {
		Date string `bson:"date"`
	}
	if err := collection.FindOne(ctx, bson.M{}, optsMin).Decode(&minResult); err != nil {
		if err == mongo.ErrNoDocuments {
			return "", "", 0, nil
		}
		return "", "", 0, err
	}

	// 获取最新日期
	optsMax := options.FindOne().SetSort(bson.D{{Key: "date", Value: -1}})
	var maxResult struct {
		Date string `bson:"date"`
	}
	if err := collection.FindOne(ctx, bson.M{}, optsMax).Decode(&maxResult); err != nil {
		return "", "", 0, err
	}

	// 获取数量
	count, err = collection.EstimatedDocumentCount(ctx)
	if err != nil {
		return "", "", 0, err
	}

	return minResult.Date, maxResult.Date, count, nil
}

// GetSyncedSymbols 获取已同步K线的股票代码集合（用于断点续传）
// minDate: 最小日期要求，只有K线数据达到该日期的股票才算已同步
func (r *KlineRepository) GetSyncedSymbols(ctx context.Context, market string, minDate string) (map[string]bool, error) {
	collection := r.getCollection(market)
	
	// 使用聚合查询获取每只股票的最小日期
	pipeline := mongo.Pipeline{
		{{Key: "$group", Value: bson.M{
			"_id":     "$symbol",
			"minDate": bson.M{"$min": "$date"},
		}}},
		{{Key: "$match", Value: bson.M{
			"minDate": bson.M{"$lte": minDate},
		}}},
	}
	
	cursor, err := collection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	
	result := make(map[string]bool)
	for cursor.Next(ctx) {
		var doc struct {
			Symbol string `bson:"_id"`
		}
		if err := cursor.Decode(&doc); err == nil {
			result[doc.Symbol] = true
		}
	}
	
	return result, nil
}

// LoadAllKlinesToCache 批量加载全部K线数据到内存缓存
// 直接从数据库读取全部数据，一次性加载到缓存
func (r *KlineRepository) LoadAllKlinesToCache(ctx context.Context, market string, cache *KlineCache) (int, error) {
	collection := r.getCollection(market)
	
	log.Printf("[LoadAllKlinesToCache] 开始加载 %s 市场全部K线数据...", market)
	
	// 按 symbol 和 date 排序读取全部数据
	opts := options.Find().SetSort(bson.D{{Key: "symbol", Value: 1}, {Key: "date", Value: 1}})
	cursor, err := collection.Find(ctx, bson.M{}, opts)
	if err != nil {
		return 0, err
	}
	defer cursor.Close(ctx)
	
	// 按股票分组存入缓存
	var currentSymbol string
	var currentKlines []models.StockKline
	symbolCount := 0
	totalKlines := 0
	
	for cursor.Next(ctx) {
		var kline models.StockKline
		if err := cursor.Decode(&kline); err != nil {
			continue
		}
		
		// 如果是新股票，先保存之前的
		if currentSymbol != "" && kline.Symbol != currentSymbol {
			if len(currentKlines) > 0 {
				cache.Set(currentSymbol, market, currentKlines)
				symbolCount++
				totalKlines += len(currentKlines)
				
				// 每1000只股票输出一次进度
				if symbolCount%1000 == 0 {
					log.Printf("[LoadAllKlinesToCache] %s 市场已加载 %d 只股票, %d 条K线", market, symbolCount, totalKlines)
				}
			}
			currentKlines = nil
		}
		
		currentSymbol = kline.Symbol
		currentKlines = append(currentKlines, kline)
	}
	
	// 保存最后一只股票的数据
	if len(currentKlines) > 0 {
		cache.Set(currentSymbol, market, currentKlines)
		symbolCount++
		totalKlines += len(currentKlines)
	}
	
	log.Printf("[LoadAllKlinesToCache] %s 市场加载完成: %d 只股票, %d 条K线", market, symbolCount, totalKlines)
	return symbolCount, nil
}
