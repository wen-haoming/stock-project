package models

// KDJIndicator KDJ 技术指标
type KDJIndicator struct {
	K float64 `json:"k" bson:"k"`
	D float64 `json:"d" bson:"d"`
	J float64 `json:"j" bson:"j"`
}

// MACDIndicator MACD 技术指标
type MACDIndicator struct {
	DIF  float64 `json:"dif" bson:"dif"`
	DEA  float64 `json:"dea" bson:"dea"`
	MACD float64 `json:"macd" bson:"macd"`
}
