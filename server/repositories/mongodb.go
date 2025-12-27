package repositories

import (
	"context"
	"log"
	"server/config"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var (
	client   *mongo.Client
	database *mongo.Database
	once     sync.Once
)

// Connect 连接 MongoDB
func Connect() error {
	var connErr error
	once.Do(func() {
		cfg := config.Get()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		clientOptions := options.Client().ApplyURI(cfg.MongoDB.URI)
		var err error
		client, err = mongo.Connect(ctx, clientOptions)
		if err != nil {
			connErr = err
			return
		}

		// Ping 测试连接
		if err = client.Ping(ctx, nil); err != nil {
			connErr = err
			return
		}

		database = client.Database(cfg.MongoDB.Database)
		log.Printf("MongoDB connected: %s/%s", cfg.MongoDB.URI, cfg.MongoDB.Database)
	})
	return connErr
}

// Disconnect 断开连接
func Disconnect() {
	if client != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		client.Disconnect(ctx)
	}
}

// GetCollection 获取集合
func GetCollection(name string) *mongo.Collection {
	if database == nil {
		return nil
	}
	return database.Collection(name)
}

// IsConnected 检查是否已连接
func IsConnected() bool {
	if client == nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return client.Ping(ctx, nil) == nil
}

// InitIndexes 初始化股票数据索引
func InitIndexes() error {
	ctx := context.Background()

	indexes := []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "symbol", Value: 1}},
			Options: options.Index().SetUnique(true),
		},
		{
			Keys: bson.D{{Key: "updatedAt", Value: -1}},
		},
		{
			Keys: bson.D{{Key: "changePct", Value: -1}},
		},
	}

	// 港股表
	hkCollection := GetCollection("stocks_hk")
	if hkCollection != nil {
		if _, err := hkCollection.Indexes().CreateMany(ctx, indexes); err != nil {
			return err
		}
	}

	// A 股表
	aCollection := GetCollection("stocks_a")
	if aCollection != nil {
		if _, err := aCollection.Indexes().CreateMany(ctx, indexes); err != nil {
			return err
		}
	}

	return nil
}

// InitKlineIndexes 初始化K线数据索引
func InitKlineIndexes() error {
	ctx := context.Background()
	
	indexes := []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "symbol", Value: 1}, {Key: "date", Value: 1}},
			Options: options.Index().SetUnique(true),
		},
		{
			Keys: bson.D{{Key: "date", Value: 1}},
		},
		{
			Keys: bson.D{{Key: "symbol", Value: 1}},
		},
	}

	// 港股 K 线表
	hkCollection := GetCollection("klines_hk")
	if hkCollection != nil {
		if _, err := hkCollection.Indexes().CreateMany(ctx, indexes); err != nil {
			return err
		}
	}

	// A 股 K 线表
	aCollection := GetCollection("klines_a")
	if aCollection != nil {
		if _, err := aCollection.Indexes().CreateMany(ctx, indexes); err != nil {
			return err
		}
	}

	return nil
}

// InitRangeCacheIndexes 初始化区间缓存索引
func InitRangeCacheIndexes() error {
	ctx := context.Background()
	collection := GetCollection("range_cache")
	if collection == nil {
		return nil
	}

	indexes := []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "startDate", Value: 1}, {Key: "endDate", Value: 1}, {Key: "market", Value: 1}},
			Options: options.Index().SetUnique(true),
		},
		{
			Keys: bson.D{{Key: "updatedAt", Value: 1}},
		},
	}

	_, err := collection.Indexes().CreateMany(ctx, indexes)
	return err
}
