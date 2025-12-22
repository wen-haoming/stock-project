package stock

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RangeStockData 区间涨幅股票数据
type RangeStockData struct {
	Symbol         string  `json:"symbol"`         // 股票代码
	Name           string  `json:"name"`           // 名称
	StartPrice     float64 `json:"startPrice"`     // 起始价格
	EndPrice       float64 `json:"endPrice"`       // 结束价格
	ChangePct      float64 `json:"changePct"`      // 区间涨跌幅
	LatestPrice    float64 `json:"latestPrice"`    // 最新价
	TotalMarketCap float64 `json:"totalMarketCap"` // 总市值
	CircMarketCap  float64 `json:"circMarketCap"`  // 流通市值
	PERatio        float64 `json:"peRatio"`        // 市盈率
	PBRatio        float64 `json:"pbRatio"`        // 市净率
	TurnoverRate   float64 `json:"turnoverRate"`   // 换手率
	Industry       string  `json:"industry"`       // 行业
}

// 获取单只港股的历史K线数据
func fetchHKStockKline(symbol, startDate, endDate string) ([]HistData, error) {
	// 港股 secid 格式: 116.股票代码
	secid := fmt.Sprintf("116.%s", symbol)

	url := "https://push2his.eastmoney.com/api/qt/stock/kline/get"
	req, _ := http.NewRequest("GET", url, nil)

	q := req.URL.Query()
	q.Add("fields1", "f1,f2,f3,f4,f5,f6")
	q.Add("fields2", "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61")
	q.Add("ut", "7eea3edcaed734bea9cbfc24409ed989")
	q.Add("klt", "101") // 日K
	q.Add("fqt", "1")   // 前复权
	q.Add("secid", secid)
	q.Add("beg", startDate)
	q.Add("end", endDate)
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

	var histResponse EastmoneyHistResponse
	if err := json.Unmarshal(body, &histResponse); err != nil {
		return nil, err
	}

	if histResponse.Data == nil || histResponse.Data.Klines == nil {
		return nil, nil
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

// 获取所有港股列表 (分页获取全部)
func fetchAllHKStockList() ([]HKStockData, error) {
	var allStocks []HKStockData
	seenSymbols := make(map[string]bool)

	page := 1
	for {
		url := "https://push2.eastmoney.com/api/qt/clist/get"
		req, _ := http.NewRequest("GET", url, nil)
		q := req.URL.Query()
		q.Add("pn", strconv.Itoa(page))
		q.Add("pz", "100") // 每页100条（API限制）
		q.Add("po", "1")
		q.Add("ut", "bd1d9ddb04089700cf9c27f6f7426281")
		q.Add("fltt", "2")
		q.Add("invt", "2")
		q.Add("fid", "f3")
		q.Add("fs", "m:128") // 港股全部
		q.Add("fields", "f2,f3,f8,f9,f12,f14,f20,f21,f23,f100")
		req.URL.RawQuery = q.Encode()

		client := &http.Client{Timeout: time.Second * 30}
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, err
		}

		var response EastMoneyHKResponse
		if err := json.Unmarshal(body, &response); err != nil {
			return nil, err
		}

		if response.Data.Diff == nil || len(response.Data.Diff) == 0 {
			break
		}

		diffLen := len(response.Data.Diff)
		for _, raw := range response.Data.Diff {
			// 跳过已存在的股票（去重）
			if seenSymbols[raw.Symbol] {
				continue
			}
			seenSymbols[raw.Symbol] = true

			// 过滤掉窝轮、牛熊证等
			// 港股正股代码一般是00001-09999（5位数，首位0-9）
			// 窝轮牛熊证代码通常是10000以上
			if len(raw.Symbol) != 5 {
				continue
			}
			// 只保留00001-09999范围的股票
			if raw.Symbol[0] != '0' {
				continue
			}

			stock := HKStockData{
				Symbol:         raw.Symbol,
				Name:           raw.Name,
				LatestPrice:    toFloatHK(raw.LatestPrice),
				TotalMarketCap: toFloatHK(raw.TotalMarketCap),
				CircMarketCap:  toFloatHK(raw.CircMarketCap),
				PERatio:        toFloatHK(raw.PERatio),
				PBRatio:        toFloatHK(raw.PBRatio),
				TurnoverRate:   toFloatHK(raw.TurnoverRate),
				Industry:       raw.Industry,
			}
			allStocks = append(allStocks, stock)
		}

		// 如果返回数量少于请求数量，说明已经是最后一页
		if diffLen < 100 {
			break
		}
		page++

		// 安全限制，最多获取200页（约2万只股票）
		if page > 200 {
			break
		}
	}

	return allStocks, nil
}

// GetRangeData 获取区间涨幅数据（返回全部数据，前端分页）
func GetRangeData(c *gin.Context) {
	startDate := c.Query("start_date")
	endDate := c.Query("end_date")
	minChangePct := c.DefaultQuery("min_change_pct", "0")  // 最小涨幅筛选
	minMarketCap := c.DefaultQuery("min_market_cap", "0")  // 最小市值筛选（亿）
	maxMarketCap := c.DefaultQuery("max_market_cap", "0")  // 最大市值筛选（亿），0表示不限
	industryFilter := c.Query("industry")                   // 行业筛选

	if startDate == "" || endDate == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "start_date and end_date are required"})
		return
	}

	minPct, _ := strconv.ParseFloat(minChangePct, 64)
	minCap, _ := strconv.ParseFloat(minMarketCap, 64)
	maxCap, _ := strconv.ParseFloat(maxMarketCap, 64)
	// 转换为实际值（输入是亿，需要转为元）
	minCapValue := minCap * 100000000
	maxCapValue := maxCap * 100000000

	// 1. 获取所有港股列表
	stockList, err := fetchAllHKStockList()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch stock list: " + err.Error()})
		return
	}

	// 2. 并发获取每只股票的历史数据并计算涨幅
	var wg sync.WaitGroup
	var mu sync.Mutex
	results := make([]RangeStockData, 0)

	// 限制并发数
	semaphore := make(chan struct{}, 50)

	for _, stock := range stockList {
		wg.Add(1)
		go func(s HKStockData) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			// 市值筛选（在获取K线之前先过滤，减少请求）
			if minCapValue > 0 && s.TotalMarketCap < minCapValue {
				return
			}
			if maxCapValue > 0 && s.TotalMarketCap > maxCapValue {
				return
			}

			// 行业筛选
			if industryFilter != "" {
				stockIndustry := s.Industry
				if stockIndustry == "" || stockIndustry == "-" {
					stockIndustry = "其他"
				}
				if stockIndustry != industryFilter {
					return
				}
			}

			klines, err := fetchHKStockKline(s.Symbol, startDate, endDate)
			if err != nil || len(klines) < 2 {
				return
			}

			startPrice := klines[0].Close
			endPrice := klines[len(klines)-1].Close

			if startPrice <= 0 {
				return
			}

			changePct := (endPrice - startPrice) / startPrice * 100

			// 筛选涨幅大于最小值的股票
			if changePct < minPct {
				return
			}

			rangeData := RangeStockData{
				Symbol:         s.Symbol,
				Name:           s.Name,
				StartPrice:     startPrice,
				EndPrice:       endPrice,
				ChangePct:      changePct,
				LatestPrice:    s.LatestPrice,
				TotalMarketCap: s.TotalMarketCap,
				CircMarketCap:  s.CircMarketCap,
				PERatio:        s.PERatio,
				PBRatio:        s.PBRatio,
				TurnoverRate:   s.TurnoverRate,
				Industry:       s.Industry,
			}

			mu.Lock()
			results = append(results, rangeData)
			mu.Unlock()
		}(stock)
	}

	wg.Wait()

	// 3. 按涨幅排序
	sort.Slice(results, func(i, j int) bool {
		return results[i].ChangePct > results[j].ChangePct
	})

	// 统计行业分布
	industryStats := make(map[string]int)
	for _, stock := range results {
		industry := stock.Industry
		if industry == "" || industry == "-" {
			industry = "其他"
		}
		industryStats[industry]++
	}

	// 转换为数组并按数量排序
	type IndustryStat struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	}
	var industryList []IndustryStat
	for name, count := range industryStats {
		industryList = append(industryList, IndustryStat{Name: name, Count: count})
	}
	sort.Slice(industryList, func(i, j int) bool {
		return industryList[i].Count > industryList[j].Count
	})

	// 返回全部数据，前端分页
	c.JSON(http.StatusOK, gin.H{
		"data":          results,
		"total":         len(results),
		"industryStats": industryList,
	})
}
