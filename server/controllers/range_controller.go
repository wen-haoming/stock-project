package controllers

import (
	"net/http"
	"server/services"

	"github.com/gin-gonic/gin"
)

// RangeController 区间涨幅控制器
type RangeController struct {
	rangeService *services.RangeService
}

// NewRangeController 创建区间控制器
func NewRangeController() *RangeController {
	return &RangeController{
		rangeService: services.NewRangeService(),
	}
}

// GetRangeData 获取区间涨幅数据
// GET /api/v1/stock/range
func (c *RangeController) GetRangeData(ctx *gin.Context) {
	params := map[string]string{
		"start_date":     ctx.Query("start_date"),
		"end_date":       ctx.Query("end_date"),
		"min_change_pct": ctx.Query("min_change_pct"),
		"min_market_cap": ctx.Query("min_market_cap"),
		"max_market_cap": ctx.Query("max_market_cap"),
		"industry":       ctx.Query("industry"),
		"market":         ctx.Query("market"),
		"refresh":        ctx.Query("refresh"),
	}

	query := services.ParseRangeQuery(params)

	if query.StartDate == "" || query.EndDate == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "start_date and end_date are required"})
		return
	}

	data, err := c.rangeService.GetRangeData(ctx.Request.Context(), query)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code":  0,
		"data":  data,
		"total": len(data),
	})
}

// RefreshRangeData 强制刷新区间数据
// POST /api/v1/stock/range/refresh
func (c *RangeController) RefreshRangeData(ctx *gin.Context) {
	params := map[string]string{
		"start_date": ctx.Query("start_date"),
		"end_date":   ctx.Query("end_date"),
		"market":     ctx.Query("market"),
	}

	query := services.ParseRangeQuery(params)

	if query.StartDate == "" || query.EndDate == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "start_date and end_date are required"})
		return
	}

	// 直接查询（已禁用缓存）
	data, err := c.rangeService.GetRangeData(ctx.Request.Context(), query)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code":    0,
		"data":    data,
		"total":   len(data),
		"message": "数据已刷新",
	})
}
