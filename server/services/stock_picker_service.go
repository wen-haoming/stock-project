package services

import (
	"context"
	"log"
	"math"
	"server/models"
	"server/repositories"
	"sort"
	"strings"
	"time"
)

// SignalType 异动信号类型
type SignalType string

const (
	SignalAll             SignalType = "all"              // 全部
	SignalLimitUp         SignalType = "limit_up"         // 涨停板
	SignalContinuousLimit SignalType = "continuous_limit" // 连板股
	SignalFirstLimit      SignalType = "first_limit"      // 首板股
	SignalVolumeBreakout  SignalType = "volume_breakout"  // 放量突破
	SignalBottomVolume    SignalType = "bottom_volume"    // 底部放量
	SignalGoldenCross     SignalType = "golden_cross"     // 金叉信号
	SignalMABull          SignalType = "ma_bull"          // 均线多头
	SignalVolumeThenFlat  SignalType = "volume_then_flat" // 放量后走平
)

// MarketCapRange 市值范围
type MarketCapRange string

const (
	MarketCapAll   MarketCapRange = "all"   // 全部
	MarketCapMicro MarketCapRange = "micro" // 微盘 <50亿
	MarketCapSmall MarketCapRange = "small" // 小盘 50-200亿
	MarketCapMid   MarketCapRange = "mid"   // 中盘 200-500亿
	MarketCapLarge MarketCapRange = "large" // 大盘 500-2000亿
	MarketCapMega  MarketCapRange = "mega"  // 超大盘 >2000亿
)

// StockPickerQuery 选股查询参数
type StockPickerQuery struct {
	Market    string         `form:"market"`    // a 或 hk
	Theme     string         `form:"theme"`     // 题材/行业
	Signal    SignalType     `form:"signal"`    // 异动信号
	MarketCap MarketCapRange `form:"marketCap"` // 市值范围
	Limit     int            `form:"limit"`     // 返回数量限制
	Offset    int            `form:"offset"`    // 偏移量
}

// StockPickerResult 选股结果
type StockPickerResult struct {
	Symbol         string     `json:"symbol"`
	Name           string     `json:"name"`
	Market         string     `json:"market"`
	LatestPrice    float64    `json:"latestPrice"`
	ChangePct      float64    `json:"changePct"`
	TotalMarketCap float64    `json:"totalMarketCap"` // 亿元
	Industry       string     `json:"industry"`
	Signal         SignalType `json:"signal"`         // 检测到的信号
	SignalStrength float64    `json:"signalStrength"` // 信号强度 0-100
	Volume         int64      `json:"volume"`
	TurnoverRate   float64    `json:"turnoverRate"`
	// 技术指标
	MA5      float64 `json:"ma5,omitempty"`
	MA10     float64 `json:"ma10,omitempty"`
	MA20     float64 `json:"ma20,omitempty"`
	AvgVol5  int64   `json:"avgVol5,omitempty"`  // 5日均量
	AvgVol20 int64   `json:"avgVol20,omitempty"` // 20日均量
}

// StockPickerService 行情选股服务
type StockPickerService struct {
	stockRepo *repositories.StockRepository
	klineRepo *repositories.KlineRepository
}

// NewStockPickerService 创建选股服务
func NewStockPickerService() *StockPickerService {
	return &StockPickerService{
		stockRepo: repositories.NewStockRepository(),
		klineRepo: repositories.NewKlineRepository(),
	}
}

// GetStocks 获取选股结果
func (s *StockPickerService) GetStocks(ctx context.Context, query StockPickerQuery) ([]StockPickerResult, int, error) {
	// 设置默认值
	if query.Market == "" {
		query.Market = "a"
	}
	if query.Limit <= 0 {
		query.Limit = 100
	}
	if query.Limit > 500 {
		query.Limit = 500
	}

	// 1. 获取股票列表（从内存缓存）
	stockService := NewStockService()
	stocks, err := stockService.GetStocksByMarketWithCache(ctx, query.Market)
	if err != nil {
		return nil, 0, err
	}
	
	// 限制数量
	if len(stocks) > 5000 {
		stocks = stocks[:5000]
	}

	// 2. 获取K线数据用于计算信号
	endDate := time.Now().Format("2006-01-02")
	startDate := time.Now().AddDate(0, 0, -60).Format("2006-01-02") // 获取60天数据

	// 3. 并行处理每只股票
	results := make([]StockPickerResult, 0)
	
	for _, stock := range stocks {
		// 港股过滤涡轮、牛熊证等衍生品
		if query.Market == "hk" && s.isDerivative(stock.Name) {
			continue
		}

		// 市值筛选
		if !s.matchMarketCap(stock.TotalMarketCap, query.MarketCap) {
			continue
		}

		// 行业/题材筛选
		if query.Theme != "" && query.Theme != "all" && stock.Industry != query.Theme {
			continue
		}

		// 获取K线数据计算信号（从内存缓存）
		klineService := NewKlineService()
		klines, err := klineService.GetKlinesBySymbol(ctx, stock.Symbol, query.Market, startDate, endDate)
		if err != nil || len(klines) < 5 {
			continue
		}

		// 计算信号
		signal, strength := s.detectSignal(stock, klines, query.Signal)
		if query.Signal != SignalAll && signal == SignalAll {
			continue // 未检测到指定信号
		}

		// 计算技术指标
		ma5, ma10, ma20 := s.calculateMA(klines)
		avgVol5, avgVol20 := s.calculateAvgVolume(klines)

		result := StockPickerResult{
			Symbol:         stock.Symbol,
			Name:           stock.Name,
			Market:         stock.Market,
			LatestPrice:    stock.LatestPrice,
			ChangePct:      stock.ChangePct,
			TotalMarketCap: stock.TotalMarketCap / 100000000, // 转换为亿元
			Industry:       stock.Industry,
			Signal:         signal,
			SignalStrength: strength,
			Volume:         stock.Volume,
			TurnoverRate:   stock.TurnoverRate,
			MA5:            ma5,
			MA10:           ma10,
			MA20:           ma20,
			AvgVol5:        avgVol5,
			AvgVol20:       avgVol20,
		}
		results = append(results, result)
	}

	// 4. 按信号强度排序
	sort.Slice(results, func(i, j int) bool {
		return results[i].SignalStrength > results[j].SignalStrength
	})

	total := len(results)

	// 5. 分页
	if query.Offset >= len(results) {
		return []StockPickerResult{}, total, nil
	}
	end := query.Offset + query.Limit
	if end > len(results) {
		end = len(results)
	}

	return results[query.Offset:end], total, nil
}

// matchMarketCap 匹配市值范围
func (s *StockPickerService) matchMarketCap(marketCap float64, capRange MarketCapRange) bool {
	// 转换为亿元
	capInYi := marketCap / 100000000

	switch capRange {
	case MarketCapMicro:
		return capInYi < 50
	case MarketCapSmall:
		return capInYi >= 50 && capInYi < 200
	case MarketCapMid:
		return capInYi >= 200 && capInYi < 500
	case MarketCapLarge:
		return capInYi >= 500 && capInYi < 2000
	case MarketCapMega:
		return capInYi >= 2000
	default:
		return true
	}
}

// isDerivative 判断是否为港股衍生品（涡轮、牛熊证等）
func (s *StockPickerService) isDerivative(name string) bool {
	// 涡轮（窝轮）关键词：购、沽、认购、认沽
	// 牛熊证关键词：牛、熊
	// 其他衍生品关键词
	derivativeKeywords := []string{
		"购", "沽", "牛", "熊",
		"认购", "认沽", "权证",
		"CALL", "PUT",
	}
	
	for _, keyword := range derivativeKeywords {
		if strings.Contains(name, keyword) {
			return true
		}
	}
	return false
}

// detectSignal 检测异动信号
func (s *StockPickerService) detectSignal(stock models.StockData, klines []models.StockKline, targetSignal SignalType) (SignalType, float64) {
	if len(klines) < 5 {
		return SignalAll, 0
	}

	// 根据目标信号检测
	switch targetSignal {
	case SignalLimitUp:
		if signal, strength := s.detectLimitUp(stock, klines); signal != SignalAll {
			return signal, strength
		}
	case SignalContinuousLimit:
		if signal, strength := s.detectContinuousLimit(klines); signal != SignalAll {
			return signal, strength
		}
	case SignalFirstLimit:
		if signal, strength := s.detectFirstLimit(klines); signal != SignalAll {
			return signal, strength
		}
	case SignalVolumeBreakout:
		if signal, strength := s.detectVolumeBreakout(klines); signal != SignalAll {
			return signal, strength
		}
	case SignalBottomVolume:
		if signal, strength := s.detectBottomVolume(klines); signal != SignalAll {
			return signal, strength
		}
	case SignalGoldenCross:
		if signal, strength := s.detectGoldenCross(klines); signal != SignalAll {
			return signal, strength
		}
	case SignalMABull:
		if signal, strength := s.detectMABull(klines); signal != SignalAll {
			return signal, strength
		}
	case SignalVolumeThenFlat:
		if signal, strength := s.detectVolumeThenFlat(klines); signal != SignalAll {
			return signal, strength
		}
	case SignalAll:
		// 检测所有信号，返回最强的
		signals := []struct {
			signal   SignalType
			strength float64
		}{
			{SignalLimitUp, 0},
			{SignalContinuousLimit, 0},
			{SignalVolumeBreakout, 0},
			{SignalBottomVolume, 0},
			{SignalGoldenCross, 0},
			{SignalMABull, 0},
			{SignalVolumeThenFlat, 0},
		}

		// 检测涨停
		if sig, str := s.detectLimitUp(stock, klines); sig != SignalAll {
			signals[0].strength = str
		}
		// 检测连板
		if sig, str := s.detectContinuousLimit(klines); sig != SignalAll {
			signals[1].strength = str
		}
		// 检测放量突破
		if sig, str := s.detectVolumeBreakout(klines); sig != SignalAll {
			signals[2].strength = str
		}
		// 检测底部放量
		if sig, str := s.detectBottomVolume(klines); sig != SignalAll {
			signals[3].strength = str
		}
		// 检测金叉
		if sig, str := s.detectGoldenCross(klines); sig != SignalAll {
			signals[4].strength = str
		}
		// 检测均线多头
		if sig, str := s.detectMABull(klines); sig != SignalAll {
			signals[5].strength = str
		}
		// 检测放量后走平
		if sig, str := s.detectVolumeThenFlat(klines); sig != SignalAll {
			signals[6].strength = str
		}

		// 返回最强信号
		maxIdx := 0
		for i, s := range signals {
			if s.strength > signals[maxIdx].strength {
				maxIdx = i
			}
		}
		if signals[maxIdx].strength > 0 {
			signalTypes := []SignalType{SignalLimitUp, SignalContinuousLimit, SignalVolumeBreakout, SignalBottomVolume, SignalGoldenCross, SignalMABull, SignalVolumeThenFlat}
			return signalTypes[maxIdx], signals[maxIdx].strength
		}
	}

	return SignalAll, 0
}

// detectLimitUp 检测涨停板
// A股涨停：涨幅 >= 9.9%（考虑四舍五入）
// 港股无涨跌停限制，但可以检测大涨 >= 10%
func (s *StockPickerService) detectLimitUp(stock models.StockData, klines []models.StockKline) (SignalType, float64) {
	if len(klines) == 0 {
		return SignalAll, 0
	}

	latest := klines[len(klines)-1]
	
	// A股涨停判断
	if stock.Market == "a" {
		// ST股票涨停是5%，普通股票是10%
		limitPct := 9.9
		if latest.ChangePct >= limitPct {
			// 计算强度：封板时间越早、成交量越小越强
			strength := 80.0
			// 涨幅越接近10%越强
			if latest.ChangePct >= 9.95 {
				strength += 10
			}
			// 换手率低说明筹码锁定好
			if latest.TurnoverRate < 5 {
				strength += 10
			}
			return SignalLimitUp, math.Min(strength, 100)
		}
	} else {
		// 港股：涨幅 >= 10% 视为强势
		if latest.ChangePct >= 10 {
			strength := 70.0 + latest.ChangePct - 10
			return SignalLimitUp, math.Min(strength, 100)
		}
	}

	return SignalAll, 0
}

// detectContinuousLimit 检测连板股
// 连续2天及以上涨停
func (s *StockPickerService) detectContinuousLimit(klines []models.StockKline) (SignalType, float64) {
	if len(klines) < 2 {
		return SignalAll, 0
	}

	// 从最新一天往前检查连板数
	limitDays := 0
	for i := len(klines) - 1; i >= 0 && i >= len(klines)-10; i-- {
		if klines[i].ChangePct >= 9.9 {
			limitDays++
		} else {
			break
		}
	}

	if limitDays >= 2 {
		// 连板天数越多，强度越高
		strength := 60.0 + float64(limitDays)*15
		return SignalContinuousLimit, math.Min(strength, 100)
	}

	return SignalAll, 0
}

// detectFirstLimit 检测首板股
// 今天涨停，但前一天未涨停
func (s *StockPickerService) detectFirstLimit(klines []models.StockKline) (SignalType, float64) {
	if len(klines) < 2 {
		return SignalAll, 0
	}

	latest := klines[len(klines)-1]
	prev := klines[len(klines)-2]

	// 今天涨停，昨天未涨停
	if latest.ChangePct >= 9.9 && prev.ChangePct < 9.9 {
		strength := 75.0
		// 放量涨停更强
		if len(klines) >= 5 {
			avgVol := s.calcAvgVolume(klines[len(klines)-6 : len(klines)-1])
			if latest.Volume > int64(float64(avgVol)*2) {
				strength += 15
			}
		}
		return SignalFirstLimit, math.Min(strength, 100)
	}

	return SignalAll, 0
}

// detectVolumeBreakout 检测放量突破
// 条件：
// 1. 今日成交量 > 5日均量 * 2
// 2. 今日收盘价突破20日最高价
// 3. 今日涨幅 > 3%
func (s *StockPickerService) detectVolumeBreakout(klines []models.StockKline) (SignalType, float64) {
	if len(klines) < 20 {
		return SignalAll, 0
	}

	latest := klines[len(klines)-1]
	
	// 计算5日均量
	avgVol5 := s.calcAvgVolume(klines[len(klines)-6 : len(klines)-1])
	
	// 计算20日最高价（不含今天）
	high20 := 0.0
	for i := len(klines) - 21; i < len(klines)-1; i++ {
		if i >= 0 && klines[i].High > high20 {
			high20 = klines[i].High
		}
	}

	// 判断条件
	volumeRatio := float64(latest.Volume) / float64(avgVol5)
	isVolumeBreak := volumeRatio >= 2.0
	isPriceBreak := latest.Close > high20
	isPositive := latest.ChangePct >= 3.0

	if isVolumeBreak && isPriceBreak && isPositive {
		// 计算强度
		strength := 60.0
		// 量比越大越强
		strength += math.Min((volumeRatio-2)*10, 20)
		// 涨幅越大越强
		strength += math.Min(latest.ChangePct-3, 10)
		return SignalVolumeBreakout, math.Min(strength, 100)
	}

	return SignalAll, 0
}

// detectBottomVolume 检测底部放量
// 条件：
// 1. 股价处于近期低位（当前价 < 20日均价 * 0.95）
// 2. 今日成交量 > 20日均量 * 1.5
// 3. 今日收阳线（收盘 > 开盘）
func (s *StockPickerService) detectBottomVolume(klines []models.StockKline) (SignalType, float64) {
	if len(klines) < 20 {
		return SignalAll, 0
	}

	latest := klines[len(klines)-1]

	// 计算20日均价
	sum := 0.0
	for i := len(klines) - 20; i < len(klines); i++ {
		sum += klines[i].Close
	}
	ma20 := sum / 20

	// 计算20日均量
	avgVol20 := s.calcAvgVolume(klines[len(klines)-20:])

	// 计算近20日最低价
	low20 := klines[len(klines)-1].Low
	for i := len(klines) - 20; i < len(klines); i++ {
		if klines[i].Low < low20 {
			low20 = klines[i].Low
		}
	}

	// 判断条件
	isAtBottom := latest.Close < ma20*0.95 || latest.Close < low20*1.05
	volumeRatio := float64(latest.Volume) / float64(avgVol20)
	isVolumeUp := volumeRatio >= 1.5
	isPositive := latest.Close > latest.Open

	if isAtBottom && isVolumeUp && isPositive {
		strength := 55.0
		// 量比越大越强
		strength += math.Min((volumeRatio-1.5)*15, 20)
		// 阳线实体越大越强
		bodyPct := (latest.Close - latest.Open) / latest.Open * 100
		strength += math.Min(bodyPct*3, 15)
		return SignalBottomVolume, math.Min(strength, 100)
	}

	return SignalAll, 0
}

// detectGoldenCross 检测金叉信号
// 条件：
// 1. MA5 上穿 MA10（昨天 MA5 < MA10，今天 MA5 > MA10）
// 2. MACD 金叉（DIF 上穿 DEA）
func (s *StockPickerService) detectGoldenCross(klines []models.StockKline) (SignalType, float64) {
	if len(klines) < 26 {
		return SignalAll, 0
	}

	// 计算MA
	ma5Today := s.calcMA(klines, len(klines)-1, 5)
	ma10Today := s.calcMA(klines, len(klines)-1, 10)
	ma5Yesterday := s.calcMA(klines, len(klines)-2, 5)
	ma10Yesterday := s.calcMA(klines, len(klines)-2, 10)

	// MA金叉
	maGoldenCross := ma5Yesterday <= ma10Yesterday && ma5Today > ma10Today

	// 计算MACD
	difToday, deaToday := s.calcMACD(klines, len(klines)-1)
	difYesterday, deaYesterday := s.calcMACD(klines, len(klines)-2)

	// MACD金叉
	macdGoldenCross := difYesterday <= deaYesterday && difToday > deaToday

	if maGoldenCross || macdGoldenCross {
		strength := 50.0
		if maGoldenCross {
			strength += 20
		}
		if macdGoldenCross {
			strength += 25
		}
		// 如果股价在均线上方，强度更高
		if klines[len(klines)-1].Close > ma10Today {
			strength += 10
		}
		return SignalGoldenCross, math.Min(strength, 100)
	}

	return SignalAll, 0
}

// detectMABull 检测均线多头排列
// 条件：MA5 > MA10 > MA20 > MA60
func (s *StockPickerService) detectMABull(klines []models.StockKline) (SignalType, float64) {
	if len(klines) < 60 {
		return SignalAll, 0
	}

	idx := len(klines) - 1
	ma5 := s.calcMA(klines, idx, 5)
	ma10 := s.calcMA(klines, idx, 10)
	ma20 := s.calcMA(klines, idx, 20)
	ma60 := s.calcMA(klines, idx, 60)

	// 判断多头排列
	if ma5 > ma10 && ma10 > ma20 && ma20 > ma60 {
		strength := 65.0
		
		// 计算均线发散程度
		spread := (ma5 - ma60) / ma60 * 100
		strength += math.Min(spread*2, 20)
		
		// 股价在MA5上方更强
		if klines[idx].Close > ma5 {
			strength += 10
		}
		
		return SignalMABull, math.Min(strength, 100)
	}

	return SignalAll, 0
}

// detectVolumeThenFlat 检测放量异动后走平
// 条件：
// 1. 近2个月内曾有放量异动（单日成交量 > 20日均量 * 2.5，且涨幅 > 5%）
// 2. 放量后股价走平（近10日振幅 < 10%，且价格在放量日收盘价附近 ±5%）
// 3. 近期成交量萎缩（近5日均量 < 放量日成交量 * 0.5）
func (s *StockPickerService) detectVolumeThenFlat(klines []models.StockKline) (SignalType, float64) {
	if len(klines) < 40 {
		return SignalAll, 0
	}

	// 计算20日均量（用于判断放量）
	avgVol20 := s.calcAvgVolume(klines[len(klines)-40 : len(klines)-20])

	// 在近2个月（约40个交易日）内寻找放量异动日
	// 从第20天开始找，确保放量后至少有10天走平期
	volumeDay := -1
	volumeDayClose := 0.0
	volumeDayVol := int64(0)

	for i := len(klines) - 40; i < len(klines)-10; i++ {
		if i < 0 {
			continue
		}
		k := klines[i]
		
		// 放量条件：成交量 > 20日均量 * 2.5
		// 异动条件：涨幅 > 5% 或 跌幅 > 5%
		isVolumeSpike := k.Volume > int64(float64(avgVol20)*2.5)
		isPriceMove := math.Abs(k.ChangePct) > 5.0

		if isVolumeSpike && isPriceMove {
			// 找到最近的放量异动日
			volumeDay = i
			volumeDayClose = k.Close
			volumeDayVol = k.Volume
		}
	}

	if volumeDay == -1 {
		return SignalAll, 0
	}

	// 检查放量后是否走平
	// 从放量日后一天到最新一天
	startIdx := volumeDay + 1
	if startIdx >= len(klines) {
		return SignalAll, 0
	}

	// 计算放量后的最高价和最低价
	highAfter := klines[startIdx].High
	lowAfter := klines[startIdx].Low
	for i := startIdx; i < len(klines); i++ {
		if klines[i].High > highAfter {
			highAfter = klines[i].High
		}
		if klines[i].Low < lowAfter {
			lowAfter = klines[i].Low
		}
	}

	// 走平条件1：振幅 < 15%
	amplitude := (highAfter - lowAfter) / lowAfter * 100
	if amplitude > 15 {
		return SignalAll, 0
	}

	// 走平条件2：当前价格在放量日收盘价附近 ±8%
	latestClose := klines[len(klines)-1].Close
	priceDeviation := math.Abs(latestClose-volumeDayClose) / volumeDayClose * 100
	if priceDeviation > 8 {
		return SignalAll, 0
	}

	// 走平条件3：近5日均量萎缩（< 放量日成交量 * 0.5）
	avgVol5 := s.calcAvgVolume(klines[len(klines)-5:])
	volumeShrink := float64(avgVol5) < float64(volumeDayVol)*0.5

	if !volumeShrink {
		return SignalAll, 0
	}

	// 计算信号强度
	strength := 60.0

	// 放量越大，强度越高
	volumeRatio := float64(volumeDayVol) / float64(avgVol20)
	strength += math.Min((volumeRatio-2.5)*5, 15)

	// 走平时间越长，强度越高（至少10天）
	flatDays := len(klines) - 1 - volumeDay
	strength += math.Min(float64(flatDays-10)*2, 10)

	// 振幅越小，强度越高
	strength += math.Min((15-amplitude)*1, 10)

	// 成交量萎缩越明显，强度越高
	shrinkRatio := 1 - float64(avgVol5)/float64(volumeDayVol)
	strength += math.Min(shrinkRatio*10, 10)

	return SignalVolumeThenFlat, math.Min(strength, 100)
}

// 辅助函数

// calcAvgVolume 计算平均成交量
func (s *StockPickerService) calcAvgVolume(klines []models.StockKline) int64 {
	if len(klines) == 0 {
		return 0
	}
	var sum int64
	for _, k := range klines {
		sum += k.Volume
	}
	return sum / int64(len(klines))
}

// calcMA 计算移动平均线
func (s *StockPickerService) calcMA(klines []models.StockKline, endIdx, period int) float64 {
	if endIdx < period-1 || endIdx >= len(klines) {
		return 0
	}
	sum := 0.0
	for i := endIdx - period + 1; i <= endIdx; i++ {
		sum += klines[i].Close
	}
	return sum / float64(period)
}

// calcMACD 计算MACD
func (s *StockPickerService) calcMACD(klines []models.StockKline, endIdx int) (dif, dea float64) {
	if endIdx < 25 || endIdx >= len(klines) {
		return 0, 0
	}

	// 计算EMA12和EMA26
	ema12 := s.calcEMA(klines, endIdx, 12)
	ema26 := s.calcEMA(klines, endIdx, 26)
	
	dif = ema12 - ema26
	
	// DEA是DIF的9日EMA（简化计算）
	// 这里用简单移动平均近似
	difSum := 0.0
	for i := endIdx - 8; i <= endIdx; i++ {
		e12 := s.calcEMA(klines, i, 12)
		e26 := s.calcEMA(klines, i, 26)
		difSum += e12 - e26
	}
	dea = difSum / 9

	return dif, dea
}

// calcEMA 计算指数移动平均
func (s *StockPickerService) calcEMA(klines []models.StockKline, endIdx, period int) float64 {
	if endIdx < period-1 {
		return 0
	}
	
	// 初始EMA使用SMA
	sum := 0.0
	for i := endIdx - period + 1; i <= endIdx-period+period; i++ {
		if i >= 0 && i < len(klines) {
			sum += klines[i].Close
		}
	}
	ema := sum / float64(period)
	
	// 计算后续EMA
	multiplier := 2.0 / float64(period+1)
	startIdx := endIdx - period + period
	for i := startIdx + 1; i <= endIdx; i++ {
		if i >= 0 && i < len(klines) {
			ema = (klines[i].Close-ema)*multiplier + ema
		}
	}
	
	return ema
}

// calculateMA 计算MA5, MA10, MA20
func (s *StockPickerService) calculateMA(klines []models.StockKline) (ma5, ma10, ma20 float64) {
	if len(klines) < 5 {
		return 0, 0, 0
	}
	
	idx := len(klines) - 1
	ma5 = s.calcMA(klines, idx, 5)
	
	if len(klines) >= 10 {
		ma10 = s.calcMA(klines, idx, 10)
	}
	
	if len(klines) >= 20 {
		ma20 = s.calcMA(klines, idx, 20)
	}
	
	return ma5, ma10, ma20
}

// calculateAvgVolume 计算5日和20日均量
func (s *StockPickerService) calculateAvgVolume(klines []models.StockKline) (avgVol5, avgVol20 int64) {
	if len(klines) < 5 {
		return 0, 0
	}
	
	avgVol5 = s.calcAvgVolume(klines[len(klines)-5:])
	
	if len(klines) >= 20 {
		avgVol20 = s.calcAvgVolume(klines[len(klines)-20:])
	}
	
	return avgVol5, avgVol20
}

// GetIndustries 获取行业列表
// 从内存缓存读取
func (s *StockPickerService) GetIndustries(ctx context.Context, market string) ([]string, error) {
	stockService := NewStockService()
	stocks, err := stockService.GetStocksByMarketWithCache(ctx, market)
	if err != nil {
		return nil, err
	}
	
	// 限制数量
	if len(stocks) > 5000 {
		stocks = stocks[:5000]
	}

	industryMap := make(map[string]bool)
	for _, stock := range stocks {
		if stock.Industry != "" {
			industryMap[stock.Industry] = true
		}
	}

	industries := make([]string, 0, len(industryMap))
	for industry := range industryMap {
		industries = append(industries, industry)
	}
	sort.Strings(industries)

	return industries, nil
}

// 初始化日志
func init() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
}
