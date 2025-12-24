package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"server/db"
	"server/scheduler"
	"server/stock"

	"github.com/gin-gonic/gin"
)

func setupRouter() *gin.Engine {
	r := gin.Default()

	// Ping test
	r.GET("/ping", func(c *gin.Context) {
		c.String(http.StatusOK, "pong")
	})

	// 股票API
	r.GET("/api/v1/stock/hist", stock.GetStockHist)
	r.GET("/api/v1/stock/all", stock.GetAllData)
	r.GET("/api/v1/stock/all_kdj", stock.GetAllData2)
	r.GET("/api/v1/stock/detail", stock.GetStockDetail)
	r.GET("/api/v1/stock/range", stock.GetRangeData)
	r.POST("/api/v1/stock/range/refresh", stock.RefreshRangeData) // 主动刷新范围数据

	// 数据库状态API
	r.GET("/api/v1/db/status", func(c *gin.Context) {
		repo := db.NewStockRepository()
		klineRepo := db.NewKlineRepository()

		lastUpdate, err := repo.GetLastUpdateTime(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		klineCount, _ := klineRepo.CountKlines(c.Request.Context())

		c.JSON(http.StatusOK, gin.H{
			"lastUpdate":    lastUpdate,
			"isTradingTime": db.IsTradingTime(),
			"isTradingDay":  db.IsTradingDay(),
			"klineCount":    klineCount,
		})
	})

	// 手动触发同步API
	r.POST("/api/v1/db/sync", func(c *gin.Context) {
		sched := scheduler.NewScheduler()
		sched.ManualSync()
		c.JSON(http.StatusOK, gin.H{"message": "Sync started"})
	})

	// 手动触发历史数据同步API
	r.POST("/api/v1/db/sync-history", func(c *gin.Context) {
		sched := scheduler.NewScheduler()
		sched.ManualSyncHistory()
		c.JSON(http.StatusOK, gin.H{"message": "History sync started"})
	})

	return r
}

func main() {
	// 连接MongoDB
	if err := db.Connect(); err != nil {
		log.Printf("Warning: Failed to connect to MongoDB: %v", err)
		log.Println("Running without database support...")
	} else {
		// 初始化索引
		if err := db.InitIndexes(); err != nil {
			log.Printf("Warning: Failed to init indexes: %v", err)
		}
		// 初始化K线索引
		if err := db.InitKlineIndexes(); err != nil {
			log.Printf("Warning: Failed to init kline indexes: %v", err)
		}

		// 启动定时任务调度器
		sched := scheduler.NewScheduler()
		sched.Start()

		// 优雅关闭
		defer func() {
			sched.Stop()
			if err := db.Disconnect(); err != nil {
				log.Printf("Error disconnecting from MongoDB: %v", err)
			}
		}()
	}

	r := setupRouter()

	// 监听系统信号
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		log.Println("Shutting down...")
		os.Exit(0)
	}()

	// Listen and Server in 0.0.0.0:8080
	r.Run(":8080")
}
