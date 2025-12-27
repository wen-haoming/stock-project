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
	collection *mongo.Collection
}

// NewStockRepository 创建股票仓库实例
func NewStockRepository() *StockRepository {
	return &StockRepository{
		collection: GetCollection("stocks"),
	}
}

// UpsertStock 插入或更新单只股票
func (r *StockRepository) UpsertStock(ctx context.Context, stock *models.StockData) error {
	stock.UpdatedAt = time.Now()
	if stock.CreatedAt.IsZero() {
		stock.CreatedAt = time.Now()
	}

	filter := bson.M{"symbol": stock.Symbol}
	update := bson.M{"$set": stock}
	opts := options.Update().SetUpsert(true)

	_, err := r.collection.UpdateOne(ctx, filter, update, opts)
	return err
}

// UpsertStocks 批量插入或更新股票
func (r *StockRepository) UpsertStocks(ctx context.Context, stocks []models.StockData) error {
	if len(stocks) == 0 {
		return nil
	}

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
	_, err := r.collection.BulkWrite(ctx, operations, opts)
	return err
}

// GetStockBySymbol 根据代码获取股票
func (r *StockRepository) GetStockBySymbol(ctx context.Context, symbol string) (*models.StockData, error) {
	var stock models.StockData
	err := r.collection.FindOne(ctx, bson.M{"symbol": symbol}).Decode(&stock)
	if err != nil {
		return nil, err
	}
	return &stock, nil
}

// GetStocksBySymbols 批量获取股票
func (r *StockRepository) GetStocksBySymbols(ctx context.Context, symbols []string) ([]models.StockData, error) {
	cursor, err := r.collection.Find(ctx, bson.M{"symbol": bson.M{"$in": symbols}})
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
	opts := options.Find().
		SetSort(bson.D{{Key: "changePct", Value: -1}}).
		SetLimit(int64(limit)).
		SetSkip(int64(offset))

	cursor, err := r.collection.Find(ctx, bson.M{"market": market}, opts)
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

// GetAllStocks 获取所有股票
func (r *StockRepository) GetAllStocks(ctx context.Context) ([]models.StockData, error) {
	cursor, err := r.collection.Find(ctx, bson.M{})
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

// SearchStocks 搜索股票
func (r *StockRepository) SearchStocks(ctx context.Context, keyword string, limit int) ([]models.StockData, error) {
	filter := bson.M{
		"$or": []bson.M{
			{"symbol": bson.M{"$regex": keyword, "$options": "i"}},
			{"name": bson.M{"$regex": keyword, "$options": "i"}},
		},
	}

	opts := options.Find().SetLimit(int64(limit))
	cursor, err := r.collection.Find(ctx, filter, opts)
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

// GetLastUpdateTime 获取最后更新时间
func (r *StockRepository) GetLastUpdateTime(ctx context.Context, market string) (time.Time, error) {
	opts := options.FindOne().SetSort(bson.D{{Key: "updatedAt", Value: -1}})
	filter := bson.M{}
	if market != "" {
		filter["market"] = market
	}

	var stock models.StockData
	err := r.collection.FindOne(ctx, filter, opts).Decode(&stock)
	if err != nil {
		return time.Time{}, err
	}
	return stock.UpdatedAt, nil
}

// CountByMarket 统计市场股票数量
func (r *StockRepository) CountByMarket(ctx context.Context, market string) (int64, error) {
	return r.collection.CountDocuments(ctx, bson.M{"market": market})
}

// DeleteOldData 删除过期数据
func (r *StockRepository) DeleteOldData(ctx context.Context, before time.Time) (int64, error) {
	result, err := r.collection.DeleteMany(ctx, bson.M{"updatedAt": bson.M{"$lt": before}})
	if err != nil {
		return 0, err
	}
	return result.DeletedCount, nil
}
