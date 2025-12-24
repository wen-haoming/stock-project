package stock

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"server/db"

	"github.com/gin-gonic/gin"
)

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
	// Panic recovery
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Panic in GetRangeData: %v", r)
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": fmt.Sprintf("Internal server error: %v", r),
			})
		}
	}()

	startDate := c.Query("start_date")
	endDate := c.Query("end_date")
	minChangePct := c.DefaultQuery("min_change_pct", "0")        // 最小涨幅筛选
	minMarketCap := c.DefaultQuery("min_market_cap", "0")        // 最小市值筛选（亿）
	maxMarketCap := c.DefaultQuery("max_market_cap", "0")        // 最大市值筛选（亿），0表示不限
	industryFilter := c.Query("industry")                        // 行业筛选
	forceRefresh := c.DefaultQuery("refresh", "false") == "true" // 强制刷新缓存

	if startDate == "" || endDate == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "start_date and end_date are required"})
		return
	}

	// 转换日期格式 20240102 -> 2024-01-02
	startDateFmt := formatDate(startDate)
	endDateFmt := formatDate(endDate)

	minPct, _ := strconv.ParseFloat(minChangePct, 64)
	minCap, _ := strconv.ParseFloat(minMarketCap, 64)
	maxCap, _ := strconv.ParseFloat(maxMarketCap, 64)
	// 转换为实际值（输入是亿，需要转为元）
	minCapValue := minCap * 100000000
	maxCapValue := maxCap * 100000000

	ctx := context.Background()

	// 初始化变量
	var allResults []db.RangeStockData
	var fromDB bool

	// 检查数据库连接
	if db.IsConnected() {
		cacheRepo := db.NewRangeCacheRepository()
		klineRepo := db.NewKlineRepository()

		// 尝试从缓存获取
		if !forceRefresh {
			cache, err := cacheRepo.GetCache(ctx, startDate, endDate)
			if err == nil && cache != nil && cacheRepo.IsCacheValid(cache) {
				log.Printf("Range cache hit for %s - %s", startDate, endDate)
				allResults = cache.Data
			} else if err != nil {
				log.Printf("Error getting cache: %v", err)
			}
		}

		// 缓存未命中，尝试从数据库K线数据计算
		if len(allResults) == 0 {
			// 检查数据库是否有K线数据
			klineCount, err := klineRepo.CountKlines(ctx)
			if err != nil {
				log.Printf("Error counting klines: %v", err)
			} else if klineCount > 10000 {
				log.Printf("Calculating range from DB klines (%d records)", klineCount)
				allResults, fromDB = calculateRangeFromDB(ctx, klineRepo, startDateFmt, endDateFmt)
			}
		}
	} else {
		log.Printf("Database not connected, will fetch from API")
	}

	// 数据库也没有，从API获取
	if len(allResults) == 0 {
		log.Printf("Range cache miss, fetching from API for %s - %s", startDate, endDate)

		// 1. 获取所有港股列表
		stockList, err := fetchAllHKStockList()
		if err != nil {
			log.Printf("Error fetching stock list: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch stock list: " + err.Error()})
			return
		}

		if len(stockList) == 0 {
			log.Printf("No stocks found in list")
			c.JSON(http.StatusOK, gin.H{
				"data":          []db.RangeStockData{},
				"total":         0,
				"industryStats": []interface{}{},
				"cached":        false,
				"fromDB":        false,
			})
			return
		}

		// 2. 并发获取每只股票的历史数据并计算涨幅
		var wg sync.WaitGroup
		var mu sync.Mutex
		results := make([]db.RangeStockData, 0)

		// 限制并发数
		semaphore := make(chan struct{}, 50)

		for _, stock := range stockList {
			wg.Add(1)
			go func(s HKStockData) {
				defer wg.Done()
				semaphore <- struct{}{}
				defer func() { <-semaphore }()

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

				rangeData := db.RangeStockData{
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

		// 按涨幅排序
		sort.Slice(results, func(i, j int) bool {
			return results[i].ChangePct > results[j].ChangePct
		})

		allResults = results
	}

	// 保存到缓存（来自API的数据）
	if len(allResults) > 0 && !fromDB && db.IsConnected() {
		cacheRepo := db.NewRangeCacheRepository()
		if err := cacheRepo.SetCache(ctx, startDate, endDate, allResults); err != nil {
			log.Printf("Failed to save range cache: %v", err)
		} else {
			log.Printf("Range cache saved for %s - %s, %d stocks", startDate, endDate, len(allResults))
		}
	}

	// 3. 在内存中进行筛选（基于缓存的全量数据）
	var filteredResults []db.RangeStockData
	for _, stock := range allResults {
		// 市值筛选
		if minCapValue > 0 && stock.TotalMarketCap < minCapValue {
			continue
		}
		if maxCapValue > 0 && stock.TotalMarketCap > maxCapValue {
			continue
		}

		// 行业筛选
		if industryFilter != "" {
			stockIndustry := stock.Industry
			if stockIndustry == "" || stockIndustry == "-" {
				stockIndustry = "其他"
			}
			if stockIndustry != industryFilter {
				continue
			}
		}

		// 涨幅筛选
		if stock.ChangePct < minPct {
			continue
		}

		filteredResults = append(filteredResults, stock)
	}

	// 统计行业分布（基于筛选后的数据）
	industryStats := make(map[string]int)
	for _, stock := range filteredResults {
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

	// 返回筛选后的数据
	c.JSON(http.StatusOK, gin.H{
		"data":          filteredResults,
		"total":         len(filteredResults),
		"industryStats": industryList,
		"cached":        len(allResults) > 0,
		"fromDB":        fromDB,
	})
}

// formatDate 转换日期格式 20240102 -> 2024-01-02
func formatDate(date string) string {
	if len(date) == 8 {
		return date[:4] + "-" + date[4:6] + "-" + date[6:]
	}
	return date
}

// calculateRangeFromDB 从数据库K线数据计算区间涨幅
func calculateRangeFromDB(ctx context.Context, klineRepo *db.KlineRepository, startDate, endDate string) ([]db.RangeStockData, bool) {
	// 获取所有有K线数据的股票
	symbols, err := klineRepo.GetAllSymbols(ctx)
	if err != nil || len(symbols) == 0 {
		return nil, false
	}

	log.Printf("Calculating range for %d symbols from DB", len(symbols))

	// 获取股票基本信息（用于市值等数据）
	stockRepo := db.NewStockRepository()

	var results []db.RangeStockData
	var mu sync.Mutex
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 50)

	for _, symbol := range symbols {
		wg.Add(1)
		go func(sym string) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			// 从数据库获取K线
			klines, err := klineRepo.GetKlinesBySymbol(ctx, sym, startDate, endDate)
			if err != nil || len(klines) < 2 {
				return
			}

			startPrice := klines[0].Close
			endPrice := klines[len(klines)-1].Close

			if startPrice <= 0 {
				return
			}

			changePct := (endPrice - startPrice) / startPrice * 100

			// 获取股票基本信息
			stockInfo, _ := stockRepo.GetStockBySymbol(ctx, sym)

			rangeData := db.RangeStockData{
				Symbol:     sym,
				StartPrice: startPrice,
				EndPrice:   endPrice,
				ChangePct:  changePct,
			}

			if stockInfo != nil {
				rangeData.Name = stockInfo.Name
				rangeData.LatestPrice = stockInfo.LatestPrice
				rangeData.TotalMarketCap = stockInfo.TotalMarketCap
				rangeData.CircMarketCap = stockInfo.CircMarketCap
				rangeData.PERatio = stockInfo.PERatio
				rangeData.PBRatio = stockInfo.PBRatio
				rangeData.TurnoverRate = stockInfo.TurnoverRate
				rangeData.Industry = stockInfo.Industry
			}

			mu.Lock()
			results = append(results, rangeData)
			mu.Unlock()
		}(symbol)
	}

	wg.Wait()

	// 按涨幅排序
	sort.Slice(results, func(i, j int) bool {
		return results[i].ChangePct > results[j].ChangePct
	})

	log.Printf("Calculated %d stocks from DB", len(results))
	return results, true
}

// RefreshRangeData 主动刷新并存储范围数据到数据库
func RefreshRangeData(c *gin.Context) {
	startDate := c.Query("start_date")
	endDate := c.Query("end_date")

	if startDate == "" || endDate == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "start_date and end_date are required"})
		return
	}

	if !db.IsConnected() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not connected"})
		return
	}

	ctx := context.Background()

	log.Printf("Starting to refresh range data for %s - %s", startDate, endDate)

	// 1. 获取所有港股列表
	stockList, err := fetchAllHKStockList()
	if err != nil {
		log.Printf("Error fetching stock list: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch stock list: " + err.Error()})
		return
	}

	if len(stockList) == 0 {
		log.Printf("No stocks found in list")
		c.JSON(http.StatusOK, gin.H{
			"message": "No stocks found",
			"count":   0,
		})
		return
	}

	log.Printf("Fetched %d stocks from API", len(stockList))

	// 2. 并发获取每只股票的历史数据并计算涨幅
	var wg sync.WaitGroup
	var mu sync.Mutex
	results := make([]db.RangeStockData, 0)
	successCount := 0
	failCount := 0

	// 限制并发数
	semaphore := make(chan struct{}, 50)

	for _, stock := range stockList {
		wg.Add(1)
		go func(s HKStockData) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			klines, err := fetchHKStockKline(s.Symbol, startDate, endDate)
			if err != nil || len(klines) < 2 {
				mu.Lock()
				failCount++
				mu.Unlock()
				return
			}

			startPrice := klines[0].Close
			endPrice := klines[len(klines)-1].Close

			if startPrice <= 0 {
				mu.Lock()
				failCount++
				mu.Unlock()
				return
			}

			changePct := (endPrice - startPrice) / startPrice * 100

			rangeData := db.RangeStockData{
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
			successCount++
			mu.Unlock()
		}(stock)
	}

	wg.Wait()

	// 按涨幅排序
	sort.Slice(results, func(i, j int) bool {
		return results[i].ChangePct > results[j].ChangePct
	})

	log.Printf("Fetched kline data: success=%d, failed=%d, total=%d", successCount, failCount, len(results))

	// 3. 保存到缓存
	if len(results) > 0 {
		cacheRepo := db.NewRangeCacheRepository()
		if err := cacheRepo.SetCache(ctx, startDate, endDate, results); err != nil {
			log.Printf("Failed to save range cache: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save cache: " + err.Error()})
			return
		}
		log.Printf("Range cache saved successfully for %s - %s, %d stocks", startDate, endDate, len(results))
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "Range data refreshed successfully",
		"count":      len(results),
		"success":    successCount,
		"failed":     failCount,
		"start_date": startDate,
		"end_date":   endDate,
	})
}
