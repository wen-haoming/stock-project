package config

import (
	"os"
	"strconv"
	"time"
)

// Config 应用配置
type Config struct {
	Server   ServerConfig
	MongoDB  MongoDBConfig
	Cache    CacheConfig
	Trading  TradingConfig
	LongPort LongPortConfig
}

// ServerConfig 服务器配置
type ServerConfig struct {
	Port string
	Mode string // debug, release, test
}

// MongoDBConfig MongoDB 配置
type MongoDBConfig struct {
	URI      string
	Database string
}

// CacheConfig 缓存配置
type CacheConfig struct {
	TradingTTL    time.Duration // 交易时间缓存时长
	NonTradingTTL time.Duration // 非交易时间缓存时长
	MemoryMaxSize int           // 内存缓存最大条目数
	MemoryTTL     time.Duration // 内存缓存默认 TTL
}

// TradingConfig 交易时间配置
type TradingConfig struct {
	// A股交易时间
	AStockMorningStart   string // 09:30
	AStockMorningEnd     string // 11:30
	AStockAfternoonStart string // 13:00
	AStockAfternoonEnd   string // 15:00

	// 港股交易时间
	HKMorningStart   string // 09:30
	HKMorningEnd     string // 12:00
	HKAfternoonStart string // 13:00
	HKAfternoonEnd   string // 16:00
}

// LongPortConfig LongPort OpenAPI 配置
type LongPortConfig struct {
	AppKey      string
	AppSecret   string
	AccessToken string
	Region      string // cn, sg, hk
	Enabled     bool   // 是否启用 LongPort API
}

var cfg *Config

// Load 加载配置
func Load() *Config {
	if cfg != nil {
		return cfg
	}

	cfg = &Config{
		Server: ServerConfig{
			Port: getEnv("SERVER_PORT", "8080"),
			Mode: getEnv("GIN_MODE", "debug"),
		},
		MongoDB: MongoDBConfig{
			URI:      getEnv("MONGODB_URI", "mongodb://localhost:27017"),
			Database: getEnv("MONGODB_DATABASE", "stock_db"),
		},
		Cache: CacheConfig{
			TradingTTL:    getDurationEnv("CACHE_TRADING_TTL", 5*time.Minute),
			NonTradingTTL: getDurationEnv("CACHE_NON_TRADING_TTL", 1*time.Hour),
			MemoryMaxSize: getIntEnv("CACHE_MEMORY_MAX_SIZE", 100),
			MemoryTTL:     getDurationEnv("CACHE_MEMORY_TTL", 30*time.Minute),
		},
		Trading: TradingConfig{
			AStockMorningStart:   "09:30",
			AStockMorningEnd:     "11:30",
			AStockAfternoonStart: "13:00",
			AStockAfternoonEnd:   "15:00",
			HKMorningStart:       "09:30",
			HKMorningEnd:         "12:00",
			HKAfternoonStart:     "13:00",
			HKAfternoonEnd:       "16:00",
		},
		LongPort: LongPortConfig{
			AppKey:      getEnv("LONGPORT_APP_KEY", ""),
			AppSecret:   getEnv("LONGPORT_APP_SECRET", ""),
			AccessToken: getEnv("LONGPORT_ACCESS_TOKEN", ""),
			Region:      getEnv("LONGPORT_REGION", "cn"),
			Enabled:     getEnv("LONGPORT_APP_KEY", "") != "",
		},
	}

	return cfg
}

// Get 获取配置（单例）
func Get() *Config {
	if cfg == nil {
		return Load()
	}
	return cfg
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getIntEnv(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return defaultValue
}

func getDurationEnv(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if d, err := time.ParseDuration(value); err == nil {
			return d
		}
	}
	return defaultValue
}
