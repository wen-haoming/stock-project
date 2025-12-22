package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"server/db"
)

// Scheduler 定时任务调度器
type Scheduler struct {
	stockRepo *db.StockRepository
	running   bool
	stopChan  chan struct{}
	mu        sync.Mutex
}

// NewScheduler 创建调度器
func NewScheduler() *Scheduler {
	return &Scheduler{
		stockRepo: db.NewStockRepository(),
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

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			s.checkAndSync()
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

// syncAllData 同步所有股票数据
func (s *Scheduler) syncAllData() {
	log.Println("Starting data sync...")
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

	log.Printf("Data sync completed in %v", time.Since(start))
}

// syncAStockData 同步A股数据
func (s *Scheduler) syncAStockData(ctx context.Context) error {
	log.Println("Syncing A-share data...")

	stocks, err := fetchAStockData(1, 5000)
	if err != nil {
		return err
	}

	// 转换为数据库模型
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

// syncHKStockData 同步港股数据
func (s *Scheduler) syncHKStockData(ctx context.Context) error {
	log.Println("Syncing HK stock data...")

	stocks, err := fetchHKStockData(1, 3000)
	if err != nil {
		return err
	}

	// 转换为数据库模型
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
			Total int          `json:"total"`
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

// fetchHKStockData 获取港股数据
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
			Total int                      `json:"total"`
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
