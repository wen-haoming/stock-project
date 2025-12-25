package main

import (
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

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

	// 新闻代理接口（解决跨域）
	r.GET("/api/v1/news/forex", func(c *gin.Context) {
		page := c.DefaultQuery("page", "1")
		num := c.DefaultQuery("num", "15")

		client := &http.Client{Timeout: 10 * time.Second}
		forexURL := "https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2516&num=" + num + "&page=" + page
		req, err := http.NewRequest("GET", forexURL, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
		req.Header.Set("Referer", "https://finance.sina.com.cn/")

		resp, err := client.Do(req)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.Data(http.StatusOK, "application/json; charset=utf-8", body)
	})

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

	// A股公告代理接口（解决跨域）
	r.GET("/api/v1/stock/announcements", func(c *gin.Context) {
		symbol := c.Query("symbol")
		page := c.DefaultQuery("page", "1")
		pageSize := c.DefaultQuery("page_size", "20")
		category := c.DefaultQuery("category", "0") // 0=全部, 1=业绩报告, 2=融资公告, 3=风险提示, 4=资产重组, 5=信息变更

		if symbol == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "symbol is required"})
			return
		}

		client := &http.Client{Timeout: 10 * time.Second}
		annURL := "https://np-anotice-stock.eastmoney.com/api/security/ann?cb=jQuery&sr=-1&page_size=" + pageSize + "&page_index=" + page + "&ann_type=A&stock_list=" + symbol + "&f_node=" + category + "&s_node=0"
		req, err := http.NewRequest("GET", annURL, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

		resp, err := client.Do(req)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// 去掉 jQuery() 包装
		bodyStr := string(body)
		if len(bodyStr) > 8 && bodyStr[:7] == "jQuery(" {
			bodyStr = bodyStr[7 : len(bodyStr)-1]
		}

		c.Data(http.StatusOK, "application/json; charset=utf-8", []byte(bodyStr))
	})

	// 股票新闻搜索代理接口（解决跨域）
	r.GET("/api/v1/stock/news", func(c *gin.Context) {
		keyword := c.Query("keyword")
		if keyword == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "keyword is required"})
			return
		}

		client := &http.Client{Timeout: 10 * time.Second}
		// 构建东方财富搜索API URL，需要对 param 进行 URL 编码
		paramJSON := `{"uid":"","keyword":"` + keyword + `","type":["cmsArticleWebOld"],"client":"web","clientType":"web","clientVersion":"curr","param":{"cmsArticleWebOld":{"searchScope":"default","sort":"default","pageIndex":1,"pageSize":10,"preTag":"<em>","postTag":"</em>"}}}`
		apiURL := "https://search-api-web.eastmoney.com/search/jsonp?cb=jQuery&param=" + url.QueryEscape(paramJSON)

		req, err := http.NewRequest("GET", apiURL, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
		req.Header.Set("Referer", "https://so.eastmoney.com/")

		resp, err := client.Do(req)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// 去掉 jQuery() 包装
		bodyStr := string(body)
		if len(bodyStr) > 8 && bodyStr[:7] == "jQuery(" {
			bodyStr = bodyStr[7 : len(bodyStr)-1]
		}

		c.Data(http.StatusOK, "application/json; charset=utf-8", []byte(bodyStr))
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
