package controllers

import (
	"bytes"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"server/utils"
	"time"

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
	params.Set("stock_list", symbol)
	params.Set("page_index", page)
	params.Set("page_size", pageSize)
	params.Set("ann_type", "A")
	params.Set("client_source", "web")
	params.Set("f_node", category)
	params.Set("s_node", "0")
	params.Set("sr", "-1")

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
// 东方财富 PDF 服务器有反爬虫机制，需要使用 cookie jar 处理
func (c *ProxyController) ProxyPDF(ctx *gin.Context) {
	pdfURL := ctx.Query("url")
	if pdfURL == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "url is required"})
		return
	}

	// 创建带 cookie jar 的 HTTP 客户端
	jar, _ := cookiejar.New(nil)
	client := &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			DialContext: (&net.Dialer{
				Timeout:   10 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			MaxIdleConns:        10,
			IdleConnTimeout:     90 * time.Second,
			TLSHandshakeTimeout: 10 * time.Second,
		},
		Jar: jar,
		// 跟随重定向
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return nil
		},
	}

	headers := map[string]string{
		"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		"Referer":    "https://data.eastmoney.com/",
		"Accept":     "application/pdf,*/*",
	}

	// 解析 URL 以设置预置 cookie
	parsedURL, err := url.Parse(pdfURL)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 预置一些常见的 cookie 来绕过反爬虫
	// 这些 cookie 值是从反爬虫脚本中提取的常见模式
	cookies := []*http.Cookie{
		{Name: "__tst_status", Value: "598721740", Path: "/"},
		{Name: "EO_Bot_Ssid", Value: "598721740", Path: "/"},
	}
	jar.SetCookies(parsedURL, cookies)

	// 第一次请求
	req1, err := http.NewRequest("GET", pdfURL, nil)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for k, v := range headers {
		req1.Header.Set(k, v)
	}

	resp1, err := client.Do(req1)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	body1, _ := io.ReadAll(resp1.Body)
	resp1.Body.Close()

	// 检查是否是 PDF（以 %PDF 开头）
	if len(body1) > 4 && bytes.HasPrefix(body1, []byte("%PDF")) {
		ctx.Header("Content-Type", "application/pdf")
		ctx.Header("Content-Disposition", "inline")
		ctx.Data(http.StatusOK, "application/pdf", body1)
		return
	}

	// 如果不是 PDF，尝试从响应中提取 cookie 并再次请求
	// 解析反爬虫脚本中的 cookie 值
	bodyStr := string(body1)
	if len(bodyStr) > 0 {
		// 尝试提取 __tst_status 值（通常在脚本中计算出来）
		// 简单方法：设置一个随机的大数值
		randomCookie := []*http.Cookie{
			{Name: "__tst_status", Value: "598721740#", Path: "/"},
			{Name: "EO_Bot_Ssid", Value: "598721740", Path: "/"},
		}
		jar.SetCookies(parsedURL, randomCookie)
	}

	// 第二次请求
	req2, err := http.NewRequest("GET", pdfURL, nil)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for k, v := range headers {
		req2.Header.Set(k, v)
	}

	resp2, err := client.Do(req2)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer resp2.Body.Close()

	body2, _ := io.ReadAll(resp2.Body)

	// 再次检查是否是 PDF
	if len(body2) > 4 && bytes.HasPrefix(body2, []byte("%PDF")) {
		ctx.Header("Content-Type", "application/pdf")
		ctx.Header("Content-Disposition", "inline")
		ctx.Data(http.StatusOK, "application/pdf", body2)
		return
	}

	// 如果仍然不是 PDF，返回错误
	ctx.JSON(http.StatusInternalServerError, gin.H{"error": "无法获取 PDF 文件，可能被反爬虫机制阻止"})
}
