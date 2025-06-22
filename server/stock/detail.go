package stock

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// HistData represents historical stock data for a single day.
type HistData struct {
	Date         string  `json:"日期"`
	Symbol       string  `json:"股票代码"`
	Open         float64 `json:"开盘"`
	Close        float64 `json:"收盘"`
	High         float64 `json:"最高"`
	Low          float64 `json:"最低"`
	Volume       int64   `json:"成交量"`
	Turnover     float64 `json:"成交额"`
	Amplitude    float64 `json:"振幅"`
	ChangePct    float64 `json:"涨跌幅"`
	ChangeAmt    float64 `json:"涨跌额"`
	TurnoverRate float64 `json:"换手率"`
}

// EastmoneyHistResponseData defines the structure for the data part of the API response.
type EastmoneyHistResponseData struct {
	Code   string   `json:"code"`
	Market int      `json:"market"`
	Name   string   `json:"name"`
	Klines []string `json:"klines"`
}

// EastmoneyHistResponse defines the overall structure of the API response.
type EastmoneyHistResponse struct {
	Data *EastmoneyHistResponseData `json:"data"`
}

func parseFloat(s string) float64 {
	f, _ := strconv.ParseFloat(s, 64)
	return f
}

func parseInt(s string) int64 {
	i, _ := strconv.ParseInt(s, 10, 64)
	return i
}

// fetchStockHist fetches historical data for a given stock symbol.
func fetchStockHist(symbol, period, startDate, endDate, adjust string) ([]HistData, error) {
	marketCode := "0"
	if strings.HasPrefix(symbol, "6") { // SSE
		marketCode = "1"
	}

	adjustDict := map[string]string{"qfq": "1", "hfq": "2", "": "0"}
	periodDict := map[string]string{"daily": "101", "weekly": "102", "monthly": "103"}

	url := "https://push2his.eastmoney.com/api/qt/stock/kline/get"
	req, _ := http.NewRequest("GET", url, nil)

	q := req.URL.Query()
	q.Add("fields1", "f1,f2,f3,f4,f5,f6")
	q.Add("fields2", "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f116")
	q.Add("ut", "7eea3edcaed734bea9cbfc24409ed989")
	q.Add("klt", periodDict[period])
	q.Add("fqt", adjustDict[adjust])
	q.Add("secid", fmt.Sprintf("%s.%s", marketCode, symbol))
	q.Add("beg", startDate)
	q.Add("end", endDate)
	req.URL.RawQuery = q.Encode()

	client := &http.Client{Timeout: time.Second * 10}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %w", err)
	}

	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)

	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	var histResponse EastmoneyHistResponse
	if err := json.Unmarshal(body, &histResponse); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w. Response body: %s", err, string(body))
	}

	if histResponse.Data == nil || histResponse.Data.Klines == nil {
		return []HistData{}, nil // No data available, return empty slice
	}

	var results []HistData
	for _, item := range histResponse.Data.Klines {
		fields := strings.Split(item, ",")
		if len(fields) < 11 {
			continue
		}
		data := HistData{
			Date:         fields[0],
			Symbol:       symbol,
			Open:         parseFloat(fields[1]),
			Close:        parseFloat(fields[2]),
			High:         parseFloat(fields[3]),
			Low:          parseFloat(fields[4]),
			Volume:       parseInt(fields[5]),
			Turnover:     parseFloat(fields[6]),
			Amplitude:    parseFloat(fields[7]),
			ChangePct:    parseFloat(fields[8]),
			ChangeAmt:    parseFloat(fields[9]),
			TurnoverRate: parseFloat(fields[10]),
		}
		results = append(results, data)
	}

	return results, nil
}

// GetStockHist is the handler for the /api/v1/stock/hist endpoint.
func GetStockHist(c *gin.Context) {
	symbol := c.Query("symbol")
	if symbol == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "stock symbol is required"})
		return
	}

	endDate := c.Query("end_date")
	startDate := c.Query("start_date")

	if startDate == "" || endDate == "" {
		now := time.Now()
		endDate = now.Format("20060101")
		startDate = now.AddDate(0, -6, 0).Format("20060101")
	}

	period := c.DefaultQuery("period", "daily")
	adjust := c.DefaultQuery("adjust", "qfq")

	histData, err := fetchStockHist(symbol, period, startDate, endDate, adjust)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, histData)
}
