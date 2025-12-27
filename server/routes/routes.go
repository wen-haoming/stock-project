package routes

import (
	"server/controllers"
	"server/middleware"

	"github.com/gin-gonic/gin"
)

// SetupRouter 设置路由
func SetupRouter() *gin.Engine {
	r := gin.New()

	// 中间件
	r.Use(gin.Logger())
	r.Use(middleware.Recovery())
	r.Use(middleware.CORS())

	// 健康检查
	r.GET("/ping", func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "pong"})
	})

	// API v1
	v1 := r.Group("/api/v1")
	{
		// 股票相关
		stockCtrl := controllers.NewStockController()
		v1.GET("/stock/all", stockCtrl.GetAllData)
		v1.GET("/stock/hist", stockCtrl.GetStockHist)
		v1.GET("/stock/detail", stockCtrl.GetStockDetail)

		// 区间涨幅
		rangeCtrl := controllers.NewRangeController()
		v1.GET("/stock/range", rangeCtrl.GetRangeData)
		v1.POST("/stock/range/refresh", rangeCtrl.RefreshRangeData)

		// KDJ 筛选
		kdjCtrl := controllers.NewKDJController()
		v1.GET("/stock/all_kdj", kdjCtrl.GetAllKDJ)

		// 代理接口
		proxyCtrl := controllers.NewProxyController()
		v1.GET("/news/forex", proxyCtrl.GetForexNews)
		v1.GET("/stock/announcements", proxyCtrl.GetAnnouncements)
		v1.GET("/stock/news", proxyCtrl.GetStockNews)
		v1.GET("/stock/pdf", proxyCtrl.ProxyPDF)

		// 数据库管理
		dbCtrl := controllers.NewDBController()
		v1.GET("/db/status", dbCtrl.GetStatus)
		v1.GET("/db/sync-progress", dbCtrl.GetSyncProgress)
		v1.GET("/db/kline-debug", dbCtrl.GetKlineDebug)
		v1.POST("/db/sync", dbCtrl.ManualSync)
		v1.POST("/db/sync-history", dbCtrl.ManualSyncHistory)
	}

	return r
}
