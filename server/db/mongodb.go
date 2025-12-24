package db

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var (
	Client   *mongo.Client
	Database *mongo.Database
)

// Config MongoDB配置
type Config struct {
	URI      string
	Database string
}

// GetConfig 获取配置，优先从环境变量读取
func GetConfig() *Config {
	uri := os.Getenv("MONGODB_URI")
	if uri == "" {
		uri = "mongodb://localhost:27017"
	}

	dbName := os.Getenv("MONGODB_DATABASE")
	if dbName == "" {
		dbName = "stock_db"
	}

	return &Config{
		URI:      uri,
		Database: dbName,
	}
}

// Connect 连接MongoDB
func Connect() error {
	config := GetConfig()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	clientOptions := options.Client().ApplyURI(config.URI)
	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		return fmt.Errorf("failed to connect to MongoDB: %w", err)
	}

	// 测试连接
	if err := client.Ping(ctx, nil); err != nil {
		return fmt.Errorf("failed to ping MongoDB: %w", err)
	}

	Client = client
	Database = client.Database(config.Database)

	log.Printf("Connected to MongoDB: %s, Database: %s", config.URI, config.Database)
	return nil
}

// Disconnect 断开连接
func Disconnect() error {
	if Client != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return Client.Disconnect(ctx)
	}
	return nil
}

// GetCollection 获取集合
func GetCollection(name string) *mongo.Collection {
	return Database.Collection(name)
}

// IsConnected 检查数据库是否正确连接
func IsConnected() bool {
	if Client == nil || Database == nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := Client.Ping(ctx, nil); err != nil {
		log.Printf("Database ping failed: %v", err)
		return false
	}
	return true
}

// InitIndexes 初始化索引
func InitIndexes() error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 股票实时数据索引
	stockCollection := GetCollection("stocks")
	stockIndexes := []mongo.IndexModel{
		{
			Keys:    map[string]interface{}{"symbol": 1},
			Options: options.Index().SetUnique(true),
		},
		{
			Keys: map[string]interface{}{"updatedAt": -1},
		},
	}
	if _, err := stockCollection.Indexes().CreateMany(ctx, stockIndexes); err != nil {
		return fmt.Errorf("failed to create stock indexes: %w", err)
	}

	// 股票历史数据索引
	histCollection := GetCollection("stock_history")
	histIndexes := []mongo.IndexModel{
		{
			Keys:    map[string]interface{}{"symbol": 1, "date": 1},
			Options: options.Index().SetUnique(true),
		},
		{
			Keys: map[string]interface{}{"date": -1},
		},
	}
	if _, err := histCollection.Indexes().CreateMany(ctx, histIndexes); err != nil {
		return fmt.Errorf("failed to create history indexes: %w", err)
	}

	log.Println("MongoDB indexes initialized")
	return nil
}
