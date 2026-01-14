package controllers

import (
	"net/http"
	"server/services"
	"strconv"

	"github.com/gin-gonic/gin"
)

// MarketController 大盘行情控制器
type MarketController struct {
	marketService *services.MarketService
}

// NewMarketController 创建大盘行情控制器
func NewMarketController() *MarketController {
	return &MarketController{
		marketService: services.NewMarketService(),
	}
}

// GetIndexList 获取指数行情列表
// GET /api/v1/market/index
func (c *MarketController) GetIndexList(ctx *gin.Context) {
	market := ctx.DefaultQuery("market", "a")

	indices, err := c.marketService.GetIndexList(market)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": indices,
	})
}

// GetDistribution 获取涨跌分布
// GET /api/v1/market/distribution
func (c *MarketController) GetDistribution(ctx *gin.Context) {
	market := ctx.DefaultQuery("market", "a")

	dist, err := c.marketService.GetDistribution(market)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": dist,
	})
}

// GetHotSectors 获取热门板块
// GET /api/v1/market/sectors
func (c *MarketController) GetHotSectors(ctx *gin.Context) {
	market := ctx.DefaultQuery("market", "a")
	limit := 10
	if l := ctx.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	sectors, err := c.marketService.GetHotSectors(market, limit)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": sectors,
	})
}

// GetTopGainers 获取涨幅榜
// GET /api/v1/market/top-gainers
func (c *MarketController) GetTopGainers(ctx *gin.Context) {
	market := ctx.DefaultQuery("market", "a")
	limit := 20
	if l := ctx.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	gainers, err := c.marketService.GetTopGainers(market, limit)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gainers,
	})
}

// GetHeatmap 获取热力图数据
// GET /api/v1/market/heatmap
func (c *MarketController) GetHeatmap(ctx *gin.Context) {
	market := ctx.DefaultQuery("market", "a")
	limit := 100
	if l := ctx.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	data, err := c.marketService.GetHeatmapData(market, limit)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": data,
	})
}
