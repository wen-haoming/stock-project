package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"server/db"
)

// Scheduler 定时任务调度器
type Scheduler struct {
	stockRepo  *db.StockRepository
	klineRepo  *db.KlineRepository
	running    bool
	stopChan   chan struct{}
	mu         sync.Mutex
	syncingHK  bool // 是否正在同步港股历史数据
}

// NewScheduler 创建调度器
func NewScheduler() *Scheduler {
	return &Scheduler{
		stockRepo: db.NewStockRepository(),
		klineRepo: db.NewKlineRepository(),
		stopChan:  make(chan struct{}),
	}
}

// Start 启动调度器
func (s *Scheduler) Start() {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return
	}
	s.running = true
	s.mu.Unlock()

	log.Println("Scheduler started")

	// 启动时先执行一次数据同步
	go s.syncAllData()

	// 启动港股历史数据同步（后台执行，不阻塞）
	go s.syncHKHistoryData()

	// 启动定时任务
	go s.run()
}

// Stop 停止调度器
func (s *Scheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return
	}

	close(s.stopChan)
	s.running = false
	log.Println("Scheduler stopped")
}

// run 运行定时任务
func (s *Scheduler) run() {
	// 每分钟检查一次
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	// 每天凌晨2点同步历史数据
	historyTicker := time.NewTicker(1 * time.Hour)
	defer historyTicker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			s.checkAndSync()
		case <-historyTicker.C:
			// 每天凌晨2点更新历史数据
			hour := time.Now().Hour()
			if hour == 2 {
				go s.syncHKHistoryDataIncremental()
			}
		}
	}
}

// checkAndSync 检查是否需要同步数据
func (s *Scheduler) checkAndSync() {
	// 只在交易日执行
	if !db.IsTradingDay() {
		return
	}

	// 交易时间内每5分钟同步一次
	if db.IsTradingTime() || db.IsHKTradingTime() {
		s.syncAllData()
	}
}

// syncAllData 同步所有股票实时数据
func (s *Scheduler) syncAllData() {
	log.Println("Starting realtime data sync...")
	start := time.Now()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	var wg sync.WaitGroup
	errChan := make(chan error, 2)

	// 同步A股数据
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := s.syncAStockData(ctx); err != nil {
			errChan <- fmt.Errorf("A股同步失败: %w", err)
		}
	}()

	// 同步港股数据
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := s.syncHKStockData(ctx); err != nil {
			errChan <- fmt.Errorf("港股同步失败: %w", err)
		}
	}()

	wg.Wait()
	close(errChan)

	for err := range errChan {
		log.Printf("Sync error: %v", err)
	}

	log.Printf("Realtime data sync completed in %v", time.Since(start))
}

// syncHKHistoryData 同步港股全部历史K线数据（首次启动时执行）
func (s *Scheduler) syncHKHistoryData() {
	s.mu.Lock()
	if s.syncingHK {
		s.mu.Unlock()
		log.Println("HK history sync already in progress, skipping...")
		return
	}
	s.syncingHK = true
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		s.syncingHK = false
		s.mu.Unlock()
	}()

	log.Println("Starting HK stock history sync (this may take a while)...")
	start := time.Now()

	ctx := context.Background()

	// 获取所有港股列表
	stockList, err := fetchAllHKStockList()
	if err != nil {
		log.Printf("Failed to fetch HK stock list: %v", err)
		return
	}

	log.Printf("Found %d HK stocks", len(stockList))

	// 先更新 stocks 表的基本信息（市值等）- 这个总是执行
	var dbStocks []db.StockData
	for _, stock := range stockList {
		dbStocks = append(dbStocks, db.StockData{
			Symbol:         stock.Symbol,
			Name:           stock.Name,
			Market:         "hk",
			LatestPrice:    stock.LatestPrice,
			TotalMarketCap: stock.TotalMarketCap,
			CircMarketCap:  stock.CircMarketCap,
			PERatio:        stock.PERatio,
			PBRatio:        stock.PBRatio,
			TurnoverRate:   stock.TurnoverRate,
			Industry:       stock.Industry,
		})
	}
	if err := s.stockRepo.UpsertStocks(ctx, dbStocks); err != nil {
		log.Printf("Failed to upsert HK stocks basic info: %v", err)
	} else {
		log.Printf("Updated %d HK stocks basic info to stocks table", len(dbStocks))
	}

	// 检查是否已有 K 线数据
	count, err := s.klineRepo.CountKlines(ctx)
	if err != nil {
		log.Printf("Failed to count klines: %v", err)
		return
	}

	if count > 100000 {
		log.Printf("HK kline data already exists (%d records), skipping kline sync", count)
		log.Printf("HK history sync completed in %v (basic info only)", time.Since(start))
		return
	}

	// 设置历史数据范围（最近2年）
	endDate := time.Now().Format("20060102")
	startDate := time.Now().AddDate(-2, 0, 0).Format("20060102")

	// 并发同步，限制并发数
	semaphore := make(chan struct{}, 20)
	var wg sync.WaitGroup
	var successCount, failCount int64
	var mu sync.Mutex

	for i, stock := range stockList {
		wg.Add(1)
		go func(idx int, symbol, name string) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			klines, err := fetchHKStockKline(symbol, startDate, endDate)
			if err != nil || len(klines) == 0 {
				mu.Lock()
				failCount++
				mu.Unlock()
				return
			}

			// 转换并保存
			var dbKlines []db.StockKline
			for _, k := range klines {
				dbKlines = append(dbKlines, db.StockKline{
					Symbol:       symbol,
					Date:         k.Date,
					Open:         k.Open,
					Close:        k.Close,
					High:         k.High,
					Low:          k.Low,
					Volume:       k.Volume,
					Turnover:     k.Turnover,
					Amplitude:    k.Amplitude,
					ChangePct:    k.ChangePct,
					ChangeAmt:    k.ChangeAmt,
					TurnoverRate: k.TurnoverRate,
				})
			}

			if err := s.klineRepo.UpsertKlines(ctx, dbKlines); err != nil {
				mu.Lock()
				failCount++
				mu.Unlock()
				return
			}

			mu.Lock()
			successCount++
			if successCount%100 == 0 {
				log.Printf("HK history sync progress: %d/%d stocks completed", successCount, len(stockList))
			}
			mu.Unlock()
		}(i, stock.Symbol, stock.Name)
	}

	wg.Wait()

	log.Printf("HK history sync completed in %v: %d success, %d failed", time.Since(start), successCount, failCount)
}

// syncHKHistoryDataIncremental 增量同步港股历史数据（每天执行）
func (s *Scheduler) syncHKHistoryDataIncremental() {
	s.mu.Lock()
	if s.syncingHK {
		s.mu.Unlock()
		return
	}
	s.syncingHK = true
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		s.syncingHK = false
		s.mu.Unlock()
	}()

	log.Println("Starting incremental HK history sync...")
	start := time.Now()

	ctx := context.Background()

	// 获取所有港股列表
	stockList, err := fetchAllHKStockList()
	if err != nil {
		log.Printf("Failed to fetch HK stock list: %v", err)
		return
	}

	// 只获取最近7天的数据
	endDate := time.Now().Format("20060102")
	startDate := time.Now().AddDate(0, 0, -7).Format("20060102")

	semaphore := make(chan struct{}, 30)
	var wg sync.WaitGroup
	var updateCount int64
	var mu sync.Mutex

	for _, stock := range stockList {
		wg.Add(1)
		go func(symbol string) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			klines, err := fetchHKStockKline(symbol, startDate, endDate)
			if err != nil || len(klines) == 0 {
				return
			}

			var dbKlines []db.StockKline
			for _, k := range klines {
				dbKlines = append(dbKlines, db.StockKline{
					Symbol:       symbol,
					Date:         k.Date,
					Open:         k.Open,
					Close:        k.Close,
					High:         k.High,
					Low:          k.Low,
					Volume:       k.Volume,
					Turnover:     k.Turnover,
					Amplitude:    k.Amplitude,
					ChangePct:    k.ChangePct,
					ChangeAmt:    k.ChangeAmt,
					TurnoverRate: k.TurnoverRate,
				})
			}

			if err := s.klineRepo.UpsertKlines(ctx, dbKlines); err == nil {
				mu.Lock()
				updateCount++
				mu.Unlock()
			}
		}(stock.Symbol)
	}

	wg.Wait()
	log.Printf("Incremental HK history sync completed in %v: %d stocks updated", time.Since(start), updateCount)
}

// HKStockBasic 港股基本信息
type HKStockBasic struct {
	Symbol         string
	Name           string
	LatestPrice    float64
	TotalMarketCap float64
	CircMarketCap  float64
	PERatio        float64
	PBRatio        float64
	TurnoverRate   float64
	Industry       string
}

// KlineData K线数据
type KlineData struct {
	Date         string
	Open         float64
	Close        float64
	High         float64
	Low          float64
	Volume       int64
	Turnover     float64
	Amplitude    float64
	ChangePct    float64
	ChangeAmt    float64
	TurnoverRate float64
}

// fetchAllHKStockList 获取所有港股列表
func fetchAllHKStockList() ([]HKStockBasic, error) {
	var allStocks []HKStockBasic
	seenSymbols := make(map[string]bool)

	page := 1
	for {
		url := "https://push2.eastmoney.com/api/qt/clist/get"
		req, _ := http.NewRequest("GET", url, nil)
		q := req.URL.Query()
		q.Add("pn", strconv.Itoa(page))
		q.Add("pz", "100")
		q.Add("po", "1")
		q.Add("ut", "bd1d9ddb04089700cf9c27f6f7426281")
		q.Add("fltt", "2")
		q.Add("invt", "2")
		q.Add("fid", "f3")
		q.Add("fs", "m:128")
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

		var response struct {
			Data struct {
				Total int                   `json:"total"`
				Diff  map[string]HKStockRaw `json:"diff"`
			} `json:"data"`
		}
		if err := json.Unmarshal(body, &response); err != nil {
			return nil, err
		}

		if response.Data.Diff == nil || len(response.Data.Diff) == 0 {
			break
		}

		diffLen := len(response.Data.Diff)
		for _, raw := range response.Data.Diff {
			if seenSymbols[raw.Symbol] {
				continue
			}
			seenSymbols[raw.Symbol] = true

			// 只保留正股（5位数，首位0）
			if len(raw.Symbol) != 5 || raw.Symbol[0] != '0' {
				continue
			}

			allStocks = append(allStocks, HKStockBasic{
				Symbol:         raw.Symbol,
				Name:           raw.Name,
				LatestPrice:    toFloat(raw.LatestPrice),
				TotalMarketCap: toFloat(raw.TotalMarketCap),
				CircMarketCap:  toFloat(raw.CircMarketCap),
				PERatio:        toFloat(raw.PERatio),
				PBRatio:        toFloat(raw.PBRatio),
				TurnoverRate:   toFloat(raw.TurnoverRate),
				Industry:       raw.Industry,
			})
		}

		if diffLen < 100 {
			break
		}
		page++
		if page > 200 {
			break
		}
	}

	return allStocks, nil
}

// fetchHKStockKline 获取港股K线数据
func fetchHKStockKline(symbol, startDate, endDate string) ([]KlineData, error) {
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

	var response struct {
		Data struct {
			Klines []string `json:"klines"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, err
	}

	var results []KlineData
	for _, item := range response.Data.Klines {
		fields := strings.Split(item, ",")
		if len(fields) < 11 {
			continue
		}

		volume, _ := strconv.ParseInt(fields[5], 10, 64)
		results = append(results, KlineData{
			Date:         fields[0],
			Open:         parseFloatSafe(fields[1]),
			Close:        parseFloatSafe(fields[2]),
			High:         parseFloatSafe(fields[3]),
			Low:          parseFloatSafe(fields[4]),
			Volume:       volume,
			Turnover:     parseFloatSafe(fields[6]),
			Amplitude:    parseFloatSafe(fields[7]),
			ChangePct:    parseFloatSafe(fields[8]),
			ChangeAmt:    parseFloatSafe(fields[9]),
			TurnoverRate: parseFloatSafe(fields[10]),
		})
	}

	return results, nil
}

func parseFloatSafe(s string) float64 {
	f, _ := strconv.ParseFloat(s, 64)
	return f
}

// syncAStockData 同步A股数据
func (s *Scheduler) syncAStockData(ctx context.Context) error {
	log.Println("Syncing A-share data...")

	stocks, err := fetchAStockData(1, 5000)
	if err != nil {
		return err
	}

	var dbStocks []db.StockData
	for _, stock := range stocks {
		dbStocks = append(dbStocks, db.StockData{
			Symbol:         stock.Symbol,
			Name:           stock.Name,
			Market:         stock.Market,
			LatestPrice:    stock.LatestPrice,
			Open:           stock.Open,
			Close:          stock.Close,
			High:           stock.High,
			Low:            stock.Low,
			ChangePct:      stock.ChangePct,
			ChangeAmt:      stock.ChangeAmt,
			Volume:         stock.Volume,
			Turnover:       stock.Turnover,
			TurnoverRate:   stock.TurnoverRate,
			Amplitude:      stock.Amplitude,
			TotalMarketCap: stock.TotalMarketCap,
			CircMarketCap:  stock.CircMarketCap,
			PERatio:        stock.PERatio,
			PBRatio:        stock.PBRatio,
			Industry:       stock.Industry,
		})
	}

	if err := s.stockRepo.UpsertStocks(ctx, dbStocks); err != nil {
		return err
	}

	log.Printf("Synced %d A-share stocks", len(dbStocks))
	return nil
}

// syncHKStockData 同步港股实时数据
func (s *Scheduler) syncHKStockData(ctx context.Context) error {
	log.Println("Syncing HK stock data...")

	stocks, err := fetchHKStockData(1, 3000)
	if err != nil {
		return err
	}

	var dbStocks []db.StockData
	for _, stock := range stocks {
		dbStocks = append(dbStocks, db.StockData{
			Symbol:         stock.Symbol,
			Name:           stock.Name,
			Market:         "hk",
			LatestPrice:    stock.LatestPrice,
			Open:           stock.Open,
			Close:          stock.Close,
			High:           stock.High,
			Low:            stock.Low,
			ChangePct:      stock.ChangePct,
			ChangeAmt:      stock.ChangeAmt,
			Volume:         stock.Volume,
			Turnover:       stock.Turnover,
			TurnoverRate:   stock.TurnoverRate,
			Amplitude:      stock.Amplitude,
			TotalMarketCap: stock.TotalMarketCap,
			CircMarketCap:  stock.CircMarketCap,
			PERatio:        stock.PERatio,
			PBRatio:        stock.PBRatio,
			Industry:       stock.Industry,
		})
	}

	if err := s.stockRepo.UpsertStocks(ctx, dbStocks); err != nil {
		return err
	}

	log.Printf("Synced %d HK stocks", len(dbStocks))
	return nil
}

// AStockRaw A股原始数据
type AStockRaw struct {
	Symbol         string      `json:"f12"`
	Name           string      `json:"f14"`
	MarketID       interface{} `json:"f13"`
	LatestPrice    interface{} `json:"f2"`
	ChangePct      interface{} `json:"f3"`
	ChangeAmt      interface{} `json:"f4"`
	Volume         interface{} `json:"f5"`
	Turnover       interface{} `json:"f6"`
	Amplitude      interface{} `json:"f7"`
	TurnoverRate   interface{} `json:"f8"`
	PERatio        interface{} `json:"f9"`
	High           interface{} `json:"f15"`
	Low            interface{} `json:"f16"`
	Open           interface{} `json:"f17"`
	Close          interface{} `json:"f18"`
	TotalMarketCap interface{} `json:"f20"`
	CircMarketCap  interface{} `json:"f21"`
	PBRatio        interface{} `json:"f23"`
	Industry       string      `json:"f100"`
}

// AStockData A股数据
type AStockData struct {
	Symbol         string
	Name           string
	Market         string
	LatestPrice    float64
	Open           float64
	Close          float64
	High           float64
	Low            float64
	ChangePct      float64
	ChangeAmt      float64
	Volume         int64
	Turnover       float64
	TurnoverRate   float64
	Amplitude      float64
	TotalMarketCap float64
	CircMarketCap  float64
	PERatio        float64
	PBRatio        float64
	Industry       string
}

// HKStockRaw 港股原始数据
type HKStockRaw struct {
	Symbol         string      `json:"f12"`
	Name           string      `json:"f14"`
	LatestPrice    interface{} `json:"f2"`
	ChangePct      interface{} `json:"f3"`
	ChangeAmt      interface{} `json:"f4"`
	Volume         interface{} `json:"f5"`
	Turnover       interface{} `json:"f6"`
	Amplitude      interface{} `json:"f7"`
	TurnoverRate   interface{} `json:"f8"`
	PERatio        interface{} `json:"f9"`
	High           interface{} `json:"f15"`
	Low            interface{} `json:"f16"`
	Open           interface{} `json:"f17"`
	Close          interface{} `json:"f18"`
	TotalMarketCap interface{} `json:"f20"`
	CircMarketCap  interface{} `json:"f21"`
	PBRatio        interface{} `json:"f23"`
	Industry       string      `json:"f100"`
}

func toFloat(v interface{}) float64 {
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

func toInt64(v interface{}) int64 {
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

// fetchAStockData 获取A股数据
func fetchAStockData(page, pageSize int) ([]AStockData, error) {
	url := "https://82.push2.eastmoney.com/api/qt/clist/get"

	req, _ := http.NewRequest("GET", url, nil)
	q := req.URL.Query()
	q.Add("pn", fmt.Sprintf("%d", page))
	q.Add("pz", fmt.Sprintf("%d", pageSize))
	q.Add("po", "1")
	q.Add("np", "1")
	q.Add("ut", "bd1d9ddb04089700cf9c27f6f7426281")
	q.Add("fltt", "2")
	q.Add("invt", "2")
	q.Add("fid", "f3")
	q.Add("fs", "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048")
	q.Add("fields", "f2,f3,f4,f5,f6,f7,f8,f9,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f100")
	req.URL.RawQuery = q.Encode()

	client := &http.Client{Timeout: time.Second * 30}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var response struct {
		Data struct {
			Total int         `json:"total"`
			Diff  []AStockRaw `json:"diff"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, err
	}

	var result []AStockData
	for _, raw := range response.Data.Diff {
		marketID := int(toFloat(raw.MarketID))
		market := "sz"
		if marketID == 1 {
			market = "sh"
		}

		result = append(result, AStockData{
			Symbol:         raw.Symbol,
			Name:           raw.Name,
			Market:         market,
			LatestPrice:    toFloat(raw.LatestPrice),
			Open:           toFloat(raw.Open),
			Close:          toFloat(raw.Close),
			High:           toFloat(raw.High),
			Low:            toFloat(raw.Low),
			ChangePct:      toFloat(raw.ChangePct),
			ChangeAmt:      toFloat(raw.ChangeAmt),
			Volume:         toInt64(raw.Volume),
			Turnover:       toFloat(raw.Turnover),
			TurnoverRate:   toFloat(raw.TurnoverRate),
			Amplitude:      toFloat(raw.Amplitude),
			TotalMarketCap: toFloat(raw.TotalMarketCap),
			CircMarketCap:  toFloat(raw.CircMarketCap),
			PERatio:        toFloat(raw.PERatio),
			PBRatio:        toFloat(raw.PBRatio),
			Industry:       raw.Industry,
		})
	}

	return result, nil
}

// fetchHKStockData 获取港股实时数据
func fetchHKStockData(page, pageSize int) ([]AStockData, error) {
	url := "https://push2.eastmoney.com/api/qt/clist/get"

	req, _ := http.NewRequest("GET", url, nil)
	q := req.URL.Query()
	q.Add("pn", fmt.Sprintf("%d", page))
	q.Add("pz", fmt.Sprintf("%d", pageSize))
	q.Add("po", "1")
	q.Add("ut", "bd1d9ddb04089700cf9c27f6f7426281")
	q.Add("fltt", "2")
	q.Add("invt", "2")
	q.Add("fid", "f3")
	q.Add("fs", "m:128")
	q.Add("fields", "f2,f3,f4,f5,f6,f7,f8,f9,f12,f14,f15,f16,f17,f18,f20,f21,f23,f100")
	req.URL.RawQuery = q.Encode()

	client := &http.Client{Timeout: time.Second * 30}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var response struct {
		Data struct {
			Total int                   `json:"total"`
			Diff  map[string]HKStockRaw `json:"diff"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, err
	}

	var result []AStockData
	for _, raw := range response.Data.Diff {
		result = append(result, AStockData{
			Symbol:         raw.Symbol,
			Name:           raw.Name,
			Market:         "hk",
			LatestPrice:    toFloat(raw.LatestPrice),
			Open:           toFloat(raw.Open),
			Close:          toFloat(raw.Close),
			High:           toFloat(raw.High),
			Low:            toFloat(raw.Low),
			ChangePct:      toFloat(raw.ChangePct),
			ChangeAmt:      toFloat(raw.ChangeAmt),
			Volume:         toInt64(raw.Volume),
			Turnover:       toFloat(raw.Turnover),
			TurnoverRate:   toFloat(raw.TurnoverRate),
			Amplitude:      toFloat(raw.Amplitude),
			TotalMarketCap: toFloat(raw.TotalMarketCap),
			CircMarketCap:  toFloat(raw.CircMarketCap),
			PERatio:        toFloat(raw.PERatio),
			PBRatio:        toFloat(raw.PBRatio),
			Industry:       raw.Industry,
		})
	}

	return result, nil
}

// ManualSync 手动触发同步
func (s *Scheduler) ManualSync() {
	go s.syncAllData()
}

// ManualSyncHistory 手动触发历史数据同步
func (s *Scheduler) ManualSyncHistory() {
	go s.syncHKHistoryData()
}

// ForceSyncHKData 强制重新同步所有港股数据（清除已有数据检查）
func (s *Scheduler) ForceSyncHKData() {
	s.mu.Lock()
	if s.syncingHK {
		s.mu.Unlock()
		log.Println("HK sync already in progress, skipping...")
		return
	}
	s.syncingHK = true
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		s.syncingHK = false
		s.mu.Unlock()
	}()

	log.Println("Starting FORCE HK stock sync (this may take a while)...")
	start := time.Now()

	ctx := context.Background()

	// 获取所有港股列表
	stockList, err := fetchAllHKStockList()
	if err != nil {
		log.Printf("Failed to fetch HK stock list: %v", err)
		return
	}

	log.Printf("Found %d HK stocks to sync", len(stockList))

	// 更新 stocks 表的基本信息（市值等）
	var dbStocks []db.StockData
	for _, stock := range stockList {
		dbStocks = append(dbStocks, db.StockData{
			Symbol:         stock.Symbol,
			Name:           stock.Name,
			Market:         "hk",
			LatestPrice:    stock.LatestPrice,
			TotalMarketCap: stock.TotalMarketCap,
			CircMarketCap:  stock.CircMarketCap,
			PERatio:        stock.PERatio,
			PBRatio:        stock.PBRatio,
			TurnoverRate:   stock.TurnoverRate,
			Industry:       stock.Industry,
		})
	}
	if err := s.stockRepo.UpsertStocks(ctx, dbStocks); err != nil {
		log.Printf("Failed to upsert HK stocks basic info: %v", err)
	} else {
		log.Printf("Updated %d HK stocks basic info", len(dbStocks))
	}

	// 设置历史数据范围（最近2年）
	endDate := time.Now().Format("20060102")
	startDate := time.Now().AddDate(-2, 0, 0).Format("20060102")

	// 并发同步 K 线，限制并发数
	semaphore := make(chan struct{}, 20)
	var wg sync.WaitGroup
	var successCount, failCount int64
	var mu sync.Mutex

	for i, stock := range stockList {
		wg.Add(1)
		go func(idx int, symbol, name string) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			klines, err := fetchHKStockKline(symbol, startDate, endDate)
			if err != nil || len(klines) == 0 {
				mu.Lock()
				failCount++
				mu.Unlock()
				return
			}

			var dbKlines []db.StockKline
			for _, k := range klines {
				dbKlines = append(dbKlines, db.StockKline{
					Symbol:       symbol,
					Date:         k.Date,
					Open:         k.Open,
					Close:        k.Close,
					High:         k.High,
					Low:          k.Low,
					Volume:       k.Volume,
					Turnover:     k.Turnover,
					Amplitude:    k.Amplitude,
					ChangePct:    k.ChangePct,
					ChangeAmt:    k.ChangeAmt,
					TurnoverRate: k.TurnoverRate,
				})
			}

			if err := s.klineRepo.UpsertKlines(ctx, dbKlines); err != nil {
				mu.Lock()
				failCount++
				mu.Unlock()
				return
			}

			mu.Lock()
			successCount++
			if successCount%100 == 0 {
				log.Printf("HK sync progress: %d/%d stocks completed", successCount, len(stockList))
			}
			mu.Unlock()
		}(i, stock.Symbol, stock.Name)
	}

	wg.Wait()
	log.Printf("Force HK sync completed in %v: %d success, %d failed", time.Since(start), successCount, failCount)
}
