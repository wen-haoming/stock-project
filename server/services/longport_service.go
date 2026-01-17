package services

import (
	"context"
	"fmt"
	"log"
	"server/config"
	"server/repositories"
	"sync"
	"time"

	openapi "github.com/longportapp/openapi-go"
	lpconfig "github.com/longportapp/openapi-go/config"
	"github.com/longportapp/openapi-go/quote"
)

// LongPortService LongPort API 服务
type LongPortService struct {
	quoteCtx *quote.QuoteContext
	cache    *repositories.MemoryCache
	enabled  bool
	mu       sync.RWMutex
}

var (
	lpService     *LongPortService
	lpServiceOnce sync.Once
)

// GetLongPortService 获取 LongPort 服务单例
func GetLongPortService() *LongPortService {
	lpServiceOnce.Do(func() {
		lpService = newLongPortService()
	})
	return lpService
}

// newLongPortService 创建 LongPort 服务
func newLongPortService() *LongPortService {
	cfg := config.Get()
	svc := &LongPortService{
		cache:   repositories.GetMemoryCache(),
		enabled: cfg.LongPort.Enabled,
	}

	if !cfg.LongPort.Enabled {
		log.Println("[LongPort] API 未配置，将使用备用数据源")
		return svc
	}

	// 初始化 LongPort SDK
	lpCfg, err := lpconfig.New()
	if err != nil {
		log.Printf("[LongPort] 配置初始化失败: %v", err)
		svc.enabled = false
		return svc
	}

	quoteCtx, err := quote.NewFromCfg(lpCfg)
	if err != nil {
		log.Printf("[LongPort] Quote 上下文初始化失败: %v", err)
		svc.enabled = false
		return svc
	}

	svc.quoteCtx = quoteCtx
	log.Println("[LongPort] API 初始化成功")
	return svc
}

// IsEnabled 检查是否启用
func (s *LongPortService) IsEnabled() bool {
	return s.enabled && s.quoteCtx != nil
}

// Close 关闭连接
func (s *LongPortService) Close() {
	if s.quoteCtx != nil {
		s.quoteCtx.Close()
	}
}

// =============================================================================
// 行情数据接口
// =============================================================================

// QuoteData 行情数据
type QuoteData struct {
	Symbol       string    `json:"symbol"`
	Name         string    `json:"name"`
	LastDone     float64   `json:"lastDone"`     // 最新价
	Open         float64   `json:"open"`         // 开盘价
	High         float64   `json:"high"`         // 最高价
	Low          float64   `json:"low"`          // 最低价
	PrevClose    float64   `json:"prevClose"`    // 昨收
	Volume       int64     `json:"volume"`       // 成交量
	Turnover     float64   `json:"turnover"`     // 成交额
	ChangeRate   float64   `json:"changeRate"`   // 涨跌幅 %
	ChangeVal    float64   `json:"changeVal"`    // 涨跌额
	Timestamp    time.Time `json:"timestamp"`
	MarketCap    float64   `json:"marketCap"`    // 市值
	PeRatio      float64   `json:"peRatio"`      // 市盈率
	TurnoverRate float64   `json:"turnoverRate"` // 换手率
}

// GetQuote 获取实时行情
func (s *LongPortService) GetQuote(ctx context.Context, symbols []string) ([]QuoteData, error) {
	if !s.IsEnabled() {
		return nil, fmt.Errorf("LongPort API not enabled")
	}

	// 缓存检查
	cacheKey := fmt.Sprintf("lp_quote_%v", symbols)
	if cached, ok := s.cache.Get(cacheKey); ok {
		return cached.([]QuoteData), nil
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	quotes, err := s.quoteCtx.Quote(ctx, symbols)
	if err != nil {
		return nil, fmt.Errorf("获取行情失败: %w", err)
	}

	var result []QuoteData
	for _, q := range quotes {
		data := QuoteData{
			Symbol:    q.Symbol,
			LastDone:  q.LastDone.InexactFloat64(),
			Open:      q.Open.InexactFloat64(),
			High:      q.High.InexactFloat64(),
			Low:       q.Low.InexactFloat64(),
			PrevClose: q.PrevClose.InexactFloat64(),
			Volume:    q.Volume,
			Turnover:  q.Turnover.InexactFloat64(),
			Timestamp: time.Now(),
		}

		// 计算涨跌幅
		if data.PrevClose > 0 {
			data.ChangeVal = data.LastDone - data.PrevClose
			data.ChangeRate = (data.ChangeVal / data.PrevClose) * 100
		}

		result = append(result, data)
	}

	// 缓存 5 秒
	s.cache.Set(cacheKey, result, 5*time.Second)
	return result, nil
}

// GetStaticInfo 获取股票基本信息
func (s *LongPortService) GetStaticInfo(ctx context.Context, symbols []string) ([]LPStaticInfo, error) {
	if !s.IsEnabled() {
		return nil, fmt.Errorf("LongPort API not enabled")
	}

	cacheKey := fmt.Sprintf("lp_static_%v", symbols)
	if cached, ok := s.cache.Get(cacheKey); ok {
		return cached.([]LPStaticInfo), nil
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	infos, err := s.quoteCtx.StaticInfo(ctx, symbols)
	if err != nil {
		return nil, fmt.Errorf("获取股票信息失败: %w", err)
	}

	var result []LPStaticInfo
	for _, info := range infos {
		result = append(result, LPStaticInfo{
			Symbol:            info.Symbol,
			NameCN:            info.NameCn,
			NameEN:            info.NameEn,
			NameHK:            info.NameHk,
			Exchange:          info.Exchange,
			Currency:          info.Currency,
			LotSize:           int(info.LotSize),
			TotalShares:       info.TotalShares,
			CirculatingShares: info.CirculatingShares,
		})
	}

	// 缓存 1 小时
	s.cache.Set(cacheKey, result, time.Hour)
	return result, nil
}

// LPStaticInfo 股票基本信息
type LPStaticInfo struct {
	Symbol            string `json:"symbol"`
	NameCN            string `json:"nameCn"`
	NameEN            string `json:"nameEn"`
	NameHK            string `json:"nameHk"`
	Exchange          string `json:"exchange"`
	Currency          string `json:"currency"`
	LotSize           int    `json:"lotSize"`
	TotalShares       int64  `json:"totalShares"`
	CirculatingShares int64  `json:"circulatingShares"`
}

// =============================================================================
// K线数据接口
// =============================================================================

// LPKlineData K线数据
type LPKlineData struct {
	Timestamp int64   `json:"timestamp"`
	Open      float64 `json:"open"`
	High      float64 `json:"high"`
	Low       float64 `json:"low"`
	Close     float64 `json:"close"`
	Volume    int64   `json:"volume"`
	Turnover  float64 `json:"turnover"`
}

// GetCandlesticks 获取K线数据
func (s *LongPortService) GetCandlesticks(ctx context.Context, symbol string, period quote.Period, count int32, adjust quote.AdjustType) ([]LPKlineData, error) {
	if !s.IsEnabled() {
		return nil, fmt.Errorf("LongPort API not enabled")
	}

	cacheKey := fmt.Sprintf("lp_kline_%s_%v_%d_%v", symbol, period, count, adjust)
	if cached, ok := s.cache.Get(cacheKey); ok {
		return cached.([]LPKlineData), nil
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	candles, err := s.quoteCtx.Candlesticks(ctx, symbol, period, count, adjust)
	if err != nil {
		return nil, fmt.Errorf("获取K线失败: %w", err)
	}

	var result []LPKlineData
	for _, c := range candles {
		result = append(result, LPKlineData{
			Timestamp: c.Timestamp,
			Open:      c.Open.InexactFloat64(),
			High:      c.High.InexactFloat64(),
			Low:       c.Low.InexactFloat64(),
			Close:     c.Close.InexactFloat64(),
			Volume:    c.Volume,
			Turnover:  c.Turnover.InexactFloat64(),
		})
	}

	// 缓存时间根据周期调整
	cacheDuration := 30 * time.Second
	if period >= quote.PeriodDay {
		cacheDuration = 5 * time.Minute
	}
	s.cache.Set(cacheKey, result, cacheDuration)

	return result, nil
}

// GetHistoryCandlesticksByDate 按日期范围获取K线
func (s *LongPortService) GetHistoryCandlesticksByDate(ctx context.Context, symbol string, period quote.Period, adjust quote.AdjustType, startDate, endDate *time.Time) ([]LPKlineData, error) {
	if !s.IsEnabled() {
		return nil, fmt.Errorf("LongPort API not enabled")
	}

	cacheKey := fmt.Sprintf("lp_histkline_%s_%v_%v_%v_%v", symbol, period, adjust, startDate, endDate)
	if cached, ok := s.cache.Get(cacheKey); ok {
		return cached.([]LPKlineData), nil
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	candles, err := s.quoteCtx.HistoryCandlesticksByDate(ctx, symbol, period, adjust, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("获取历史K线失败: %w", err)
	}

	var result []LPKlineData
	for _, c := range candles {
		result = append(result, LPKlineData{
			Timestamp: c.Timestamp,
			Open:      c.Open.InexactFloat64(),
			High:      c.High.InexactFloat64(),
			Low:       c.Low.InexactFloat64(),
			Close:     c.Close.InexactFloat64(),
			Volume:    c.Volume,
			Turnover:  c.Turnover.InexactFloat64(),
		})
	}

	// 历史数据缓存久一些
	s.cache.Set(cacheKey, result, 10*time.Minute)
	return result, nil
}

// =============================================================================
// 市场数据接口
// =============================================================================

// LPMarketSession 市场交易时段
type LPMarketSession struct {
	Market   string              `json:"market"`
	Sessions []LPTradingSession `json:"sessions"`
}

// LPTradingSession 交易时段
type LPTradingSession struct {
	Begin int `json:"begin"` // 开始时间 (分钟数)
	End   int `json:"end"`   // 结束时间 (分钟数)
}

// GetMarketTradingSession 获取市场交易时段
func (s *LongPortService) GetMarketTradingSession(ctx context.Context) ([]LPMarketSession, error) {
	if !s.IsEnabled() {
		return nil, fmt.Errorf("LongPort API not enabled")
	}

	cacheKey := "lp_market_session"
	if cached, ok := s.cache.Get(cacheKey); ok {
		return cached.([]LPMarketSession), nil
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	sessions, err := s.quoteCtx.TradingSession(ctx)
	if err != nil {
		return nil, fmt.Errorf("获取交易时段失败: %w", err)
	}

	var result []LPMarketSession
	for _, sess := range sessions {
		ms := LPMarketSession{
			Market: string(sess.Market),
		}
		for _, ts := range sess.TradeSession {
			ms.Sessions = append(ms.Sessions, LPTradingSession{
				Begin: int(ts.BegTime),
				End:   int(ts.EndTime),
			})
		}
		result = append(result, ms)
	}

	s.cache.Set(cacheKey, result, time.Hour)
	return result, nil
}

// GetTradingDays 获取交易日
func (s *LongPortService) GetTradingDays(ctx context.Context, market openapi.Market, begin, end time.Time) ([]time.Time, error) {
	if !s.IsEnabled() {
		return nil, fmt.Errorf("LongPort API not enabled")
	}

	cacheKey := fmt.Sprintf("lp_trading_days_%v_%v_%v", market, begin.Format("20060102"), end.Format("20060102"))
	if cached, ok := s.cache.Get(cacheKey); ok {
		return cached.([]time.Time), nil
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	resp, err := s.quoteCtx.TradingDays(ctx, market, &begin, &end)
	if err != nil {
		return nil, fmt.Errorf("获取交易日失败: %w", err)
	}

	result := resp.TradeDay
	s.cache.Set(cacheKey, result, time.Hour)
	return result, nil
}

// =============================================================================
// 深度行情接口
// =============================================================================

// LPDepthData 深度行情
type LPDepthData struct {
	Symbol string         `json:"symbol"`
	Ask    []LPPriceLevel `json:"ask"`
	Bid    []LPPriceLevel `json:"bid"`
}

// LPPriceLevel 价格档位
type LPPriceLevel struct {
	Position int     `json:"position"`
	Price    float64 `json:"price"`
	Volume   int64   `json:"volume"`
	OrderNum int64   `json:"orderNum"`
}

// GetDepth 获取深度行情
func (s *LongPortService) GetDepth(ctx context.Context, symbol string) (*LPDepthData, error) {
	if !s.IsEnabled() {
		return nil, fmt.Errorf("LongPort API not enabled")
	}

	cacheKey := fmt.Sprintf("lp_depth_%s", symbol)
	if cached, ok := s.cache.Get(cacheKey); ok {
		return cached.(*LPDepthData), nil
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	depth, err := s.quoteCtx.Depth(ctx, symbol)
	if err != nil {
		return nil, fmt.Errorf("获取深度行情失败: %w", err)
	}

	result := &LPDepthData{
		Symbol: depth.Symbol,
	}
	for _, ask := range depth.Ask {
		result.Ask = append(result.Ask, LPPriceLevel{
			Position: int(ask.Position),
			Price:    ask.Price.InexactFloat64(),
			Volume:   ask.Volume,
			OrderNum: ask.OrderNum,
		})
	}
	for _, bid := range depth.Bid {
		result.Bid = append(result.Bid, LPPriceLevel{
			Position: int(bid.Position),
			Price:    bid.Price.InexactFloat64(),
			Volume:   bid.Volume,
			OrderNum: bid.OrderNum,
		})
	}

	s.cache.Set(cacheKey, result, 3*time.Second)
	return result, nil
}

// =============================================================================
// 分时数据接口
// =============================================================================

// LPIntradayLine 分时数据
type LPIntradayLine struct {
	Time     string  `json:"time"`
	Price    float64 `json:"price"`
	Volume   int64   `json:"volume"`
	Turnover float64 `json:"turnover"`
	AvgPrice float64 `json:"avgPrice"`
}

// GetIntraday 获取分时数据
func (s *LongPortService) GetIntraday(ctx context.Context, symbol string) ([]LPIntradayLine, error) {
	if !s.IsEnabled() {
		return nil, fmt.Errorf("LongPort API not enabled")
	}

	cacheKey := fmt.Sprintf("lp_intraday_%s", symbol)
	if cached, ok := s.cache.Get(cacheKey); ok {
		return cached.([]LPIntradayLine), nil
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	lines, err := s.quoteCtx.Intraday(ctx, symbol)
	if err != nil {
		return nil, fmt.Errorf("获取分时数据失败: %w", err)
	}

	var result []LPIntradayLine
	for _, line := range lines {
		result = append(result, LPIntradayLine{
			Time:     time.Unix(line.Timestamp, 0).Format("15:04"),
			Price:    line.Price.InexactFloat64(),
			Volume:   line.Volume,
			Turnover: line.Turnover.InexactFloat64(),
			AvgPrice: line.AvgPrice.InexactFloat64(),
		})
	}

	s.cache.Set(cacheKey, result, 10*time.Second)
	return result, nil
}

// =============================================================================
// 行情订阅接口 (WebSocket)
// =============================================================================

// SubscribeQuote 订阅实时行情
func (s *LongPortService) SubscribeQuote(ctx context.Context, symbols []string, subTypes []quote.SubType, handler func(q *quote.PushQuote)) error {
	if !s.IsEnabled() {
		return fmt.Errorf("LongPort API not enabled")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// 设置回调
	s.quoteCtx.OnQuote(handler)

	// 订阅
	err := s.quoteCtx.Subscribe(ctx, symbols, subTypes, true)
	if err != nil {
		return fmt.Errorf("订阅失败: %w", err)
	}

	return nil
}

// UnsubscribeQuote 取消订阅
func (s *LongPortService) UnsubscribeQuote(ctx context.Context, symbols []string, subTypes []quote.SubType) error {
	if !s.IsEnabled() {
		return fmt.Errorf("LongPort API not enabled")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	err := s.quoteCtx.Unsubscribe(ctx, false, symbols, subTypes)
	if err != nil {
		return fmt.Errorf("取消订阅失败: %w", err)
	}

	return nil
}

// =============================================================================
// 资金流向接口
// =============================================================================

// LPCapitalFlow 资金流向
type LPCapitalFlow struct {
	Timestamp int64   `json:"timestamp"`
	Inflow    float64 `json:"inflow"`
}

// GetCapitalFlow 获取资金流向
func (s *LongPortService) GetCapitalFlow(ctx context.Context, symbol string) ([]LPCapitalFlow, error) {
	if !s.IsEnabled() {
		return nil, fmt.Errorf("LongPort API not enabled")
	}

	cacheKey := fmt.Sprintf("lp_capital_flow_%s", symbol)
	if cached, ok := s.cache.Get(cacheKey); ok {
		return cached.([]LPCapitalFlow), nil
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	flows, err := s.quoteCtx.CapitalFlow(ctx, symbol)
	if err != nil {
		return nil, fmt.Errorf("获取资金流向失败: %w", err)
	}

	var result []LPCapitalFlow
	for _, flow := range flows {
		result = append(result, LPCapitalFlow{
			Timestamp: flow.Timestamp,
			Inflow:    flow.Inflow.InexactFloat64(),
		})
	}

	s.cache.Set(cacheKey, result, 30*time.Second)
	return result, nil
}

// LPCapitalDistribution 资金分布
type LPCapitalDistribution struct {
	Large  float64 `json:"large"`  // 特大单
	Medium float64 `json:"medium"` // 中单
	Small  float64 `json:"small"`  // 小单
}

// GetCapitalDistribution 获取资金分布
func (s *LongPortService) GetCapitalDistribution(ctx context.Context, symbol string) (*LPCapitalDistribution, error) {
	if !s.IsEnabled() {
		return nil, fmt.Errorf("LongPort API not enabled")
	}

	cacheKey := fmt.Sprintf("lp_capital_dist_%s", symbol)
	if cached, ok := s.cache.Get(cacheKey); ok {
		return cached.(*LPCapitalDistribution), nil
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	dist, err := s.quoteCtx.CapitalDistribution(ctx, symbol)
	if err != nil {
		return nil, fmt.Errorf("获取资金分布失败: %w", err)
	}

	result := &LPCapitalDistribution{
		Large:  dist.CapitalIn.Large.InexactFloat64(),
		Medium: dist.CapitalIn.Medium.InexactFloat64(),
		Small:  dist.CapitalIn.Small.InexactFloat64(),
	}

	s.cache.Set(cacheKey, result, 30*time.Second)
	return result, nil
}

// =============================================================================
// 辅助方法
// =============================================================================

// ConvertSymbol 转换股票代码格式
// 输入: 600519 (A股), 00700 (港股), AAPL (美股)
// 输出: 600519.SH, 00700.HK, AAPL.US
func ConvertSymbol(symbol, market string) string {
	switch market {
	case "a", "A", "cn", "CN":
		// A股: 6开头上海，其他深圳
		if len(symbol) == 6 {
			if symbol[0] == '6' || symbol[0] == '9' {
				return symbol + ".SH"
			}
			return symbol + ".SZ"
		}
	case "hk", "HK":
		return symbol + ".HK"
	case "us", "US":
		return symbol + ".US"
	}
	return symbol
}

// ParseSymbol 解析股票代码
// 输入: 600519.SH, 00700.HK, AAPL.US
// 输出: symbol, market
func ParseSymbol(fullSymbol string) (symbol, market string) {
	if len(fullSymbol) < 3 {
		return fullSymbol, ""
	}

	// 查找最后一个点
	for i := len(fullSymbol) - 1; i >= 0; i-- {
		if fullSymbol[i] == '.' {
			symbol = fullSymbol[:i]
			suffix := fullSymbol[i+1:]
			switch suffix {
			case "SH", "SZ":
				market = "a"
			case "HK":
				market = "hk"
			case "US":
				market = "us"
			default:
				market = suffix
			}
			return
		}
	}
	return fullSymbol, ""
}

// GetPeriodFromString 从字符串获取K线周期
func GetPeriodFromString(period string) quote.Period {
	switch period {
	case "1m", "1min":
		return quote.PeriodOneMinute
	case "5m", "5min":
		return quote.PeriodFiveMinute
	case "15m", "15min":
		return quote.PeriodFifteenMinute
	case "30m", "30min":
		return quote.PeriodThirtyMinute
	case "60m", "60min", "1h":
		return quote.PeriodSixtyMinute
	case "day", "daily", "1d":
		return quote.PeriodDay
	case "week", "weekly", "1w":
		return quote.PeriodWeek
	case "month", "monthly", "1M":
		return quote.PeriodMonth
	case "year", "yearly", "1y":
		return quote.PeriodYear
	default:
		return quote.PeriodDay
	}
}

// GetAdjustTypeFromString 从字符串获取复权类型
func GetAdjustTypeFromString(adjust string) quote.AdjustType {
	switch adjust {
	case "qfq", "forward":
		return quote.AdjustTypeForward
	case "hfq", "backward", "none", "":
		return quote.AdjustTypeNo
	default:
		return quote.AdjustTypeNo
	}
}

// GetMarketFromString 从字符串获取市场类型
func GetMarketFromString(market string) openapi.Market {
	switch market {
	case "us", "US":
		return openapi.MarketUS
	case "hk", "HK":
		return openapi.MarketHK
	case "a", "A", "cn", "CN", "sh", "SH", "sz", "SZ":
		return openapi.MarketCN
	default:
		return openapi.MarketCN
	}
}
