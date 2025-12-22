package db

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// StockRepository 股票数据仓库
type StockRepository struct {
	collection *mongo.Collection
}

// NewStockRepository 创建股票仓库
func NewStockRepository() *StockRepository {
	return &StockRepository{
		collection: GetCollection("stocks"),
	}
}

// UpsertStock 插入或更新股票数据
func (r *StockRepository) UpsertStock(ctx context.Context, stock *StockData) error {
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

// UpsertStocks 批量插入或更新股票数据
func (r *StockRepository) UpsertStocks(ctx context.Context, stocks []StockData) error {
	if len(stocks) == 0 {
		return nil
	}

	var models []mongo.WriteModel
	now := time.Now()

	for _, stock := range stocks {
		stock.UpdatedAt = now
		if stock.CreatedAt.IsZero() {
			stock.CreatedAt = now
		}

		filter := bson.M{"symbol": stock.Symbol}
		update := bson.M{"$set": stock}
		model := mongo.NewUpdateOneModel().SetFilter(filter).SetUpdate(update).SetUpsert(true)
		models = append(models, model)
	}

	opts := options.BulkWrite().SetOrdered(false)
	_, err := r.collection.BulkWrite(ctx, models, opts)
	return err
}

// GetStockBySymbol 根据代码获取股票
func (r *StockRepository) GetStockBySymbol(ctx context.Context, symbol string) (*StockData, error) {
	var stock StockData
	err := r.collection.FindOne(ctx, bson.M{"symbol": symbol}).Decode(&stock)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return &stock, err
}

// GetStocks 获取股票列表
func (r *StockRepository) GetStocks(ctx context.Context, filter bson.M, page, pageSize int) ([]StockData, int64, error) {
	// 计算总数
	total, err := r.collection.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

	// 分页查询
	opts := options.Find().
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize)).
		SetSort(bson.M{"changePct": -1}) // 按涨跌幅排序

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)

	var stocks []StockData
	if err := cursor.All(ctx, &stocks); err != nil {
		return nil, 0, err
	}

	return stocks, total, nil
}

// GetStocksByMarket 根据市场获取股票
func (r *StockRepository) GetStocksByMarket(ctx context.Context, market string, page, pageSize int) ([]StockData, int64, error) {
	filter := bson.M{}
	if market != "" && market != "all" {
		filter["market"] = market
	}
	return r.GetStocks(ctx, filter, page, pageSize)
}

// SearchStocks 搜索股票
func (r *StockRepository) SearchStocks(ctx context.Context, code, name string, page, pageSize int) ([]StockData, int64, error) {
	filter := bson.M{}
	if code != "" {
		filter["symbol"] = bson.M{"$regex": code, "$options": "i"}
	}
	if name != "" {
		filter["name"] = bson.M{"$regex": name, "$options": "i"}
	}
	return r.GetStocks(ctx, filter, page, pageSize)
}

// GetLastUpdateTime 获取最后更新时间
func (r *StockRepository) GetLastUpdateTime(ctx context.Context) (time.Time, error) {
	opts := options.FindOne().SetSort(bson.M{"updatedAt": -1})
	var stock StockData
	err := r.collection.FindOne(ctx, bson.M{}, opts).Decode(&stock)
	if err == mongo.ErrNoDocuments {
		return time.Time{}, nil
	}
	if err != nil {
		return time.Time{}, err
	}
	return stock.UpdatedAt, nil
}

// DeleteOldData 删除过期数据
func (r *StockRepository) DeleteOldData(ctx context.Context, before time.Time) (int64, error) {
	result, err := r.collection.DeleteMany(ctx, bson.M{"updatedAt": bson.M{"$lt": before}})
	if err != nil {
		return 0, err
	}
	return result.DeletedCount, nil
}

// HistoryRepository 历史数据仓库
type HistoryRepository struct {
	collection *mongo.Collection
}

// NewHistoryRepository 创建历史数据仓库
func NewHistoryRepository() *HistoryRepository {
	return &HistoryRepository{
		collection: GetCollection("stock_history"),
	}
}

// UpsertHistory 插入或更新历史数据
func (r *HistoryRepository) UpsertHistory(ctx context.Context, history *StockHistory) error {
	history.UpdatedAt = time.Now()

	filter := bson.M{"symbol": history.Symbol, "date": history.Date}
	update := bson.M{"$set": history}
	opts := options.Update().SetUpsert(true)

	_, err := r.collection.UpdateOne(ctx, filter, update, opts)
	return err
}

// GetHistory 获取历史数据
func (r *HistoryRepository) GetHistory(ctx context.Context, symbol string, limit int) ([]StockHistory, error) {
	opts := options.Find().
		SetSort(bson.M{"date": -1}).
		SetLimit(int64(limit))

	cursor, err := r.collection.Find(ctx, bson.M{"symbol": symbol}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var history []StockHistory
	if err := cursor.All(ctx, &history); err != nil {
		return nil, err
	}

	return history, nil
}
