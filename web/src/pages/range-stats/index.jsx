import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Card, Tag, Spin, message, Grid } from 'antd'
import * as echarts from 'echarts'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import dayjs from 'dayjs'
import RangeStatsPanel from './RangeStatsPanel'
import IndexMobile from './IndexMobile'

const { useBreakpoint } = Grid

// 指数配置（根据市场切换）
const indexConfigs = {
  hk: { secid: '100.HSI', name: '恒生指数' },
  a: { secid: '1.000001', name: '上证指数' },
}

// ECharts 颜色配置
const upColor = '#ec5a5a'
const downColor = '#47b262'

// 计算均线
const calculateMA = (dayCount, data) => {
  const result = []
  for (let i = 0; i < data.length; i++) {
    if (i < dayCount) {
      result.push('-')
      continue
    }
    let sum = 0
    for (let j = 0; j < dayCount; j++) {
      sum += data[i - j][1]
    }
    result.push(+(sum / dayCount).toFixed(2))
  }
  return result
}

// 解析 K 线原始数据
const parseKlineData = (rawData) => {
  const categoryData = []
  const values = []
  const volumes = []

  rawData.forEach((item, idx) => {
    const fields = item.split(',')
    categoryData.push(fields[0])
    const open = parseFloat(fields[1])
    const close = parseFloat(fields[2])
    values.push([open, close, parseFloat(fields[4]), parseFloat(fields[3])])
    volumes.push([idx, parseInt(fields[5]), open > close ? 1 : -1])
  })

  return { categoryData, values, volumes }
}

// 市场默认预设配置
const marketDefaultPresets = {
  hk: { label: '24.01-至今 AI浪潮', value: [dayjs('2024-01-02'), dayjs().subtract(1, 'day')] },
  a: { label: '24.09-至今 政策牛', value: [dayjs('2024-09-24'), dayjs().subtract(1, 'day')] },
}

// 从 URL 参数解析初始值
const parseUrlParams = (searchParams) => {
  const startDate = searchParams.get('start')
  const endDate = searchParams.get('end')
  const market = searchParams.get('market') || 'hk'

  // 如果有 URL 参数则使用，否则使用市场默认预设
  const defaultPreset = marketDefaultPresets[market]
  
  return {
    dateRange: startDate && endDate 
      ? [dayjs(startDate), dayjs(endDate)]
      : defaultPreset.value,
    market: market,
  }
}

export default function RangeStats() {
  const screens = useBreakpoint()
  const isMobile = !screens.md

  // 移动端使用专门的移动端组件
  if (isMobile) {
    return <IndexMobile />
  }

  return <RangeStatsPC />
}

// PC 端组件
function RangeStatsPC() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialParams = parseUrlParams(searchParams)

  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const klineDataRef = useRef({ categoryData: [], values: [], volumes: [] })
  const isUpdatingFromChart = useRef(false)
  const loadedStartDateRef = useRef('20080101')
  const isLoadingMoreRef = useRef(false)

  const [market, setMarket] = useState(initialParams.market)
  const [dateRange, setDateRange] = useState(initialParams.dateRange)
  const [loading, setLoading] = useState(false)
  const [indexChangePct, setIndexChangePct] = useState(null)

  // 当前市场的指数配置
  const indexConfig = useMemo(() => indexConfigs[market] || indexConfigs.hk, [market])

  // 计算指数区间涨幅
  const calculateIndexChange = useCallback((startDate, endDate) => {
    const { categoryData, values } = klineDataRef.current
    if (!categoryData.length || !values.length) {
      setIndexChangePct(null)
      return
    }

    const startStr = startDate.format('YYYY-MM-DD')
    const endStr = endDate.format('YYYY-MM-DD')
    let startIdx = categoryData.findIndex(d => d >= startStr)
    let endIdx = categoryData.findIndex(d => d >= endStr)
    if (endIdx === -1) endIdx = categoryData.length - 1

    if (startIdx >= 0 && endIdx >= 0 && startIdx <= endIdx) {
      const startClose = values[startIdx][0]
      const endClose = values[endIdx][1]
      setIndexChangePct(((endClose - startClose) / startClose) * 100)
    } else {
      setIndexChangePct(null)
    }
  }, [])

  const calculateIndexChangeRef = useRef(calculateIndexChange)
  calculateIndexChangeRef.current = calculateIndexChange

  // 更新 URL 参数
  const updateUrlParams = useCallback((params = {}) => {
    const newParams = new URLSearchParams()
    const start = params.dateRange?.[0] || dateRange[0]
    const end = params.dateRange?.[1] || dateRange[1]
    const mkt = params.market ?? market

    if (start) newParams.set('start', start.format('YYYY-MM-DD'))
    if (end) newParams.set('end', end.format('YYYY-MM-DD'))
    if (mkt !== 'hk') newParams.set('market', mkt)

    setSearchParams(newParams, { replace: true })
  }, [dateRange, market, setSearchParams])

  // 更新图表 brush 区间
  const updateChartBrush = useCallback((startDate, endDate) => {
    if (!chartRef.current || !klineDataRef.current.categoryData.length) return
    
    const categoryData = klineDataRef.current.categoryData
    const startStr = startDate.format('YYYY-MM-DD')
    let endStr = endDate.format('YYYY-MM-DD')
    
    const lastDate = categoryData[categoryData.length - 1]
    if (endStr > lastDate) endStr = lastDate
    
    const firstDate = categoryData[0]
    let actualStartStr = startStr < firstDate ? firstDate : startStr
    
    let startIdx = categoryData.findIndex(d => d >= actualStartStr)
    let endIdx = categoryData.findIndex(d => d >= endStr)
    if (endIdx === -1) endIdx = categoryData.length - 1
    
    const totalLen = categoryData.length
    
    if (startIdx >= 0 && endIdx >= 0 && startIdx <= endIdx) {
      const actualStart = categoryData[startIdx]
      const actualEnd = categoryData[endIdx]
      
      calculateIndexChange(startDate, endDate)
      
      const rangeLen = endIdx - startIdx + 1
      const targetDisplayLen = rangeLen / 0.75
      const padding = (targetDisplayLen - rangeLen) / 2
      
      const zoomStart = Math.max(0, ((startIdx - padding) / totalLen) * 100)
      const zoomEnd = Math.min(100, ((endIdx + padding) / totalLen) * 100)
      
      chartRef.current.dispatchAction({ type: 'dataZoom', start: zoomStart, end: zoomEnd })
      chartRef.current.dispatchAction({ type: 'brush', command: 'clear', areas: [] })
      
      setTimeout(() => {
        chartRef.current?.dispatchAction({
          type: 'brush',
          areas: [{ brushType: 'lineX', coordRange: [actualStart, actualEnd], xAxisIndex: 0 }]
        })
      }, 100)
    }
  }, [calculateIndexChange])

  // 创建 ECharts 配置
  const createChartOption = useCallback((data) => ({
    animation: false,
    legend: {
      top: 5,
      right: 10,
      orient: 'vertical',
      data: [indexConfig.name, 'MA5', 'MA10', 'MA20', 'MA60'],
      textStyle: { fontSize: 12 }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      borderWidth: 1,
      borderColor: '#ccc',
      padding: 10,
      textStyle: { fontSize: 12 },
      formatter: (params) => {
        if (!params?.length) return ''
        let html = `<div style="font-weight:bold;margin-bottom:4px">${params[0].axisValue}</div>`
        params.forEach(item => {
          if (item.seriesType === 'candlestick') {
            const [open, close, low, high] = item.data
            const color = close >= open ? upColor : downColor
            html += `<div style="color:${color}">开盘: ${open.toFixed(2)}<br/>收盘: ${close.toFixed(2)}<br/>最高: ${high.toFixed(2)}<br/>最低: ${low.toFixed(2)}</div>`
          } else if (item.seriesName === 'Volume') {
            html += `<div>成交量: ${(item.data[1] / 100000000).toFixed(2)}亿</div>`
          } else if (item.seriesName.startsWith('MA') && item.data !== '-') {
            html += `<div>${item.marker}${item.seriesName}: ${item.data.toFixed(2)}</div>`
          }
        })
        return html
      },
      position: (pos, params, el, elRect, size) => {
        const obj = { top: 10 }
        obj[['left', 'right'][+(pos[0] < size.viewSize[0] / 2)]] = 30
        return obj
      }
    },
    axisPointer: { link: [{ xAxisIndex: 'all' }], label: { backgroundColor: '#777' } },
    toolbox: { feature: { brush: { type: ['lineX', 'clear'] } }, right: 10, itemSize: 15 },
    brush: { xAxisIndex: 'all', brushLink: 'all', outOfBrush: { colorAlpha: 1 } },
    visualMap: { show: false, seriesIndex: 6, dimension: 2, pieces: [{ value: 1, color: downColor }, { value: -1, color: upColor }] },
    grid: [
      { left: 60, right: 80, top: 10, bottom: '25%' },
      { left: 60, right: 80, top: '78%', bottom: 30 }
    ],
    xAxis: [
      { type: 'category', data: data.categoryData, boundaryGap: false, axisLine: { onZero: false }, splitLine: { show: false }, min: 'dataMin', max: 'dataMax', axisPointer: { z: 100 }, axisLabel: { fontSize: 12 } },
      { type: 'category', gridIndex: 1, data: data.categoryData, boundaryGap: false, axisLine: { onZero: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, min: 'dataMin', max: 'dataMax' }
    ],
    yAxis: [
      { scale: true, splitArea: { show: true }, axisLabel: { fontSize: 12 } },
      { scale: true, gridIndex: 1, splitNumber: 2, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } }
    ],
    dataZoom: [{ type: 'inside', xAxisIndex: [0, 1], startValue: dayjs().startOf('year').format('YYYY-MM-DD'), end: 100 }],
    series: [
      { name: indexConfig.name, type: 'candlestick', data: data.values, itemStyle: { color: upColor, color0: downColor, borderColor: upColor, borderColor0: downColor, borderWidth: 1 } },
      { name: 'MA5', type: 'line', data: calculateMA(5, data.values), smooth: true, lineStyle: { opacity: 0.5, width: 1 }, symbol: 'none' },
      { name: 'MA10', type: 'line', data: calculateMA(10, data.values), smooth: true, lineStyle: { opacity: 0.5, width: 1 }, symbol: 'none' },
      { name: 'MA20', type: 'line', data: calculateMA(20, data.values), smooth: true, lineStyle: { opacity: 0.5, width: 1 }, symbol: 'none' },
      { name: 'MA60', type: 'line', data: calculateMA(60, data.values), smooth: true, lineStyle: { opacity: 0.5, width: 1 }, symbol: 'none' },
      { name: 'Volume', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: data.volumes }
    ]
  }), [indexConfig])

  // 获取 K 线数据
  const fetchKlineData = useCallback(async (initialDateRange, secid, startDate = '20080101') => {
    setLoading(true)
    try {
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=${startDate}&end=${dayjs().format('YYYYMMDD')}`
      const response = await axios.get(url)
      const rawData = response.data?.data?.klines || []

      if (!rawData.length) {
        message.warning('未获取到K线数据')
        return
      }

      const data = parseKlineData(rawData)
      klineDataRef.current = data
      loadedStartDateRef.current = startDate

      if (chartRef.current) {
        chartRef.current.setOption(createChartOption(data), true)
        setTimeout(() => updateChartBrush(initialDateRange[0], initialDateRange[1]), 100)
      }
    } catch (error) {
      console.error('获取 K 线数据失败:', error)
      message.error('获取 K 线数据失败')
    } finally {
      setLoading(false)
    }
  }, [createChartOption, updateChartBrush])

  // 加载更早的 K 线数据
  const loadEarlierKlineData = useCallback(async (secid) => {
    if (isLoadingMoreRef.current) return
    isLoadingMoreRef.current = true

    try {
      const currentStart = loadedStartDateRef.current
      const newStart = '19900101'
      if (currentStart === newStart) return

      const endDate = dayjs(currentStart).subtract(1, 'day').format('YYYYMMDD')
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=${newStart}&end=${endDate}`

      const response = await axios.get(url)
      const rawData = response.data?.data?.klines || []

      if (!rawData.length) {
        loadedStartDateRef.current = newStart
        return
      }

      const earlierData = parseKlineData(rawData)
      const currentData = klineDataRef.current
      const mergedData = {
        categoryData: [...earlierData.categoryData, ...currentData.categoryData],
        values: [...earlierData.values, ...currentData.values],
        volumes: []
      }
      mergedData.volumes = mergedData.values.map((v, idx) => [
        idx,
        currentData.volumes[idx - earlierData.values.length]?.[1] || earlierData.volumes[idx]?.[1] || 0,
        v[0] > v[1] ? 1 : -1
      ])

      klineDataRef.current = mergedData
      loadedStartDateRef.current = newStart

      if (chartRef.current) {
        chartRef.current.setOption({
          xAxis: [{ data: mergedData.categoryData }, { data: mergedData.categoryData }],
          series: [
            { data: mergedData.values },
            { data: calculateMA(5, mergedData.values) },
            { data: calculateMA(10, mergedData.values) },
            { data: calculateMA(20, mergedData.values) },
            { data: calculateMA(60, mergedData.values) },
            { data: mergedData.volumes }
          ]
        })
        message.success(`已加载更早数据 (${earlierData.categoryData[0]} ~ ${earlierData.categoryData[earlierData.categoryData.length - 1]})`)
      }
    } catch (error) {
      console.error('加载更早数据失败:', error)
    } finally {
      isLoadingMoreRef.current = false
    }
  }, [])

  // 初始化图表
  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = echarts.init(chartContainerRef.current)
    chartRef.current = chart

    chart.on('brushEnd', (params) => {
      if (isUpdatingFromChart.current) return
      
      const areas = params.areas
      if (areas?.length > 0) {
        const range = areas[0].coordRange
        if (range?.length === 2) {
          isUpdatingFromChart.current = true
          
          const categoryData = klineDataRef.current.categoryData
          let startDateStr, endDateStr
          
          if (typeof range[0] === 'number') {
            const startIdx = Math.max(0, Math.round(range[0]))
            const endIdx = Math.min(categoryData.length - 1, Math.round(range[1]))
            startDateStr = categoryData[startIdx]
            endDateStr = categoryData[endIdx]
          } else {
            startDateStr = range[0]
            endDateStr = range[1]
          }
          
          if (startDateStr && endDateStr) {
            const newStartDate = dayjs(startDateStr)
            const newEndDate = dayjs(endDateStr)
            setDateRange([newStartDate, newEndDate])
            calculateIndexChangeRef.current(newStartDate, newEndDate)
          }
          
          setTimeout(() => { isUpdatingFromChart.current = false }, 100)
        }
      }
    })

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    setTimeout(() => chart.resize(), 0)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, []) // 移除依赖，只在组件挂载时初始化一次

  // 初始加载 K 线
  useEffect(() => {
    fetchKlineData(dateRange, indexConfig.secid)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 监听 dateRange 变化更新 URL
  useEffect(() => {
    if (dateRange[0] && dateRange[1]) {
      updateUrlParams({ dateRange })
    }
  }, [dateRange]) // eslint-disable-line react-hooks/exhaustive-deps

  // 市场切换 - 设置对应市场的默认预设
  const handleMarketChange = (newMarket) => {
    setMarket(newMarket)
    // 切换市场时使用该市场的默认预设
    const defaultPreset = marketDefaultPresets[newMarket]
    const newDateRange = defaultPreset.value
    const newSecid = indexConfigs[newMarket].secid
    setDateRange(newDateRange)
    updateUrlParams({ market: newMarket, dateRange: newDateRange })
    // 直接调用，传入新的 secid
    fetchKlineData(newDateRange, newSecid)
  }

  // 日期范围变化（从 Panel 传来）
  const handleDateRangeChange = async (dates) => {
    if (dates?.[0] && dates?.[1]) {
      setDateRange(dates)
      updateUrlParams({ dateRange: dates })
      
      const startStr = dates[0].format('YYYYMMDD')
      if (startStr < loadedStartDateRef.current && !isLoadingMoreRef.current) {
        message.loading({ content: '正在加载更早的K线数据...', key: 'loadMore' })
        await loadEarlierKlineData(indexConfig.secid)
        message.success({ content: '数据加载完成', key: 'loadMore', duration: 1 })
      }
      
      if (!isUpdatingFromChart.current) {
        setTimeout(() => updateChartBrush(dates[0], dates[1]), 100)
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
      {/* K 线图区域 - 放在最上面 */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>{indexConfig.name} K线走势</span>
            {indexChangePct !== null && (
              <Tag color={indexChangePct >= 0 ? 'red' : 'green'} style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>
                {indexChangePct >= 0 ? '+' : ''}{indexChangePct.toFixed(2)}%
              </Tag>
            )}
            <span style={{ fontSize: 12, color: '#999', marginLeft: 'auto' }}>（使用工具栏画笔选择区间）</span>
          </div>
        }
        size="small"
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ position: 'relative' }}>
          {loading && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', zIndex: 10 }}>
              <Spin size="large" />
            </div>
          )}
          <div ref={chartContainerRef} style={{ height: 400 }} />
        </div>
      </Card>

      {/* 查询条件 + 行业分布 + 区间涨幅排行 */}
      <RangeStatsPanel
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        market={market}
        onMarketChange={handleMarketChange}
        showDatePicker={true}
        showMarketSelect={true}
      />
    </div>
  )
}
