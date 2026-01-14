import { memo, useEffect, useRef, useState, useCallback } from 'react'
import { Segmented, Spin, Card } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import * as echarts from 'echarts'
import axios from 'axios'
import dayjs from 'dayjs'
import { useTheme, getEChartsTheme } from '../../../contexts/ThemeContext'

// 汇率配置
const exchangeRateConfig = {
  usdcny: { secid: '133.USDCNH', name: '美元/离岸人民币', color: '#ff4d4f' },
}

// 周期配置
const periodOptions = [
  { label: '分时', value: 'trend', klt: 1 },
  { label: '日K', value: 'day', klt: 101 },
  { label: '周K', value: 'week', klt: 102 },
  { label: '月K', value: 'month', klt: 103 },
]

// 涨跌颜色
const upColor = '#ef5350'
const downColor = '#26a69a'

interface ExchangeKlineChartProps {
  height?: number
  onStatsChange?: (stats: any) => void
}

/**
 * 导出汇率统计卡片
 */
export const ExchangeStatsCard = memo(({ stats, isDark }: { stats: any; isDark: boolean }) => {
  const formatNum = (val: any) => {
    if (val === undefined || val === null || isNaN(val)) return '--'
    return val
  }

  return (
    <Card
      size="small"
      style={{
        width: '100%',
        background: isDark ? 'rgba(255, 77, 79, 0.05)' : 'rgba(255, 77, 79, 0.08)',
        border: `1px solid ${exchangeRateConfig.usdcny.color}`,
        borderRadius: 6,
        minHeight: 120
      }}
      styles={{ body: { padding: '8px 12px' } }}
    >
      {!stats ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 100, color: '#999' }}>
          加载中...
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>当前汇率</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: exchangeRateConfig.usdcny.color }}>
              {formatNum(stats.currentPrice?.toFixed(4))}
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>今日涨跌</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                {parseFloat(stats.changePct) >= 0 ? (
                  <ArrowUpOutlined style={{ color: upColor, fontSize: 11 }} />
                ) : (
                  <ArrowDownOutlined style={{ color: downColor, fontSize: 11 }} />
                )}
                <span style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: parseFloat(stats.changePct) >= 0 ? upColor : downColor
                }}>
                  {formatNum(Math.abs(parseFloat(stats.changePct)).toFixed(3))}%
                </span>
              </div>
            </div>
            
            <div>
              <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>涨幅</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                {parseFloat(stats.change) >= 0 ? (
                  <ArrowUpOutlined style={{ color: upColor, fontSize: 11 }} />
                ) : (
                  <ArrowDownOutlined style={{ color: downColor, fontSize: 11 }} />
                )}
                <span style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: parseFloat(stats.change) >= 0 ? upColor : downColor
                }}>
                  {formatNum((parseFloat(stats.change) >= 0 ? '+' : '') + parseFloat(stats.change).toFixed(3))}
                </span>
              </div>
            </div>
          </div>
          
          {stats.sevenDayData && (
            <div style={{ marginBottom: 6, paddingBottom: 6, borderBottom: `1px solid ${exchangeRateConfig.usdcny.color}33` }}>
              <div style={{ fontSize: 10, color: '#999', marginBottom: 2 }}>7天</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                {parseFloat(stats.sevenDayData.changePct) >= 0 ? (
                  <ArrowUpOutlined style={{ color: upColor, fontSize: 11 }} />
                ) : (
                  <ArrowDownOutlined style={{ color: downColor, fontSize: 11 }} />
                )}
                <span style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: parseFloat(stats.sevenDayData.changePct) >= 0 ? upColor : downColor
                }}>
                  {formatNum(Math.abs(parseFloat(stats.sevenDayData.changePct)).toFixed(3))}%
                </span>
              </div>
            </div>
          )}
          
          {stats.thirtyDayData && (
            <div>
              <div style={{ fontSize: 10, color: '#999', marginBottom: 2 }}>30天</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                {parseFloat(stats.thirtyDayData.changePct) >= 0 ? (
                  <ArrowUpOutlined style={{ color: upColor, fontSize: 11 }} />
                ) : (
                  <ArrowDownOutlined style={{ color: downColor, fontSize: 11 }} />
                )}
                <span style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: parseFloat(stats.thirtyDayData.changePct) >= 0 ? upColor : downColor
                }}>
                  {formatNum(Math.abs(parseFloat(stats.thirtyDayData.changePct)).toFixed(3))}%
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  )
})

ExchangeStatsCard.displayName = 'ExchangeStatsCard'

/**
 * 汇率K线图组件
 */
const ExchangeKlineChart = memo(({ height = 400, onStatsChange }: ExchangeKlineChartProps & { onStatsChange?: (stats: any) => void }) => {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)
  const { isDark } = useTheme()
  const echartsTheme = getEChartsTheme(isDark)
  
  const [period, setPeriod] = useState('day')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [stats, setStats] = useState(null)
  const timerRef = useRef(null)

  // 获取股票实时数据（通过K线API获取最新数据）
  const fetchRealtimeData = useCallback(async () => {
    try {
      const end = dayjs().format('YYYYMMDD')
      const start = dayjs().subtract(5, 'day').format('YYYYMMDD')
      
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${exchangeRateConfig.usdcny.secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=${start}&end=${end}`
      
      const response = await axios.get(url)
      const klines = response.data?.data?.klines || []
      
      if (klines.length < 2) return null
      
      // 取最新两天的数据
      const lastDay = klines[klines.length - 1].split(',')
      const prevDay = klines[klines.length - 2].split(',')
      
      const currentPrice = parseFloat(lastDay[2]) // 收盘价
      const lastClose = parseFloat(prevDay[2]) // 前一天收盘价
      
      // 验证有效数据
      if (!currentPrice || !lastClose || lastClose === 0) return null
      
      // 计算涨跌幅
      const changePct = (((currentPrice - lastClose) / lastClose) * 100).toFixed(4)
      const change = (currentPrice - lastClose).toFixed(4)
      
      // 检查 NaN
      if (isNaN(parseFloat(changePct)) || isNaN(parseFloat(change))) return null
      
      return {
        currentPrice,
        change,
        changePct,
        lastClose,
      }
    } catch (error) {
      console.error('获取实时数据失败:', error)
      return null
    }
  }, [])

  // 计算过去N天的涨跌幅
  const calculatePeriodChange = useCallback(async (days) => {
    try {
      const start = dayjs().subtract(days, 'day').format('YYYYMMDD')
      const end = dayjs().format('YYYYMMDD')
      
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${exchangeRateConfig.usdcny.secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=${start}&end=${end}`
      
      const response = await axios.get(url)
      const rawData = response.data?.data?.klines || []
      
      if (rawData.length < 2) return null
      
      const firstDay = rawData[0].split(',')
      const lastDay = rawData[rawData.length - 1].split(',')
      
      const openPrice = parseFloat(firstDay[1])
      const closePrice = parseFloat(lastDay[2])
      const change = closePrice - openPrice
      const changePct = ((change / openPrice) * 100).toFixed(4)
      
      return {
        openPrice,
        closePrice,
        change: change.toFixed(4),
        changePct
      }
    } catch (error) {
      console.error(`获取${days}天数据失败:`, error)
      return null
    }
  }, [])

  // 加载统计数据
  const loadStats = useCallback(async () => {
    const realtimeData = await fetchRealtimeData()
    if (!realtimeData) return
    
    // 并行获取7天和30天数据
    const [sevenDayData, thirtyDayData] = await Promise.all([
      calculatePeriodChange(7),
      calculatePeriodChange(30)
    ])
    
    setStats({
      ...realtimeData,
      sevenDayData,
      thirtyDayData
    })
  }, [fetchRealtimeData, calculatePeriodChange])

  // 定时更新统计数据
  useEffect(() => {
    loadStats()
    
    // 每分钟更新一次统计数据
    const statsTimer = setInterval(loadStats, 60000)
    
    return () => {
      if (statsTimer) clearInterval(statsTimer)
    }
  }, [loadStats])

  // 当stats更新时，通知父组件
  useEffect(() => {
    if (onStatsChange && stats) {
      onStatsChange(stats)
    }
  }, [stats, onStatsChange])
  const fetchTrendData = useCallback(async () => {
    try {
      const timestamp = Date.now()
      const url = `https://push2his.eastmoney.com/api/qt/stock/trends2/get?fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ut=7eea3edcaed734bea9cbfc24409ed989&ndays=1&iscr=0&secid=${exchangeRateConfig.usdcny.secid}&_=${timestamp}`
      
      const response = await axios.get(url)
      const rawData = response.data?.data
      
      if (!rawData) return null
      
      const preClose = rawData.preClose / 10000 // 汇率精度调整
      const trends = rawData.trends || []
      
      const categoryData = []
      const values = []
      
      trends.forEach((item) => {
        const fields = item.split(',')
        const time = fields[0].split(' ')[1] || fields[0]
        const price = parseFloat(fields[2]) / 10000
        const avg = parseFloat(fields[7]) / 10000
        categoryData.push(time)
        values.push([price, avg])
      })
      
      return { categoryData, values, preClose, isTrend: true }
    } catch (error) {
      console.error('获取分时数据失败:', error)
      return null
    }
  }, [])

  // 获取K线数据
  const fetchKlineData = useCallback(async (klt) => {
    try {
      // 根据周期类型设置时间范围
      let months = 3
      if (klt === 102) months = 24 // 周K取2年
      if (klt === 103) months = 60 // 月K取5年
      
      const start = dayjs().subtract(months, 'month').format('YYYYMMDD')
      const end = dayjs().format('YYYYMMDD')
      
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${exchangeRateConfig.usdcny.secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=${klt}&fqt=1&beg=${start}&end=${end}`
      
      const response = await axios.get(url)
      const rawData = response.data?.data?.klines || []
      
      const categoryData = []
      const values = []
      const volumes = []
      
      rawData.forEach((item, index) => {
        const fields = item.split(',')
        categoryData.push(fields[0])
        const open = parseFloat(fields[1])
        const close = parseFloat(fields[2])
        const high = parseFloat(fields[3])
        const low = parseFloat(fields[4])
        const volume = parseInt(fields[5])
        
        values.push([open, close, low, high])
        volumes.push([index, volume, open > close ? 1 : -1])
      })
      
      return { categoryData, values, volumes, isTrend: false }
    } catch (error) {
      console.error('获取K线数据失败:', error)
      return null
    }
  }, [])

  // 加载数据
  const loadData = useCallback(async (periodValue) => {
    setLoading(true)
    const periodConfig = periodOptions.find(p => p.value === periodValue)
    
    let result
    if (periodValue === 'trend') {
      result = await fetchTrendData()
    } else {
      result = await fetchKlineData(periodConfig.klt)
    }
    
    setData(result)
    setLoading(false)
  }, [fetchTrendData, fetchKlineData])

  // 初始加载和周期切换
  useEffect(() => {
    loadData(period)
    
    // 设置定时刷新（分时图30秒刷新，K线图5分钟刷新）
    const interval = period === 'trend' ? 30000 : 300000
    timerRef.current = setInterval(() => loadData(period), interval)
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [period, loadData])

  // 渲染图表
  useEffect(() => {
    if (!chartRef.current || !data) return
    
    if (chartInstanceRef.current) chartInstanceRef.current.dispose()
    
    const chart = echarts.init(chartRef.current)
    chartInstanceRef.current = chart
    
    if (data.isTrend) {
      // 分时图
      const preClose = data.preClose || 0
      const prices = data.values.map(v => v[0])
      const minPrice = Math.min(...prices)
      const maxPrice = Math.max(...prices)
      const maxDiff = Math.max(Math.abs(maxPrice - preClose), Math.abs(minPrice - preClose), preClose * 0.001)
      const yMin = preClose - maxDiff * 1.2
      const yMax = preClose + maxDiff * 1.2
      const pctRange = ((yMax - preClose) / preClose * 100).toFixed(2)
      
      chart.setOption({
        animation: false,
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' },
          ...echartsTheme.tooltip,
          formatter: (params) => {
            const priceData = params.find(p => p.seriesName === '汇率')
            if (!priceData || priceData.data == null) return ''
            
            const price = priceData.data
            const changePct = preClose ? ((price - preClose) / preClose * 100).toFixed(4) : '-'
            const color = price >= preClose ? upColor : downColor
            
            return `<div style="font-size:12px">
              <div style="font-weight:bold;margin-bottom:4px">${priceData.axisValue}</div>
              <div>汇率: <span style="color:${color}">${price.toFixed(4)}</span></div>
              <div>涨跌: <span style="color:${color}">${changePct}%</span></div>
            </div>`
          }
        },
        grid: { left: 60, right: 60, top: 20, bottom: 30 },
        xAxis: {
          type: 'category',
          data: data.categoryData,
          boundaryGap: false,
          axisLine: { lineStyle: { color: echartsTheme.axisLine.lineStyle.color } },
          axisLabel: { fontSize: 10, color: echartsTheme.axisLabel.color },
          splitLine: { show: false }
        },
        yAxis: [
          {
            type: 'value',
            position: 'left',
            min: yMin,
            max: yMax,
            splitNumber: 4,
            axisLine: { show: false },
            splitLine: { lineStyle: { color: echartsTheme.splitLine.lineStyle.color, type: 'dashed' } },
            axisLabel: {
              fontSize: 10,
              color: (value) => {
                if (value > preClose) return upColor
                if (value < preClose) return downColor
                return echartsTheme.axisLabel.color
              },
              formatter: (value) => value.toFixed(4)
            }
          },
          {
            type: 'value',
            position: 'right',
            min: -parseFloat(pctRange),
            max: parseFloat(pctRange),
            splitNumber: 4,
            axisLine: { show: false },
            splitLine: { show: false },
            axisLabel: {
              fontSize: 10,
              color: (value) => {
                if (value > 0) return upColor
                if (value < 0) return downColor
                return echartsTheme.axisLabel.color
              },
              formatter: (value) => `${value.toFixed(2)}%`
            }
          }
        ],
        series: [
          {
            name: '汇率',
            type: 'line',
            data: data.values.map(v => v[0]),
            symbol: 'none',
            lineStyle: { width: 1.5, color: exchangeRateConfig.usdcny.color },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(255, 77, 79, 0.3)' },
                { offset: 1, color: 'rgba(255, 77, 79, 0.05)' }
              ])
            },
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { type: 'dashed', color: echartsTheme.axisLabel.color, width: 1 },
              label: { show: false },
              data: [{ yAxis: preClose }]
            }
          }
        ]
      })
    } else {
      // K线图
      chart.setOption({
        animation: false,
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' },
          ...echartsTheme.tooltip,
          formatter: (params) => {
            const kline = params.find(p => p.seriesType === 'candlestick')
            if (!kline) return ''
            
            const [open, close, low, high] = kline.data
            const change = ((close - open) / open * 100).toFixed(4)
            const color = close >= open ? upColor : downColor
            
            return `<div style="font-size:12px">
              <div style="font-weight:bold;margin-bottom:4px">${kline.axisValue}</div>
              <div>开: ${open.toFixed(4)}</div>
              <div>收: <span style="color:${color}">${close.toFixed(4)}</span></div>
              <div>高: ${high.toFixed(4)}</div>
              <div>低: ${low.toFixed(4)}</div>
              <div>涨跌: <span style="color:${color}">${change}%</span></div>
            </div>`
          }
        },
        grid: [
          { left: 60, right: 20, top: 20, height: '65%' },
          { left: 60, right: 20, top: '80%', height: '15%' }
        ],
        xAxis: [
          {
            type: 'category',
            data: data.categoryData,
            boundaryGap: true,
            axisLine: { lineStyle: { color: echartsTheme.axisLine.lineStyle.color } },
            axisLabel: { show: false },
            splitLine: { show: false }
          },
          {
            type: 'category',
            gridIndex: 1,
            data: data.categoryData,
            boundaryGap: true,
            axisLine: { lineStyle: { color: echartsTheme.axisLine.lineStyle.color } },
            axisLabel: { fontSize: 10, color: echartsTheme.axisLabel.color },
            splitLine: { show: false }
          }
        ],
        yAxis: [
          {
            scale: true,
            splitArea: { show: false },
            splitLine: { lineStyle: { color: echartsTheme.splitLine.lineStyle.color, type: 'dashed' } },
            axisLabel: { fontSize: 10, color: echartsTheme.axisLabel.color, formatter: (v) => v.toFixed(4) }
          },
          {
            scale: true,
            gridIndex: 1,
            axisLabel: { show: false },
            axisLine: { show: false },
            splitLine: { show: false }
          }
        ],
        dataZoom: [
          { type: 'inside', xAxisIndex: [0, 1], start: 50, end: 100 }
        ],
        visualMap: {
          show: false,
          seriesIndex: 1,
          dimension: 2,
          pieces: [{ value: 1, color: downColor }, { value: -1, color: upColor }]
        },
        series: [
          {
            name: '汇率',
            type: 'candlestick',
            data: data.values,
            itemStyle: {
              color: upColor,
              color0: downColor,
              borderColor: upColor,
              borderColor0: downColor
            }
          },
          {
            name: '成交量',
            type: 'bar',
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: data.volumes,
            barWidth: '60%'
          }
        ]
      })
    }
    
    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [data, isDark, echartsTheme])

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: exchangeRateConfig.usdcny.color }}>
          美元/离岸人民币 K线
        </span>
        <Segmented
          size="small"
          value={period}
          onChange={setPeriod}
          options={periodOptions.map(p => ({ label: p.label, value: p.value }))}
        />
      </div>
      
      {loading && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10 }}>
          <Spin />
        </div>
      )}
      
      <div ref={chartRef} style={{ height }} />
    </div>
  )
})

ExchangeKlineChart.displayName = 'ExchangeKlineChart'

export default ExchangeKlineChart
