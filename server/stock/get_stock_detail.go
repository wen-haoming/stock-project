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

// StockDetailData 详细股票数据结构
type StockDetailData struct {
	// 基本信息
	Symbol string `json:"symbol"` // 代码
	Name   string `json:"name"`   // 名称
	Market string `json:"market"` // 市场 (sh/sz)

	// 价格信息
	LatestPrice float64 `json:"latestPrice"` // 最新价
	Open        float64 `json:"open"`        // 今开
	Close       float64 `json:"close"`       // 昨收
	High        float64 `json:"high"`        // 最高
	Low         float64 `json:"low"`         // 最低
	ChangePct   float64 `json:"changePct"`   // 涨跌幅
	ChangeAmt   float64 `json:"changeAmt"`   // 涨跌额
	Amplitude   float64 `json:"amplitude"`   // 振幅

	// 成交信息
	Volume       int64   `json:"volume"`       // 成交量
	Turnover     float64 `json:"turnover"`     // 成交额
	TurnoverRate float64 `json:"turnoverRate"` // 换手率
	VolumeRatio  float64 `json:"volumeRatio"`  // 量比

	// 市值信息
	TotalMarketCap float64 `json:"totalMarketCap"` // 总市值
	CircMarketCap  float64 `json:"circMarketCap"`  // 流通市值
	PEDynamic      float64 `json:"peDynamic"`      // 市盈率-动态
	PB             float64 `json:"pb"`             // 市净率

	// 涨跌统计
	Change5min  float64 `json:"change5min"`  // 五分钟涨跌
	Change60day float64 `json:"change60day"` // 六十日涨跌幅
	ChangeYTD   float64 `json:"changeYTD"`   // 年初至今涨跌幅

	// 技术指标
	KDJ  *KDJIndicator  `json:"kdj,omitempty"`  // KDJ指标
	MACD *MACDIndicator `json:"macd,omitempty"` // MACD指标

	// 板块信息
	Industry string `json:"industry"` // 所属行业
	Concept  string `json:"concept"`  // 概念板块
	Region   string `json:"region"`   // 地区板块
}

// KDJIndicator KDJ指标
type KDJIndicator struct {
	K float64 `json:"k"`
	D float64 `json:"d"`
	J float64 `json:"j"`
}

// MACDIndicator MACD指标
type MACDIndicator struct {
	DIF  float64 `json:"dif"`  // 差离值
	DEA  float64 `json:"dea"`  // 信号线
	MACD float64 `json:"macd"` // 柱状图
}

// StockDetailRaw 原始数据结构
type StockDetailRaw struct {
	Symbol         string      `json:"f12"` // 代码
	Name           string      `json:"f14"` // 名称
	MarketID       interface{} `json:"f13"` // 市场ID
	LatestPrice    interface{} `json:"f2"`  // 最新价
	ChangePct      interface{} `json:"f3"`  // 涨跌幅
	ChangeAmt      interface{} `json:"f4"`  // 涨跌额
	Volume         interface{} `json:"f5"`  // 成交量
	Turnover       interface{} `json:"f6"`  // 成交额
	Amplitude      interface{} `json:"f7"`  // 振幅
	TurnoverRate   interface{} `json:"f8"`  // 换手率
	PEDynamic      interface{} `json:"f9"`  // 市盈率
	VolumeRatio    interface{} `json:"f10"` // 量比
	Change5min     interface{} `json:"f11"` // 5分钟涨跌
	High           interface{} `json:"f15"` // 最高
	Low            interface{} `json:"f16"` // 最低
	Open           interface{} `json:"f17"` // 今开
	Close          interface{} `json:"f18"` // 昨收
	TotalMarketCap interface{} `json:"f20"` // 总市值
	CircMarketCap  interface{} `json:"f21"` // 流通市值
	PB             interface{} `json:"f23"` // 市净率
	Change60day    interface{} `json:"f24"` // 60日涨跌幅
	ChangeYTD      interface{} `json:"f25"` // 年初至今涨跌幅
	Industry       string      `json:"f100"` // 所属行业
}

// StockDetailResponse API响应结构
type StockDetailResponse struct {
	Data struct {
		Total int              `json:"total"`
		Diff  []StockDetailRaw `json:"diff"`
	} `json:"data"`
}

// toFloatDetail 转换interface到float64
func toFloatDetail(v interface{}) float64 {
	if f, ok := v.(float64); ok {
		return f
	}
	return 0.0
}

// toIntDetail 转换interface到int64
func toIntDetail(v interface{}) int64 {
	if f, ok := v.(float64); ok {
		return int64(f)
	}
	return 0
}

// KLineData K线数据用于计算技术指标
type KLineData struct {
	Close  float64
	High   float64
	Low    float64
	Volume float64
}

// 获取股票K线数据用于计算技术指标
func fetchKLineData(symbol string, marketID int) ([]KLineData, error) {
	// 构建股票代码
	var secid string
	if marketID == 1 {
		secid = fmt.Sprintf("1.%s", symbol)
	} else {
		secid = fmt.Sprintf("0.%s", symbol)
	}

	url := "https://push2his.eastmoney.com/api/qt/stock/kline/get"
	req, _ := http.NewRequest("GET", url, nil)
	q := req.URL.Query()
	q.Add("secid", secid)
	q.Add("fields1", "f1,f2,f3,f4,f5,f6")
	q.Add("fields2", "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61")
	q.Add("klt", "101")   // 日K
	q.Add("fqt", "1")     // 前复权
	q.Add("end", "20500101")
	q.Add("lmt", "60")    // 获取60条数据用于计算指标
	req.URL.RawQuery = q.Encode()

	client := &http.Client{Timeout: time.Second * 10}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result struct {
		Data struct {
			Klines []string `json:"klines"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	var klines []KLineData
	for _, line := range result.Data.Klines {
		parts := strings.Split(line, ",")
		if len(parts) >= 6 {
			open, _ := strconv.ParseFloat(parts[1], 64)
			close, _ := strconv.ParseFloat(parts[2], 64)
			high, _ := strconv.ParseFloat(parts[3], 64)
			low, _ := strconv.ParseFloat(parts[4], 64)
			volume, _ := strconv.ParseFloat(parts[5], 64)
			_ = open
			klines = append(klines, KLineData{
				Close:  close,
				High:   high,
				Low:    low,
				Volume: volume,
			})
		}
	}
	return klines, nil
}

// 计算KDJ指标
func calcKDJ(klines []KLineData, n int) *KDJIndicator {
	if len(klines) < n {
		return nil
	}

	k := 50.0
	d := 50.0
	var j float64

	for i := 0; i < len(klines); i++ {
		startIdx := i - n + 1
		if startIdx < 0 {
			startIdx = 0
		}

		lowN := klines[startIdx].Low
		highN := klines[startIdx].High

		for j := startIdx; j <= i; j++ {
			if klines[j].Low < lowN {
				lowN = klines[j].Low
			}
			if klines[j].High > highN {
				highN = klines[j].High
			}
		}

		rsv := 0.0
		if highN-lowN > 1e-9 {
			rsv = (klines[i].Close - lowN) / (highN - lowN) * 100.0
		}

		if i == 0 {
			k = 50.0
			d = 50.0
		} else {
			k = 2.0/3.0*k + 1.0/3.0*rsv
			d = 2.0/3.0*d + 1.0/3.0*k
		}
		j = 3.0*k - 2.0*d
	}

	return &KDJIndicator{K: k, D: d, J: j}
}

// 计算MACD指标
func calcMACD(klines []KLineData, short, long, signal int) *MACDIndicator {
	if len(klines) < long {
		return nil
	}

	// 计算EMA
	calcEMA := func(data []float64, period int) []float64 {
		ema := make([]float64, len(data))
		multiplier := 2.0 / float64(period+1)
		ema[0] = data[0]
		for i := 1; i < len(data); i++ {
			ema[i] = (data[i]-ema[i-1])*multiplier + ema[i-1]
		}
		return ema
	}

	closes := make([]float64, len(klines))
	for i, k := range klines {
		closes[i] = k.Close
	}

	emaShort := calcEMA(closes, short)
	emaLong := calcEMA(closes, long)

	// 计算DIF
	dif := make([]float64, len(closes))
	for i := range closes {
		dif[i] = emaShort[i] - emaLong[i]
	}

	// 计算DEA (DIF的EMA)
	dea := calcEMA(dif, signal)

	// 最后一个值
	lastIdx := len(closes) - 1
	macdValue := (dif[lastIdx] - dea[lastIdx]) * 2

	return &MACDIndicator{
		DIF:  dif[lastIdx],
		DEA:  dea[lastIdx],
		MACD: macdValue,
	}
}

// 获取股票板块信息
func fetchStockSector(symbol string, marketID int) (industry, concept, region string) {
	var secid string
	if marketID == 1 {
		secid = fmt.Sprintf("1.%s", symbol)
	} else {
		secid = fmt.Sprintf("0.%s", symbol)
	}

	url := "https://push2.eastmoney.com/api/qt/stock/get"
	req, _ := http.NewRequest("GET", url, nil)
	q := req.URL.Query()
	q.Add("secid", secid)
	q.Add("fields", "f127,f128,f129")
	q.Add("ut", "fa5fd1943c7b386f172d6893dbfba10b")
	req.URL.RawQuery = q.Encode()

	client := &http.Client{Timeout: time.Second * 5}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", ""
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var result struct {
		Data struct {
			Industry string `json:"f127"` // 行业
			Region   string `json:"f128"` // 地区
			Concept  string `json:"f129"` // 概念
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", "", ""
	}

	return result.Data.Industry, result.Data.Concept, result.Data.Region
}

// 获取详细股票数据
func fetchStockDetailData(market string, pn, pz int, code, name string, withIndicators bool) ([]StockDetailData, int, error) {
	marketMap := map[string]string{
		"sh":  "m:1+t:2",
		"sz":  "m:0+t:6",
		"cyb": "m:0+t:81+s:2048",
		"kcb": "m:1+t:23",
		"all": "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048",
	}
	fs, ok := marketMap[market]
	if !ok {
		fs = marketMap["all"]
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
	q.Add("fid", "f3") // 按涨跌幅排序
	q.Add("fs", fs)
	q.Add("fields", "f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f24,f25,f100")
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

	var response StockDetailResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, 0, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	if response.Data.Diff == nil {
		return nil, 0, nil
	}

	// 转换数据
	var result []StockDetailData
	for _, raw := range response.Data.Diff {
		// 过滤条件
		if code != "" && !strings.Contains(raw.Symbol, code) {
			continue
		}
		if name != "" && !strings.Contains(raw.Name, name) {
			continue
		}

		marketID := int(toFloatDetail(raw.MarketID))
		marketStr := "sz"
		if marketID == 1 {
			marketStr = "sh"
		}

		stock := StockDetailData{
			Symbol:         raw.Symbol,
			Name:           raw.Name,
			Market:         marketStr,
			LatestPrice:    toFloatDetail(raw.LatestPrice),
			Open:           toFloatDetail(raw.Open),
			Close:          toFloatDetail(raw.Close),
			High:           toFloatDetail(raw.High),
			Low:            toFloatDetail(raw.Low),
			ChangePct:      toFloatDetail(raw.ChangePct),
			ChangeAmt:      toFloatDetail(raw.ChangeAmt),
			Amplitude:      toFloatDetail(raw.Amplitude),
			Volume:         toIntDetail(raw.Volume),
			Turnover:       toFloatDetail(raw.Turnover),
			TurnoverRate:   toFloatDetail(raw.TurnoverRate),
			VolumeRatio:    toFloatDetail(raw.VolumeRatio),
			TotalMarketCap: toFloatDetail(raw.TotalMarketCap),
			CircMarketCap:  toFloatDetail(raw.CircMarketCap),
			PEDynamic:      toFloatDetail(raw.PEDynamic),
			PB:             toFloatDetail(raw.PB),
			Change5min:     toFloatDetail(raw.Change5min),
			Change60day:    toFloatDetail(raw.Change60day),
			ChangeYTD:      toFloatDetail(raw.ChangeYTD),
			Industry:       raw.Industry,
		}

		// 如果需要技术指标，获取K线数据计算
		if withIndicators {
			klines, err := fetchKLineData(raw.Symbol, marketID)
			if err == nil && len(klines) > 0 {
				stock.KDJ = calcKDJ(klines, 9)
				stock.MACD = calcMACD(klines, 12, 26, 9)
			}

			// 获取板块信息
			industry, concept, region := fetchStockSector(raw.Symbol, marketID)
			if industry != "" {
				stock.Industry = industry
			}
			stock.Concept = concept
			stock.Region = region
		}

		result = append(result, stock)
	}

	return result, response.Data.Total, nil
}

// GetStockDetail 获取详细股票数据的HTTP处理函数
func GetStockDetail(c *gin.Context) {
	market := c.DefaultQuery("market", "all")
	page := c.DefaultQuery("page", "1")
	pageSize := c.DefaultQuery("pageSize", "20")
	code := c.Query("code")
	name := c.Query("name")
	withIndicators := c.DefaultQuery("indicators", "false") == "true"

	pageNum, err := strconv.Atoi(page)
	if err != nil || pageNum < 1 {
		pageNum = 1
	}
	pageSizeNum, err := strconv.Atoi(pageSize)
	if err != nil || pageSizeNum < 1 || pageSizeNum > 100 {
		pageSizeNum = 20
	}

	// 如果需要技术指标，限制每页数量避免请求过多
	if withIndicators && pageSizeNum > 20 {
		pageSizeNum = 20
	}

	data, total, err := fetchStockDetailData(market, pageNum, pageSizeNum, code, name, withIndicators)
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
