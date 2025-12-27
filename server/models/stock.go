package models

import "time"

// StockData 股票实时数据
type StockData struct {
	Symbol         string         `json:"symbol" bson:"symbol"`
	Name           string         `json:"name" bson:"name"`
	Market         string         `json:"market" bson:"market"` // hk, a
	LatestPrice    float64        `json:"latestPrice" bson:"latestPrice"`
	Open           float64        `json:"open" bson:"open"`
	Close          float64        `json:"close" bson:"close"`
	High           float64        `json:"high" bson:"high"`
	Low            float64        `json:"low" bson:"low"`
	ChangePct      float64        `json:"changePct" bson:"changePct"`
	ChangeAmt      float64        `json:"changeAmt" bson:"changeAmt"`
	Turnover       float64        `json:"turnover" bson:"turnover"`
	TurnoverRate   float64        `json:"turnoverRate" bson:"turnoverRate"`
	Amplitude      float64        `json:"amplitude" bson:"amplitude"`
	Volume         int64          `json:"volume" bson:"volume"`
	TotalMarketCap float64        `json:"totalMarketCap" bson:"totalMarketCap"`
	CircMarketCap  float64        `json:"circMarketCap" bson:"circMarketCap"`
	PERatio        float64        `json:"peRatio" bson:"peRatio"`
	PBRatio        float64        `json:"pbRatio" bson:"pbRatio"`
	Industry       string         `json:"industry" bson:"industry"`
	KDJ            *KDJIndicator  `json:"kdj,omitempty" bson:"kdj,omitempty"`
	MACD           *MACDIndicator `json:"macd,omitempty" bson:"macd,omitempty"`
	UpdatedAt      time.Time      `json:"updatedAt" bson:"updatedAt"`
	CreatedAt      time.Time      `json:"createdAt" bson:"createdAt"`
}

// StockHistory 股票历史数据（日级别）
type StockHistory struct {
	Symbol    string    `json:"symbol" bson:"symbol"`
	Date      string    `json:"date" bson:"date"`
	Open      float64   `json:"open" bson:"open"`
	Close     float64   `json:"close" bson:"close"`
	High      float64   `json:"high" bson:"high"`
	Low       float64   `json:"low" bson:"low"`
	Volume    int64     `json:"volume" bson:"volume"`
	Turnover  float64   `json:"turnover" bson:"turnover"`
	UpdatedAt time.Time `json:"updatedAt" bson:"updatedAt"`
}

// StockKline K线数据
type StockKline struct {
	Symbol       string  `json:"symbol" bson:"symbol"`
	Date         string  `json:"date" bson:"date"`
	Open         float64 `json:"open" bson:"open"`
	Close        float64 `json:"close" bson:"close"`
	High         float64 `json:"high" bson:"high"`
	Low          float64 `json:"low" bson:"low"`
	Volume       int64   `json:"volume" bson:"volume"`
	Turnover     float64 `json:"turnover" bson:"turnover"`
	Amplitude    float64 `json:"amplitude" bson:"amplitude"`
	ChangePct    float64 `json:"changePct" bson:"changePct"`
	ChangeAmt    float64 `json:"changeAmt" bson:"changeAmt"`
	TurnoverRate float64 `json:"turnoverRate" bson:"turnoverRate"`
}

// RangeStockData 区间涨幅数据
type RangeStockData struct {
	Symbol         string  `json:"symbol" bson:"symbol"`
	Name           string  `json:"name" bson:"name"`
	Market         string  `json:"market" bson:"market"`
	StartPrice     float64 `json:"startPrice" bson:"startPrice"`
	EndPrice       float64 `json:"endPrice" bson:"endPrice"`
	LatestPrice    float64 `json:"latestPrice" bson:"latestPrice"`
	ChangePct      float64 `json:"changePct" bson:"changePct"`
	TotalMarketCap float64 `json:"totalMarketCap" bson:"totalMarketCap"`
	CircMarketCap  float64 `json:"circMarketCap" bson:"circMarketCap"`
	PERatio        float64 `json:"peRatio" bson:"peRatio"`
	PBRatio        float64 `json:"pbRatio" bson:"pbRatio"`
	Industry       string  `json:"industry" bson:"industry"`
	Turnover       float64 `json:"turnover" bson:"turnover"`
	TurnoverRate   float64 `json:"turnoverRate" bson:"turnoverRate"`
}
