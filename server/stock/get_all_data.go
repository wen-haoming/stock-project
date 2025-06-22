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

// StockSpotDataRaw is for unmarshalling the raw response from the API.
type StockSpotDataRaw struct {
	Symbol           string      `json:"f12"`
	Name             string      `json:"f14"`
	LatestPrice      interface{} `json:"f2"`
	ChangePct        interface{} `json:"f3"`
	ChangeAmt        interface{} `json:"f4"`
	Volume           interface{} `json:"f5"`
	Turnover         interface{} `json:"f6"`
	Amplitude        interface{} `json:"f7"`
	High             interface{} `json:"f15"`
	Low              interface{} `json:"f16"`
	Open             interface{} `json:"f17"`
	Close            interface{} `json:"f18"`
	VolumeRatio      interface{} `json:"f10"`
	TurnoverRate     interface{} `json:"f8"`
	PEDynamic        interface{} `json:"f9"`
	PB               interface{} `json:"f23"`
	TotalMarketCap   interface{} `json:"f20"`
	CircMarketCap    interface{} `json:"f21"`
	PriceChangeSpeed interface{} `json:"f22"`
	Change5min       interface{} `json:"f11"`
	Change60day      interface{} `json:"f24"`
	ChangeYTD        interface{} `json:"f25"`
}

// StockSpotData is the processed stock data with proper types.
type StockSpotData struct {
	Symbol           string  `json:"代码"`
	Name             string  `json:"名称"`
	LatestPrice      float64 `json:"最新价"`
	ChangePct        float64 `json:"涨跌幅"`
	ChangeAmt        float64 `json:"涨跌额"`
	Volume           int64   `json:"成交量"`
	Turnover         float64 `json:"成交额"`
	Amplitude        float64 `json:"振幅"`
	High             float64 `json:"最高"`
	Low              float64 `json:"最低"`
	Open             float64 `json:"今开"`
	Close            float64 `json:"昨收"`
	VolumeRatio      float64 `json:"量比"`
	TurnoverRate     float64 `json:"换手率"`
	PEDynamic        float64 `json:"市盈率-动态"`
	PB               float64 `json:"市净率"`
	TotalMarketCap   float64 `json:"总市值"`
	CircMarketCap    float64 `json:"流通市值"`
	PriceChangeSpeed float64 `json:"涨速"`
	Change5min       float64 `json:"五分钟涨跌"`
	Change60day      float64 `json:"六十日涨跌幅"`
	ChangeYTD        float64 `json:"年初至今涨跌幅"`
}

// EastmoneySpotResponseData defines the structure for the data part of the API response.
type EastmoneySpotResponseData struct {
	Total int                `json:"total"`
	Diff  []StockSpotDataRaw `json:"diff"`
}

// EastmoneySpotResponse defines the overall structure of the API response.
type EastmoneySpotResponse struct {
	Data *EastmoneySpotResponseData `json:"data"`
}

func toFloat(v interface{}) float64 {
	if f, ok := v.(float64); ok {
		return f
	}
	return 0.0
}

func toInt(v interface{}) int64 {
	if f, ok := v.(float64); ok { // JSON unmarshals numbers to float64
		return int64(f)
	}
	return 0
}

func processRawData(rawData []StockSpotDataRaw) []StockSpotData {
	var processedData []StockSpotData
	for _, raw := range rawData {
		processed := StockSpotData{
			Symbol:           raw.Symbol,
			Name:             raw.Name,
			LatestPrice:      toFloat(raw.LatestPrice),
			ChangePct:        toFloat(raw.ChangePct),
			ChangeAmt:        toFloat(raw.ChangeAmt),
			Volume:           toInt(raw.Volume),
			Turnover:         toFloat(raw.Turnover),
			Amplitude:        toFloat(raw.Amplitude),
			High:             toFloat(raw.High),
			Low:              toFloat(raw.Low),
			Open:             toFloat(raw.Open),
			Close:            toFloat(raw.Close),
			VolumeRatio:      toFloat(raw.VolumeRatio),
			TurnoverRate:     toFloat(raw.TurnoverRate),
			PEDynamic:        toFloat(raw.PEDynamic),
			PB:               toFloat(raw.PB),
			TotalMarketCap:   toFloat(raw.TotalMarketCap),
			CircMarketCap:    toFloat(raw.CircMarketCap),
			PriceChangeSpeed: toFloat(raw.PriceChangeSpeed),
			Change5min:       toFloat(raw.Change5min),
			Change60day:      toFloat(raw.Change60day),
			ChangeYTD:        toFloat(raw.ChangeYTD),
		}
		processedData = append(processedData, processed)
	}
	return processedData
}

func fetchAllStockData(market string, pn int, pz int, code string, name string, kdjJ int) ([]StockSpotData, int, error) {
	marketMap := map[string]string{
		"sh":  "m:1+t:2",                                           // 上证A股
		"sz":  "m:0+t:6",                                           // 深证A股
		"cyb": "m:0+t:81+s:2048",                                   // 创业板
		"kcb": "m:1+t:23",                                          // 科创板
		"all": "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048", // 全部A股
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

	if code != "" {
		q.Add("f12", code)
	}

	if name != "" {
		q.Add("f14", name)
	}

	if kdjJ != 0 {
		// 如果 kdjJ 为正数，查找大于等于该值的股票
		// 如果 kdjJ 为负数，查找小于等于该值的绝对值的股票
		if kdjJ > 0 {
			q.Add("f152", fmt.Sprintf(">=%d", kdjJ))
		} else {
			q.Add("f152", fmt.Sprintf("<=%d", -kdjJ))
		}
	}

	q.Add("fields", "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f24,f25,f22,f11,f62,f128,f136,f115,f152")
	req.URL.RawQuery = q.Encode()

	client := &http.Client{Timeout: time.Second * 10}
	fmt.Println(req)
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to read response body: %w", err)
	}

	var spotResponse EastmoneySpotResponse
	if err := json.Unmarshal(body, &spotResponse); err != nil {
		return nil, 0, fmt.Errorf("failed to unmarshal response: %w. Response body: %s", err, string(body))
	}

	if spotResponse.Data == nil || len(spotResponse.Data.Diff) == 0 {
		return nil, 0, nil // No data available
	}

	return processRawData(spotResponse.Data.Diff), spotResponse.Data.Total, nil
}

// GetAllData handles the HTTP request for stock data
func GetAllData(c *gin.Context) {
	market := c.DefaultQuery("market", "all")
	page := c.DefaultQuery("page", "1")
	pageSize := c.DefaultQuery("pageSize", "500")
	code := c.Query("code")
	name := c.Query("name")
	kdjJ := c.Query("kdjJ") // 添加 kdjJ 参数

	// Convert page and pageSize to integers with error handling
	pageNum, err := strconv.Atoi(page)
	if err != nil || pageNum < 1 {
		pageNum = 1
	}
	pageSizeNum, err := strconv.Atoi(pageSize)
	if err != nil || pageSizeNum < 1 || pageSizeNum > 500 {
		pageSizeNum = 500
	}

	// 验证并转换 kdjJ 参数
	var kdjJNum int
	if kdjJ != "" {
		kdjJNum, err = strconv.Atoi(kdjJ)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "kdjJ must be an integer"})
			return
		}
	}

	data, total, err := fetchAllStockData(market, pageNum, pageSizeNum, code, name, kdjJNum)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"data":     data,
		"page":     pageNum,
		"pageSize": pageSizeNum,
		"total":    total,
	})
}
