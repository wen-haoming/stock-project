package db

import "time"

// StockData 股票实时数据模型
type StockData struct {
	Symbol         string  `bson:"symbol" json:"symbol"`                 // 股票代码
	Name           string  `bson:"name" json:"name"`                     // 中文名称
	Market         string  `bson:"market" json:"market"`                 // 市场 (sh/sz/hk)
	LatestPrice    float64 `bson:"latestPrice" json:"latestPrice"`       // 最新价
	Open           float64 `bson:"open" json:"open"`                     // 今开
	Close          float64 `bson:"close" json:"close"`                   // 昨收
	High           float64 `bson:"high" json:"high"`                     // 最高
	Low            float64 `bson:"low" json:"low"`                       // 最低
	ChangePct      float64 `bson:"changePct" json:"changePct"`           // 涨跌幅
	ChangeAmt      float64 `bson:"changeAmt" json:"changeAmt"`           // 涨跌额
	Volume         int64   `bson:"volume" json:"volume"`                 // 成交量
	Turnover       float64 `bson:"turnover" json:"turnover"`             // 成交额
	TurnoverRate   float64 `bson:"turnoverRate" json:"turnoverRate"`     // 换手率
	Amplitude      float64 `bson:"amplitude" json:"amplitude"`           // 振幅
	TotalMarketCap float64 `bson:"totalMarketCap" json:"totalMarketCap"` // 总市值
	CircMarketCap  float64 `bson:"circMarketCap" json:"circMarketCap"`   // 流通市值
	PERatio        float64 `bson:"peRatio" json:"peRatio"`               // 市盈率
	PBRatio        float64 `bson:"pbRatio" json:"pbRatio"`               // 市净率
	Industry       string  `bson:"industry" json:"industry"`             // 所属行业

	// 技术指标
	KDJ  *KDJIndicator  `bson:"kdj,omitempty" json:"kdj,omitempty"`
	MACD *MACDIndicator `bson:"macd,omitempty" json:"macd,omitempty"`

	// 时间戳
	UpdatedAt time.Time `bson:"updatedAt" json:"updatedAt"`
	CreatedAt time.Time `bson:"createdAt" json:"createdAt"`
}

// KDJIndicator KDJ指标
type KDJIndicator struct {
	K float64 `bson:"k" json:"k"`
	D float64 `bson:"d" json:"d"`
	J float64 `bson:"j" json:"j"`
}

// MACDIndicator MACD指标
type MACDIndicator struct {
	DIF  float64 `bson:"dif" json:"dif"`
	DEA  float64 `bson:"dea" json:"dea"`
	MACD float64 `bson:"macd" json:"macd"`
}

// StockHistory 股票历史数据
type StockHistory struct {
	Symbol    string    `bson:"symbol" json:"symbol"`
	Date      string    `bson:"date" json:"date"` // YYYY-MM-DD
	Open      float64   `bson:"open" json:"open"`
	Close     float64   `bson:"close" json:"close"`
	High      float64   `bson:"high" json:"high"`
	Low       float64   `bson:"low" json:"low"`
	Volume    int64     `bson:"volume" json:"volume"`
	Turnover  float64   `bson:"turnover" json:"turnover"`
	ChangePct float64   `bson:"changePct" json:"changePct"`
	UpdatedAt time.Time `bson:"updatedAt" json:"updatedAt"`
}

// CacheInfo 缓存信息
type CacheInfo struct {
	Key       string    `bson:"key" json:"key"`
	UpdatedAt time.Time `bson:"updatedAt" json:"updatedAt"`
	ExpireAt  time.Time `bson:"expireAt" json:"expireAt"`
}
