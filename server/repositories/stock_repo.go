package repositories

import (
	"context"
	"server/models"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// StockRepository 股票数据仓库
type StockRepository struct {
	hkCollection *mongo.Collection
	aCollection  *mongo.Collection
}

// NewStockRepository 创建股票仓库实例
func NewStockRepository() *StockRepository {
	return &StockRepository{
		hkCollection: GetCollection("stocks_hk"), // 港股
		aCollection:  GetCollection("stocks_a"),  // A 股
	}
}

// getCollection 根据市场获取对应的集合
func (r *StockRepository) getCollection(market string) *mongo.Collection {
	if market == "a" {
		return r.aCollection
	}
	return r.hkCollection
}

// UpsertStock 插入或更新单只股票
func (r *StockRepository) UpsertStock(ctx context.Context, stock *models.StockData) error {
	stock.UpdatedAt = time.Now()
	if stock.CreatedAt.IsZero() {
		stock.CreatedAt = time.Now()
	}

	collection := r.getCollection(stock.Market)
	filter := bson.M{"symbol": stock.Symbol}
	update := bson.M{"$set": stock}
	opts := options.Update().SetUpsert(true)

	_, err := collection.UpdateOne(ctx, filter, update, opts)
	return err
}

// UpsertStocks 批量插入或更新股票
func (r *StockRepository) UpsertStocks(ctx context.Context, stocks []models.StockData, market string) error {
	if len(stocks) == 0 {
		return nil
	}

	collection := r.getCollection(market)
	var operations []mongo.WriteModel
	now := time.Now()

	for i := range stocks {
		stocks[i].UpdatedAt = now
		if stocks[i].CreatedAt.IsZero() {
			stocks[i].CreatedAt = now
		}

		filter := bson.M{"symbol": stocks[i].Symbol}
		update := bson.M{"$set": stocks[i]}
		operation := mongo.NewUpdateOneModel().SetFilter(filter).SetUpdate(update).SetUpsert(true)
		operations = append(operations, operation)
	}

	opts := options.BulkWrite().SetOrdered(false)
	_, err := collection.BulkWrite(ctx, operations, opts)
	return err
}

// GetStockBySymbol 根据代码获取股票
func (r *StockRepository) GetStockBySymbol(ctx context.Context, symbol, market string) (*models.StockData, error) {
	collection := r.getCollection(market)
	var stock models.StockData
	err := collection.FindOne(ctx, bson.M{"symbol": symbol}).Decode(&stock)
	if err != nil {
		return nil, err
	}
	return &stock, nil
}

// GetStocksBySymbols 批量获取股票（需要指定市场）
func (r *StockRepository) GetStocksBySymbols(ctx context.Context, symbols []string, market string) ([]models.StockData, error) {
	collection := r.getCollection(market)
	cursor, err := collection.Find(ctx, bson.M{"symbol": bson.M{"$in": symbols}})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var stocks []models.StockData
	if err = cursor.All(ctx, &stocks); err != nil {
		return nil, err
	}
	return stocks, nil
}

// GetStocksByMarket 根据市场获取股票列表
func (r *StockRepository) GetStocksByMarket(ctx context.Context, market string, limit, offset int) ([]models.StockData, error) {
	collection := r.getCollection(market)
	opts := options.Find().
		SetSort(bson.D{{Key: "changePct", Value: -1}}).
		SetLimit(int64(limit)).
		SetSkip(int64(offset))

	cursor, err := collection.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var stocks []models.StockData
	if err = cursor.All(ctx, &stocks); err != nil {
		return nil, err
	}
	return stocks, nil
}

// GetAllStocks 获取所有股票（两个市场合并）
func (r *StockRepository) GetAllStocks(ctx context.Context) ([]models.StockData, error) {
	var allStocks []models.StockData

	// 获取港股
	hkCursor, err := r.hkCollection.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	var hkStocks []models.StockData
	if err = hkCursor.All(ctx, &hkStocks); err != nil {
		hkCursor.Close(ctx)
		return nil, err
	}
	hkCursor.Close(ctx)
	allStocks = append(allStocks, hkStocks...)

	// 获取 A 股
	aCursor, err := r.aCollection.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	var aStocks []models.StockData
	if err = aCursor.All(ctx, &aStocks); err != nil {
		aCursor.Close(ctx)
		return nil, err
	}
	aCursor.Close(ctx)
	allStocks = append(allStocks, aStocks...)

	return allStocks, nil
}

// SearchStocks 搜索股票（两个市场都搜索）
func (r *StockRepository) SearchStocks(ctx context.Context, keyword string, limit int) ([]models.StockData, error) {
	filter := bson.M{
		"$or": []bson.M{
			{"symbol": bson.M{"$regex": keyword, "$options": "i"}},
			{"name": bson.M{"$regex": keyword, "$options": "i"}},
		},
	}

	opts := options.Find().SetLimit(int64(limit / 2)) // 每个市场取一半
	var allStocks []models.StockData

	// 搜索港股
	hkCursor, err := r.hkCollection.Find(ctx, filter, opts)
	if err == nil {
		var hkStocks []models.StockData
		if err = hkCursor.All(ctx, &hkStocks); err == nil {
			allStocks = append(allStocks, hkStocks...)
		}
		hkCursor.Close(ctx)
	}

	// 搜索 A 股
	aCursor, err := r.aCollection.Find(ctx, filter, opts)
	if err == nil {
		var aStocks []models.StockData
		if err = aCursor.All(ctx, &aStocks); err == nil {
			allStocks = append(allStocks, aStocks...)
		}
		aCursor.Close(ctx)
	}

	return allStocks, nil
}

// GetLastUpdateTime 获取最后更新时间
func (r *StockRepository) GetLastUpdateTime(ctx context.Context, market string) (time.Time, error) {
	collection := r.getCollection(market)
	opts := options.FindOne().SetSort(bson.D{{Key: "updatedAt", Value: -1}})

	var stock models.StockData
	err := collection.FindOne(ctx, bson.M{}, opts).Decode(&stock)
	if err != nil {
		return time.Time{}, err
	}
	return stock.UpdatedAt, nil
}

// CountByMarket 统计市场股票数量
func (r *StockRepository) CountByMarket(ctx context.Context, market string) (int64, error) {
	collection := r.getCollection(market)
	return collection.CountDocuments(ctx, bson.M{})
}

// DeleteOldData 删除过期数据
func (r *StockRepository) DeleteOldData(ctx context.Context, market string, before time.Time) (int64, error) {
	collection := r.getCollection(market)
	result, err := collection.DeleteMany(ctx, bson.M{"updatedAt": bson.M{"$lt": before}})
	if err != nil {
		return 0, err
	}
	return result.DeletedCount, nil
}
