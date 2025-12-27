package utils

import "server/models"

// CalcKDJ 计算 KDJ 指标
// 参数: highs, lows, closes 为价格序列, n 为周期(通常为9)
func CalcKDJ(highs, lows, closes []float64, n int) *models.KDJIndicator {
	if len(closes) < n {
		return nil
	}

	// 计算 RSV
	rsv := make([]float64, len(closes))
	for i := n - 1; i < len(closes); i++ {
		highest := highs[i]
		lowest := lows[i]
		for j := i - n + 1; j <= i; j++ {
			if highs[j] > highest {
				highest = highs[j]
			}
			if lows[j] < lowest {
				lowest = lows[j]
			}
		}
		if highest == lowest {
			rsv[i] = 50
		} else {
			rsv[i] = (closes[i] - lowest) / (highest - lowest) * 100
		}
	}

	// 计算 K, D, J
	k := make([]float64, len(closes))
	d := make([]float64, len(closes))
	j := make([]float64, len(closes))

	// 初始值
	k[n-1] = 50
	d[n-1] = 50

	for i := n; i < len(closes); i++ {
		k[i] = 2.0/3.0*k[i-1] + 1.0/3.0*rsv[i]
		d[i] = 2.0/3.0*d[i-1] + 1.0/3.0*k[i]
		j[i] = 3*k[i] - 2*d[i]
	}

	lastIdx := len(closes) - 1
	return &models.KDJIndicator{
		K: k[lastIdx],
		D: d[lastIdx],
		J: j[lastIdx],
	}
}

// CalcMACD 计算 MACD 指标
// 参数: closes 为收盘价序列, short=12, long=26, signal=9
func CalcMACD(closes []float64, short, long, signal int) *models.MACDIndicator {
	if len(closes) < long {
		return nil
	}

	// 计算 EMA
	emaShort := calcEMA(closes, short)
	emaLong := calcEMA(closes, long)

	// 计算 DIF
	dif := make([]float64, len(closes))
	for i := 0; i < len(closes); i++ {
		dif[i] = emaShort[i] - emaLong[i]
	}

	// 计算 DEA (DIF 的 EMA)
	dea := calcEMA(dif, signal)

	// 计算 MACD 柱
	lastIdx := len(closes) - 1
	macdValue := 2 * (dif[lastIdx] - dea[lastIdx])

	return &models.MACDIndicator{
		DIF:  dif[lastIdx],
		DEA:  dea[lastIdx],
		MACD: macdValue,
	}
}

// calcEMA 计算指数移动平均
func calcEMA(data []float64, period int) []float64 {
	ema := make([]float64, len(data))
	if len(data) == 0 {
		return ema
	}

	// 第一个值用 SMA
	sum := 0.0
	for i := 0; i < period && i < len(data); i++ {
		sum += data[i]
	}
	ema[period-1] = sum / float64(period)

	// 后续用 EMA 公式
	multiplier := 2.0 / float64(period+1)
	for i := period; i < len(data); i++ {
		ema[i] = (data[i]-ema[i-1])*multiplier + ema[i-1]
	}

	return ema
}
