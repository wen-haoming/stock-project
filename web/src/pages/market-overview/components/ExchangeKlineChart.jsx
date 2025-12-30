import { memo, useEffect, useRef, useState, useCallback } from 'react'
import { Segmented, Spin } from 'antd'
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

/**
 * 汇率K线图组件
 */
const ExchangeKlineChart = memo(({ height = 400 }) => {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)
  const { isDark } = useTheme()
  const echartsTheme = getEChartsTheme(isDark)
  
  const [period, setPeriod] = useState('day')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const timerRef = useRef(null)

  // 获取分时数据
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
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
