package controllers

import (
	"io"
	"net/http"
	"net/url"
	"server/utils"

	"github.com/gin-gonic/gin"
)

// ProxyController 代理控制器
type ProxyController struct{}

// NewProxyController 创建代理控制器
func NewProxyController() *ProxyController {
	return &ProxyController{}
}

// GetForexNews 获取外汇新闻
// GET /api/v1/news/forex
func (c *ProxyController) GetForexNews(ctx *gin.Context) {
	targetURL := "https://www.jin10.com/flash_newest.js"
	
	body, contentType, err := utils.ProxyRequest(targetURL, map[string]string{
		"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
		"Referer":    "https://www.jin10.com/",
	})
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.Data(http.StatusOK, contentType, body)
}

// GetAnnouncements 获取 A 股公告
// GET /api/v1/stock/announcements
func (c *ProxyController) GetAnnouncements(ctx *gin.Context) {
	symbol := ctx.Query("symbol")
	page := ctx.DefaultQuery("page", "1")
	pageSize := ctx.DefaultQuery("page_size", "10")
	category := ctx.DefaultQuery("category", "0")

	params := url.Values{}
	params.Set("stock", symbol)
	params.Set("page_index", page)
	params.Set("page_size", pageSize)
	params.Set("ann_type", "A")
	params.Set("client_source", "web")
	params.Set("f_node", category)
	params.Set("s_node", "0")

	targetURL := "https://np-anotice-stock.eastmoney.com/api/security/ann?" + params.Encode()

	body, _, err := utils.ProxyRequest(targetURL, map[string]string{
		"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
		"Referer":    "https://data.eastmoney.com/",
	})
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.Data(http.StatusOK, "application/json", body)
}

// GetStockNews 获取股票新闻
// GET /api/v1/stock/news
func (c *ProxyController) GetStockNews(ctx *gin.Context) {
	keyword := ctx.Query("keyword")
	if keyword == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "keyword is required"})
		return
	}

	params := url.Values{}
	params.Set("keyword", keyword)
	params.Set("type", "1")
	params.Set("client", "web")
	params.Set("page_index", "1")
	params.Set("page_size", "20")

	targetURL := "https://search-api-web.eastmoney.com/search/jsonp?" + params.Encode()

	body, _, err := utils.ProxyRequest(targetURL, map[string]string{
		"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
		"Referer":    "https://so.eastmoney.com/",
	})
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.Data(http.StatusOK, "application/json", body)
}

// ProxyPDF 代理 PDF 文件
// GET /api/v1/stock/pdf
func (c *ProxyController) ProxyPDF(ctx *gin.Context) {
	pdfURL := ctx.Query("url")
	if pdfURL == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "url is required"})
		return
	}

	req, err := http.NewRequest("GET", pdfURL, nil)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	req.Header.Set("Referer", "https://data.eastmoney.com/")

	resp, err := utils.HTTPClient.Do(req)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()

	ctx.Header("Content-Type", "application/pdf")
	ctx.Header("Content-Disposition", "inline")
	io.Copy(ctx.Writer, resp.Body)
}
