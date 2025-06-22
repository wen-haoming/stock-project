package stock

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// StockData 存储股票数据
type StockData struct {
	Symbol string    `json:"代码"`
	Name   string    `json:"名称"`
	Close  float64   `json:"收盘价"`
	High   float64   `json:"最高价"`
	Low    float64   `json:"最低价"`
	Volume float64   `json:"成交量"`
	Date   time.Time `json:"日期"`
	KDJ    KDJData   `json:"kdj"`
}

// KDJData 存储 KDJ 指标数据
type KDJData struct {
	K float64 `json:"k"`
	D float64 `json:"d"`
	J float64 `json:"j"`
}

// 计算 KDJ 指标
func calculateKDJ(data []StockData, n int) []StockData {
	if len(data) == 0 {
		return data
	}

	// 初始化 K、D 值为 50
	k := 50.0
	d := 50.0

	for i := range data {
		// 计算 RSV
		var lowN, highN float64
		startIdx := i - n + 1
		if startIdx < 0 {
			startIdx = 0
		}

		// 获取周期内的最低价和最高价
		lowN = data[startIdx].Low
		highN = data[startIdx].High

		// 在 n 日内寻找最低价和最高价
		for j := startIdx; j <= i; j++ {
			if data[j].Low < lowN {
				lowN = data[j].Low
			}
			if data[j].High > highN {
				highN = data[j].High
			}
		}

		// 计算 RSV，按照 Python 代码的逻辑：RSV = (C - LLV(L,N)) / (HHV(H,N) - LLV(L,N)) * 100
		rsv := 0.0
		if highN-lowN > 1e-9 { // 避免除以零，使用一个很小的数
			rsv = (data[i].Close - lowN) / (highN - lowN) * 100.0
		}

		// 计算 K、D、J 值
		// Python 代码中：
		// K = 2/3 * K[-1] + 1/3 * RSV
		// D = 2/3 * D[-1] + 1/3 * K
		// J = 3 * K - 2 * D
		if i == 0 {
			k = 50.0
			d = 50.0
		} else {
			k = 2.0/3.0*k + 1.0/3.0*rsv
			d = 2.0/3.0*d + 1.0/3.0*k
		}
		j := 3.0*k - 2.0*d

		data[i].KDJ = KDJData{
			K: k,
			D: d,
			J: j,
		}
	}

	return data
}

// StockResponse 定义 API 响应结构
type StockResponse struct {
	Data     []StockData `json:"data"`
	Total    int         `json:"total"`
	Page     int         `json:"page"`
	PageSize int         `json:"pageSize"`
}

// RawStockData 定义从东方财富获取的原始数据结构
type RawStockData struct {
	Symbol string      `json:"f12"`
	Name   string      `json:"f14"`
	Close  interface{} `json:"f2"`
	High   interface{} `json:"f15"`
	Low    interface{} `json:"f16"`
	Volume interface{} `json:"f5"`
}

type EastmoneyResponse struct {
	Data struct {
		Total int            `json:"total"`
		Diff  []RawStockData `json:"diff"`
	} `json:"data"`
}

// 转换接口类型到 float64
func toFloat64(v interface{}) float64 {
	switch v := v.(type) {
	case float64:
		return v
	case float32:
		return float64(v)
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case string:
		f, err := strconv.ParseFloat(v, 64)
		if err == nil {
			return f
		}
	}
	return 0
}

func fetchStockData(market string, pn int, pz int) ([]StockData, int, error) {
	marketMap := map[string]string{
		"sh":  "m:1+t:2",                         // 上证A股
		"sz":  "m:0+t:6",                         // 深证A股
		"cyb": "m:0+t:81+s:2048",                 // 创业板
		"all": "m:0+t:6,m:0+t:81+s:2048,m:1+t:2", // 上证A股+深证A股+创业板
	}
	fs, ok := marketMap[market]
	if !ok {
		fs = marketMap["all"] // default to all
	}

	url := "https://82.push2.eastmoney.com/api/qt/clist/get"
	req, _ := http.NewRequest("GET", url, nil)
	q := req.URL.Query()
	q.Add("pn", fmt.Sprintf("%d", pn))
	q.Add("pz", fmt.Sprintf("%d", pz))
	q.Add("po", "1")
	q.Add("np", "1")
	q.Add("ut", "bd1d9ddb04089700cf9c27f6f7426281")
	q.Add("fltt", "2")
	q.Add("invt", "2")
	q.Add("fid", "f12")
	q.Add("fs", fs)
	q.Add("fields", "f2,f12,f14,f15,f16,f5")
	req.URL.RawQuery = q.Encode()

	client := &http.Client{Timeout: time.Second * 10}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to read response body: %w", err)
	}

	var response EastmoneyResponse
	fmt.Println(string(body))
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, 0, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	if response.Data.Diff == nil {
		return nil, 0, nil
	}

	// 转换数据
	var stockData []StockData
	for _, raw := range response.Data.Diff {
		stock := StockData{
			Symbol: raw.Symbol,
			Name:   raw.Name,
			Close:  toFloat64(raw.Close),
			High:   toFloat64(raw.High),
			Low:    toFloat64(raw.Low),
			Volume: toFloat64(raw.Volume),
			Date:   time.Now(),
		}
		stockData = append(stockData, stock)
	}

	// 计算 KDJ
	stockData = calculateKDJ(stockData, 9) // 使用默认的 9 日 KDJ

	// 筛选 J 值小于 0 的股票
	filteredData := make([]StockData, 0)
	for _, stock := range stockData {
		if stock.KDJ.J < 0 {
			filteredData = append(filteredData, stock)
		}
	}

	return filteredData, response.Data.Total, nil
}

// GetAllData 处理获取所有股票数据的请求
func GetAllData2(c *gin.Context) {
	market := c.DefaultQuery("market", "all")
	page := c.DefaultQuery("page", "1")
	pageSize := c.DefaultQuery("pageSize", "500")

	pageNum, err := strconv.Atoi(page)
	if err != nil || pageNum < 1 {
		pageNum = 1
	}
	pageSizeNum, err := strconv.Atoi(pageSize)
	if err != nil || pageSizeNum < 1 || pageSizeNum > 500 {
		pageSizeNum = 500
	}

	data, total, err := fetchStockData(market, pageNum, pageSizeNum)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, StockResponse{
		Data:     data,
		Total:    total,
		Page:     pageNum,
		PageSize: pageSizeNum,
	})
}
