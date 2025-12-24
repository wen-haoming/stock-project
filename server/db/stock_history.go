package db

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// StockKline 股票K线数据
type StockKline struct {
	Symbol       string    `bson:"symbol" json:"symbol"`
	Date         string    `bson:"date" json:"date"` // YYYY-MM-DD
	Open         float64   `bson:"open" json:"open"`
	Close        float64   `bson:"close" json:"close"`
	High         float64   `bson:"high" json:"high"`
	Low          float64   `bson:"low" json:"low"`
	Volume       int64     `bson:"volume" json:"volume"`
	Turnover     float64   `bson:"turnover" json:"turnover"`
	Amplitude    float64   `bson:"amplitude" json:"amplitude"`
	ChangePct    float64   `bson:"changePct" json:"changePct"`
	ChangeAmt    float64   `bson:"changeAmt" json:"changeAmt"`
	TurnoverRate float64   `bson:"turnoverRate" json:"turnoverRate"`
	UpdatedAt    time.Time `bson:"updatedAt" json:"updatedAt"`
}

// KlineRepository K线数据仓库
type KlineRepository struct {
	collection *mongo.Collection
}

// NewKlineRepository 创建K线仓库
func NewKlineRepository() *KlineRepository {
	return &KlineRepository{
		collection: GetCollection("stock_klines"),
	}
}

// UpsertKlines 批量插入或更新K线数据
func (r *KlineRepository) UpsertKlines(ctx context.Context, klines []StockKline) error {
	if len(klines) == 0 {
		return nil
	}

	var models []mongo.WriteModel
	now := time.Now()

	for _, kline := range klines {
		kline.UpdatedAt = now
		filter := bson.M{"symbol": kline.Symbol, "date": kline.Date}
		update := bson.M{"$set": kline}
		model := mongo.NewUpdateOneModel().SetFilter(filter).SetUpdate(update).SetUpsert(true)
		models = append(models, model)
	}

	opts := options.BulkWrite().SetOrdered(false)
	_, err := r.collection.BulkWrite(ctx, models, opts)
	return err
}

// GetKlinesBySymbol 获取某只股票的K线数据
func (r *KlineRepository) GetKlinesBySymbol(ctx context.Context, symbol, startDate, endDate string) ([]StockKline, error) {
	filter := bson.M{"symbol": symbol}
	if startDate != "" {
		filter["date"] = bson.M{"$gte": startDate}
	}
	if endDate != "" {
		if filter["date"] == nil {
			filter["date"] = bson.M{}
		}
		filter["date"].(bson.M)["$lte"] = endDate
	}

	opts := options.Find().SetSort(bson.M{"date": 1})
	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var klines []StockKline
	if err := cursor.All(ctx, &klines); err != nil {
		return nil, err
	}

	return klines, nil
}

// GetLatestKlineDate 获取某只股票最新的K线日期
func (r *KlineRepository) GetLatestKlineDate(ctx context.Context, symbol string) (string, error) {
	opts := options.FindOne().SetSort(bson.M{"date": -1})
	var kline StockKline
	err := r.collection.FindOne(ctx, bson.M{"symbol": symbol}, opts).Decode(&kline)
	if err == mongo.ErrNoDocuments {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return kline.Date, nil
}

// GetAllSymbols 获取所有有K线数据的股票代码
func (r *KlineRepository) GetAllSymbols(ctx context.Context) ([]string, error) {
	symbols, err := r.collection.Distinct(ctx, "symbol", bson.M{})
	if err != nil {
		return nil, err
	}

	var result []string
	for _, s := range symbols {
		if str, ok := s.(string); ok {
			result = append(result, str)
		}
	}
	return result, nil
}

// CountKlines 统计K线数量
func (r *KlineRepository) CountKlines(ctx context.Context) (int64, error) {
	return r.collection.CountDocuments(ctx, bson.M{})
}

// RangeResult 区间涨幅聚合结果
type RangeResult struct {
	Symbol     string  `bson:"_id"`
	StartPrice float64 `bson:"startPrice"`
	EndPrice   float64 `bson:"endPrice"`
	StartDate  string  `bson:"startDate"`
	EndDate    string  `bson:"endDate"`
}

// CalculateRangeByAggregation 使用聚合管道批量计算区间涨幅
func (r *KlineRepository) CalculateRangeByAggregation(ctx context.Context, startDate, endDate string) ([]RangeResult, error) {
	pipeline := mongo.Pipeline{
		// 1. 筛选日期范围
		{{Key: "$match", Value: bson.M{
			"date": bson.M{"$gte": startDate, "$lte": endDate},
		}}},
		// 2. 按日期排序
		{{Key: "$sort", Value: bson.M{"date": 1}}},
		// 3. 按股票分组，获取首尾价格
		{{Key: "$group", Value: bson.M{
			"_id":        "$symbol",
			"startPrice": bson.M{"$first": "$close"},
			"endPrice":   bson.M{"$last": "$close"},
			"startDate":  bson.M{"$first": "$date"},
			"endDate":    bson.M{"$last": "$date"},
		}}},
		// 4. 过滤掉起始价格为0的数据
		{{Key: "$match", Value: bson.M{
			"startPrice": bson.M{"$gt": 0},
		}}},
	}

	cursor, err := r.collection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var results []RangeResult
	if err := cursor.All(ctx, &results); err != nil {
		return nil, err
	}

	return results, nil
}

// InitKlineIndexes 初始化K线索引
func InitKlineIndexes() error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	collection := GetCollection("stock_klines")
	indexes := []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "symbol", Value: 1}, {Key: "date", Value: 1}},
			Options: options.Index().SetUnique(true),
		},
		{
			Keys: bson.D{{Key: "symbol", Value: 1}},
		},
		{
			Keys: bson.D{{Key: "date", Value: -1}},
		},
	}

	_, err := collection.Indexes().CreateMany(ctx, indexes)
	return err
}
