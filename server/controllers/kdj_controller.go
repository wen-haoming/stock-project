package controllers

import (
	"net/http"
	"server/services"

	"github.com/gin-gonic/gin"
)

// KDJController KDJ 筛选控制器
type KDJController struct {
	kdjService *services.KDJService
}

// NewKDJController 创建 KDJ 控制器
func NewKDJController() *KDJController {
	return &KDJController{
		kdjService: services.NewKDJService(),
	}
}

// GetAllKDJ 获取 A 股 KDJ 数据
// GET /api/v1/stock/all_kdj
func (c *KDJController) GetAllKDJ(ctx *gin.Context) {
	// 默认只返回 J < 0 的股票
	filterJ := ctx.DefaultQuery("filter_j", "true") == "true"

	data, err := c.kdjService.GetAStocksWithKDJ(ctx.Request.Context(), filterJ)
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
