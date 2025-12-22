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

// HKStockData 港股数据结构
type HKStockData struct {
	Symbol         string  `json:"symbol"`         // 股票代码
	Name           string  `json:"name"`           // 中文名称
	LatestPrice    float64 `json:"latestPrice"`    // 最新价
	Open           float64 `json:"open"`           // 今开
	Close          float64 `json:"close"`          // 昨收
	High           float64 `json:"high"`           // 最高
	Low            float64 `json:"low"`            // 最低
	ChangePct      float64 `json:"changePct"`      // 涨跌幅
	ChangeAmt      float64 `json:"changeAmt"`      // 涨跌额
	Volume         int64   `json:"volume"`         // 成交量
	Turnover       float64 `json:"turnover"`       // 成交额
	TurnoverRate   float64 `json:"turnoverRate"`   // 换手率
	Amplitude      float64 `json:"amplitude"`      // 振幅
	TotalMarketCap float64 `json:"totalMarketCap"` // 总市值
	CircMarketCap  float64 `json:"circMarketCap"`  // 流通市值
	PERatio        float64 `json:"peRatio"`        // 市盈率
	PBRatio        float64 `json:"pbRatio"`        // 市净率
	Industry       string  `json:"industry"`       // 所属行业/板块
}

// EastMoneyHKRaw 东方财富港股原始数据
type EastMoneyHKRaw struct {
	Symbol         string      `json:"f12"` // 代码
	Name           string      `json:"f14"` // 名称
	LatestPrice    interface{} `json:"f2"`  // 最新价
	ChangePct      interface{} `json:"f3"`  // 涨跌幅
	ChangeAmt      interface{} `json:"f4"`  // 涨跌额
	Volume         interface{} `json:"f5"`  // 成交量
	Turnover       interface{} `json:"f6"`  // 成交额
	Amplitude      interface{} `json:"f7"`  // 振幅
	TurnoverRate   interface{} `json:"f8"`  // 换手率
	PERatio        interface{} `json:"f9"`  // 市盈率
	High           interface{} `json:"f15"` // 最高
	Low            interface{} `json:"f16"` // 最低
	Open           interface{} `json:"f17"` // 今开
	Close          interface{} `json:"f18"` // 昨收
	TotalMarketCap interface{} `json:"f20"` // 总市值
	CircMarketCap  interface{} `json:"f21"` // 流通市值
	PBRatio        interface{} `json:"f23"` // 市净率
	Industry       string      `json:"f100"` // 所属行业
}

// EastMoneyHKDiff 支持数组和 map 两种格式的 diff 字段
type EastMoneyHKDiff struct {
	items []EastMoneyHKRaw
}

// UnmarshalJSON 自定义 JSON 解析，支持数组和 map 两种格式
func (d *EastMoneyHKDiff) UnmarshalJSON(data []byte) error {
	// 先尝试解析为数组
	var arr []EastMoneyHKRaw
	if err := json.Unmarshal(data, &arr); err == nil {
		d.items = arr
		return nil
	}

	// 如果数组解析失败，尝试解析为 map
	var m map[string]EastMoneyHKRaw
	if err := json.Unmarshal(data, &m); err != nil {
		return err
	}

	// 将 map 转换为数组
	d.items = make([]EastMoneyHKRaw, 0, len(m))
	for _, v := range m {
		d.items = append(d.items, v)
	}
	return nil
}

// ToSlice 返回数组格式的数据
func (d *EastMoneyHKDiff) ToSlice() []EastMoneyHKRaw {
	if d == nil {
		return nil
	}
	return d.items
}

// Len 返回数据长度
func (d *EastMoneyHKDiff) Len() int {
	if d == nil {
		return 0
	}
	return len(d.items)
}

// EastMoneyHKResponse 东方财富港股响应
type EastMoneyHKResponse struct {
	Data struct {
		Total int             `json:"total"`
		Diff  EastMoneyHKDiff `json:"diff"`
	} `json:"data"`
}

func toFloatHK(v interface{}) float64 {
	if v == nil {
		return 0
	}
	switch val := v.(type) {
	case float64:
		return val
	case string:
		if val == "-" || val == "" {
			return 0
		}
		f, _ := strconv.ParseFloat(val, 64)
		return f
	}
	return 0
}

func toIntHK(v interface{}) int64 {
	if v == nil {
		return 0
	}
	switch val := v.(type) {
	case float64:
		return int64(val)
	case string:
		if val == "-" || val == "" {
			return 0
		}
		i, _ := strconv.ParseInt(val, 10, 64)
		return i
	}
	return 0
}

// fetchHKStockData 从东方财富获取港股数据 (免费API)
func fetchHKStockData(page, pageSize int, code, name string) ([]HKStockData, int, error) {
	// 东方财富港股API
	url := "https://push2.eastmoney.com/api/qt/clist/get"

	req, _ := http.NewRequest("GET", url, nil)
	q := req.URL.Query()
	q.Add("pn", fmt.Sprintf("%d", page))
	q.Add("pz", fmt.Sprintf("%d", pageSize))
	q.Add("po", "1")
	q.Add("ut", "bd1d9ddb04089700cf9c27f6f7426281")
	q.Add("fltt", "2")
	q.Add("invt", "2")
	q.Add("fid", "f3")   // 按涨跌幅排序
	q.Add("fs", "m:128") // 港股全部
	q.Add("fields", "f2,f3,f4,f5,f6,f7,f8,f9,f12,f14,f15,f16,f17,f18,f20,f21,f23")
	req.URL.RawQuery = q.Encode()

	client := &http.Client{Timeout: time.Second * 15}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to read response body: %w", err)
	}

	var response EastMoneyHKResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, 0, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	if response.Data.Diff.Len() == 0 {
		return nil, 0, nil
	}

	// 转换数据
	var result []HKStockData
	for _, raw := range response.Data.Diff.ToSlice() {
		// 过滤条件
		if code != "" && !strings.Contains(raw.Symbol, code) {
			continue
		}
		if name != "" && !strings.Contains(raw.Name, name) {
			continue
		}

		stock := HKStockData{
			Symbol:         raw.Symbol,
			Name:           raw.Name,
			LatestPrice:    toFloatHK(raw.LatestPrice),
			Open:           toFloatHK(raw.Open),
			Close:          toFloatHK(raw.Close),
			High:           toFloatHK(raw.High),
			Low:            toFloatHK(raw.Low),
			ChangePct:      toFloatHK(raw.ChangePct),
			ChangeAmt:      toFloatHK(raw.ChangeAmt),
			Volume:         toIntHK(raw.Volume),
			Turnover:       toFloatHK(raw.Turnover),
			TurnoverRate:   toFloatHK(raw.TurnoverRate),
			Amplitude:      toFloatHK(raw.Amplitude),
			TotalMarketCap: toFloatHK(raw.TotalMarketCap),
			CircMarketCap:  toFloatHK(raw.CircMarketCap),
			PERatio:        toFloatHK(raw.PERatio),
			PBRatio:        toFloatHK(raw.PBRatio),
			Industry:       raw.Industry,
		}
		result = append(result, stock)
	}

	return result, response.Data.Total, nil
}

// GetAllData 获取港股数据 (使用东方财富免费API)
func GetAllData(c *gin.Context) {
	page := c.DefaultQuery("page", "1")
	pageSize := c.DefaultQuery("pageSize", "100")
	code := c.Query("code")
	name := c.Query("name")

	pageNum, err := strconv.Atoi(page)
	if err != nil || pageNum < 1 {
		pageNum = 1
	}
	pageSizeNum, err := strconv.Atoi(pageSize)
	if err != nil || pageSizeNum < 1 || pageSizeNum > 2000 {
		pageSizeNum = 100
	}

	data, total, err := fetchHKStockData(pageNum, pageSizeNum, code, name)
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
