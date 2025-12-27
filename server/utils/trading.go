package utils

import (
	"time"
)

// 中国时区
var ChinaLocation *time.Location

func init() {
	var err error
	ChinaLocation, err = time.LoadLocation("Asia/Shanghai")
	if err != nil {
		ChinaLocation = time.FixedZone("CST", 8*3600)
	}
}

// IsTradingDay 判断是否为交易日（排除周末）
func IsTradingDay(t time.Time) bool {
	weekday := t.In(ChinaLocation).Weekday()
	return weekday != time.Saturday && weekday != time.Sunday
}

// IsAStockTradingTime 判断是否为A股交易时间
// 上午: 09:30 - 11:30, 下午: 13:00 - 15:00
func IsAStockTradingTime(t time.Time) bool {
	if !IsTradingDay(t) {
		return false
	}

	chinaTime := t.In(ChinaLocation)
	hour := chinaTime.Hour()
	minute := chinaTime.Minute()
	totalMinutes := hour*60 + minute

	// 09:30 - 11:30
	morningStart := 9*60 + 30
	morningEnd := 11*60 + 30
	// 13:00 - 15:00
	afternoonStart := 13 * 60
	afternoonEnd := 15 * 60

	return (totalMinutes >= morningStart && totalMinutes <= morningEnd) ||
		(totalMinutes >= afternoonStart && totalMinutes <= afternoonEnd)
}

// IsHKTradingTime 判断是否为港股交易时间
// 上午: 09:30 - 12:00, 下午: 13:00 - 16:00
func IsHKTradingTime(t time.Time) bool {
	if !IsTradingDay(t) {
		return false
	}

	chinaTime := t.In(ChinaLocation)
	hour := chinaTime.Hour()
	minute := chinaTime.Minute()
	totalMinutes := hour*60 + minute

	// 09:30 - 12:00
	morningStart := 9*60 + 30
	morningEnd := 12 * 60
	// 13:00 - 16:00
	afternoonStart := 13 * 60
	afternoonEnd := 16 * 60

	return (totalMinutes >= morningStart && totalMinutes <= morningEnd) ||
		(totalMinutes >= afternoonStart && totalMinutes <= afternoonEnd)
}

// IsTradingTime 判断是否为交易时间（A股或港股）
func IsTradingTime(t time.Time, market string) bool {
	if market == "hk" {
		return IsHKTradingTime(t)
	}
	return IsAStockTradingTime(t)
}

// GetChinaTime 获取当前中国时间
func GetChinaTime() time.Time {
	return time.Now().In(ChinaLocation)
}

// FormatDate 格式化日期为 YYYY-MM-DD
func FormatDate(t time.Time) string {
	return t.Format("2006-01-02")
}

// ParseDate 解析日期字符串
func ParseDate(s string) (time.Time, error) {
	return time.ParseInLocation("2006-01-02", s, ChinaLocation)
}
