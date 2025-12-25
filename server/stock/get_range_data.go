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
	return fetchStockKlineBySecid(secid, symbol, startDate, endDate)
}

// 获取单只A股的历史K线数据
func fetchAStockKline(symbol, startDate, endDate string) ([]HistData, error) {
	// A股 secid 格式:
	// 沪市(60开头): 1.股票代码
	// 深市(00/30开头): 0.股票代码
	var secid string
	if strings.HasPrefix(symbol, "6") {
		secid = fmt.Sprintf("1.%s", symbol)
	} else {
		secid = fmt.Sprintf("0.%s", symbol)
	}
	return fetchStockKlineBySecid(secid, symbol, startDate, endDate)
}

// fetchStockKlineBySecid 通用K线获取函数
func fetchStockKlineBySecid(secid, symbol, startDate, endDate string) ([]HistData, error) {

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

// 获取所有A股列表 (分页获取全部)
func fetchAllAStockList() ([]HKStockData, error) {
	var allStocks []HKStockData
	seenSymbols := make(map[string]bool)

	page := 1
	for {
		url := "https://push2.eastmoney.com/api/qt/clist/get"
		req, _ := http.NewRequest("GET", url, nil)
		q := req.URL.Query()
		q.Add("pn", strconv.Itoa(page))
		q.Add("pz", "100") // 每页100条
		q.Add("po", "1")
		q.Add("ut", "bd1d9ddb04089700cf9c27f6f7426281")
		q.Add("fltt", "2")
		q.Add("invt", "2")
		q.Add("fid", "f3")
		q.Add("fs", "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23") // A股全部（深市主板+创业板+沪市主板+科创板）
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

			// A股代码: 6位数字
			// 沪市主板: 60xxxx, 科创板: 688xxx
			// 深市主板: 00xxxx, 创业板: 30xxxx
			if len(raw.Symbol) != 6 {
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

		// 安全限制，最多获取100页（约1万只股票，A股约5000只）
		if page > 100 {
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
	market := c.DefaultQuery("market", "hk")                     // 市场: hk=港股, a=A股

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
	// 前端传参单位是「亿」，数据库存储单位是「元」，统一转换
	minCapValue := minCap * 100000000 // 亿转元
	maxCapValue := maxCap * 100000000

	ctx := context.Background()

	// 初始化变量
	var allResults []db.RangeStockData
	var fromDB bool
	var fromMemory bool

	// 缓存 key
	cacheKey := fmt.Sprintf("%s_%s_%s", market, startDate, endDate)

	// 1. 首先检查内存缓存（最快）
	memCache := db.GetRangeMemoryCache()
	if !forceRefresh {
		if cached, ok := memCache.Get(cacheKey); ok {
			if data, ok := cached.([]db.RangeStockData); ok {
				log.Printf("Memory cache hit for %s", cacheKey)
				allResults = data
				fromMemory = true
			}
		}
	}

	// 2. 检查数据库缓存（仅港股使用数据库缓存）
	if len(allResults) == 0 && db.IsConnected() && market == "hk" {
		cacheRepo := db.NewRangeCacheRepository()
		klineRepo := db.NewKlineRepository()

		// 尝试从数据库缓存获取
		if !forceRefresh {
			cache, err := cacheRepo.GetCache(ctx, startDate, endDate)
			if err == nil && cache != nil && cacheRepo.IsCacheValid(cache) {
				log.Printf("DB cache hit for %s - %s", startDate, endDate)
				allResults = cache.Data
				// 同时写入内存缓存
				memCache.Set(cacheKey, cache.Data, 30*time.Minute)
			} else if err != nil {
				log.Printf("Error getting cache: %v", err)
			}
		}

		// 3. 缓存未命中，尝试从数据库K线数据计算
		if len(allResults) == 0 {
			// 检查数据库是否有K线数据
			klineCount, err := klineRepo.CountKlines(ctx)
			if err != nil {
				log.Printf("Error counting klines: %v", err)
			} else if klineCount > 10000 {
				log.Printf("Calculating range from DB klines (%d records)", klineCount)
				allResults, fromDB = calculateRangeFromDB(ctx, klineRepo, startDateFmt, endDateFmt)
				// 计算成功后写入内存缓存
				if len(allResults) > 0 {
					memCache.Set(cacheKey, allResults, 30*time.Minute)
				}
			}
		}
	} else if market != "hk" {
		log.Printf("A-share market, skipping DB cache")
	} else if !db.IsConnected() {
		log.Printf("Database not connected, will fetch from API")
	}

	// 4. 数据库也没有，从API获取
	if len(allResults) == 0 {
		log.Printf("Cache miss, fetching from API for %s - %s (market: %s)", startDate, endDate, market)

		var stockList []HKStockData
		var err error

		// 根据市场选择获取股票列表的函数
		if market == "a" {
			stockList, err = fetchAllAStockList()
		} else {
			stockList, err = fetchAllHKStockList()
		}

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

		log.Printf("Fetched %d stocks from %s market", len(stockList), market)

		// 2. 并发获取每只股票的历史数据并计算涨幅
		var wg sync.WaitGroup
		var mu sync.Mutex
		results := make([]db.RangeStockData, 0)

		// 限制并发数
		semaphore := make(chan struct{}, 50)

		for _, stock := range stockList {
			wg.Add(1)
			go func(s HKStockData, mkt string) {
				defer wg.Done()
				semaphore <- struct{}{}
				defer func() { <-semaphore }()

				var klines []HistData
				var err error

				// 根据市场选择K线获取函数
				if mkt == "a" {
					klines, err = fetchAStockKline(s.Symbol, startDate, endDate)
				} else {
					klines, err = fetchHKStockKline(s.Symbol, startDate, endDate)
				}

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
			}(stock, market)
		}

		wg.Wait()

		// 按涨幅排序
		sort.Slice(results, func(i, j int) bool {
			return results[i].ChangePct > results[j].ChangePct
		})

		allResults = results

		// 写入内存缓存
		if len(allResults) > 0 {
			memCache.Set(cacheKey, allResults, 30*time.Minute)
		}
	}

	// 保存到数据库缓存（仅港股且来自API的数据）
	if len(allResults) > 0 && !fromDB && !fromMemory && db.IsConnected() && market == "hk" {
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
		"fromMemory":    fromMemory,
	})
}

// formatDate 转换日期格式 20240102 -> 2024-01-02
func formatDate(date string) string {
	if len(date) == 8 {
		return date[:4] + "-" + date[4:6] + "-" + date[6:]
	}
	return date
}

// calculateRangeFromDB 从数据库K线数据计算区间涨幅（使用聚合管道优化）
func calculateRangeFromDB(ctx context.Context, klineRepo *db.KlineRepository, startDate, endDate string) ([]db.RangeStockData, bool) {
	log.Printf("Calculating range from DB using aggregation: %s - %s", startDate, endDate)

	// 使用聚合管道一次性计算所有股票的区间涨幅
	rangeResults, err := klineRepo.CalculateRangeByAggregation(ctx, startDate, endDate)
	if err != nil {
		log.Printf("Aggregation error: %v", err)
		return nil, false
	}

	if len(rangeResults) == 0 {
		log.Printf("No range results from aggregation")
		return nil, false
	}

	log.Printf("Aggregation returned %d stocks", len(rangeResults))

	// 批量获取股票基本信息
	stockRepo := db.NewStockRepository()
	stockMap := make(map[string]*db.Stock)

	// 收集所有symbol
	symbols := make([]string, 0, len(rangeResults))
	for _, r := range rangeResults {
		symbols = append(symbols, r.Symbol)
	}

	// 批量查询股票信息
	stocks, err := stockRepo.GetStocksBySymbols(ctx, symbols)
	if err == nil {
		for i := range stocks {
			stockMap[stocks[i].Symbol] = &stocks[i]
		}
	}

	// 组装结果
	results := make([]db.RangeStockData, 0, len(rangeResults))
	for _, r := range rangeResults {
		changePct := (r.EndPrice - r.StartPrice) / r.StartPrice * 100

		rangeData := db.RangeStockData{
			Symbol:     r.Symbol,
			StartPrice: r.StartPrice,
			EndPrice:   r.EndPrice,
			ChangePct:  changePct,
		}

		// 补充股票基本信息
		if stockInfo, ok := stockMap[r.Symbol]; ok {
			rangeData.Name = stockInfo.Name
			rangeData.LatestPrice = stockInfo.LatestPrice
			rangeData.TotalMarketCap = stockInfo.TotalMarketCap
			rangeData.CircMarketCap = stockInfo.CircMarketCap
			rangeData.PERatio = stockInfo.PERatio
			rangeData.PBRatio = stockInfo.PBRatio
			rangeData.TurnoverRate = stockInfo.TurnoverRate
			rangeData.Industry = stockInfo.Industry
		}

		results = append(results, rangeData)
	}

	// 按涨幅排序
	sort.Slice(results, func(i, j int) bool {
		return results[i].ChangePct > results[j].ChangePct
	})

	log.Printf("Calculated %d stocks from DB (aggregation)", len(results))
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
