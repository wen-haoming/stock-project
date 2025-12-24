import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Card, DatePicker, Button, Table, Tag, Spin, message, InputNumber, Select, Grid, Space } from 'antd'
import { SearchOutlined, DownloadOutlined, CopyOutlined, CameraOutlined } from '@ant-design/icons'
import * as echarts from 'echarts'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import StockDetailDrawer from './StockDetailDrawer'
import IndexMobile from './IndexMobile'

const { RangePicker } = DatePicker
const { useBreakpoint } = Grid

// 恒生指数配置
const indexConfig = { secid: '100.HSI', name: '恒生指数' }

// ECharts 颜色配置
const upColor = '#ec5a5a'
const downColor = '#47b262'

// 计算均线 - 移到组件外避免重复创建
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

// 解析 K 线原始数据 - 移到组件外
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

// 从 URL 参数解析初始值
const parseUrlParams = (searchParams) => {
  const startDate = searchParams.get('start')
  const endDate = searchParams.get('end')
  const minPct = searchParams.get('minPct')
  const capMode = searchParams.get('capMode')
  const capValue = searchParams.get('capValue')
  const minCap = searchParams.get('minCap')
  const maxCap = searchParams.get('maxCap')
  const industry = searchParams.get('industry')

  return {
    dateRange: startDate && endDate 
      ? [dayjs(startDate), dayjs(endDate)]
      : [dayjs('2024-01-02'), dayjs().subtract(1, 'day')],
    minChangePct: minPct ? parseFloat(minPct) : 60,
    marketCapMode: capMode || 'range',
    marketCapValue: capValue ? parseFloat(capValue) : null,
    minMarketCap: minCap !== null ? (minCap ? parseFloat(minCap) : null) : 20,
    maxMarketCap: maxCap !== null ? (maxCap ? parseFloat(maxCap) : null) : 1000,
    selectedIndustry: industry || '',
  }
}

// 日期区间预设 - 移到组件外避免重复创建
const rangePresets = [
  { label: '── 常用区间 ──', value: [dayjs(), dayjs()] },
  { label: '近1周', value: [dayjs().subtract(7, 'day'), dayjs().subtract(1, 'day')] },
  { label: '近1月', value: [dayjs().subtract(1, 'month'), dayjs().subtract(1, 'day')] },
  { label: '近3月', value: [dayjs().subtract(3, 'month'), dayjs().subtract(1, 'day')] },
  { label: '近6月', value: [dayjs().subtract(6, 'month'), dayjs().subtract(1, 'day')] },
  { label: '近1年', value: [dayjs().subtract(1, 'year'), dayjs().subtract(1, 'day')] },
  { label: '今年以来', value: [dayjs().startOf('year'), dayjs().subtract(1, 'day')] },
  { label: '── 港股历史牛市 ──', value: [dayjs(), dayjs()] },
  { label: '第9波 24.01-至今 AI浪潮', value: [dayjs('2024-01-02'), dayjs().subtract(1, 'day')] },
  { label: '第8波 16.02-18.01 南下资金', value: [dayjs('2016-02-01'), dayjs('2018-01-31')] },
  { label: '第7波 03.04-07.10 SARS后', value: [dayjs('2003-04-01'), dayjs('2007-10-31')] },
]

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
  const isInitialLoad = useRef(true)

  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const tableCardRef = useRef(null)
  const klineDataRef = useRef({ categoryData: [], values: [], volumes: [] })
  const isUpdatingFromChart = useRef(false)
  const loadedStartDateRef = useRef('20080101')
  const isLoadingMoreRef = useRef(false)

  const [dateRange, setDateRange] = useState(initialParams.dateRange)
  const [minChangePct, setMinChangePct] = useState(initialParams.minChangePct)
  const [marketCapMode, setMarketCapMode] = useState(initialParams.marketCapMode)
  const [marketCapValue, setMarketCapValue] = useState(initialParams.marketCapValue)
  const [minMarketCap, setMinMarketCap] = useState(initialParams.minMarketCap)
  const [maxMarketCap, setMaxMarketCap] = useState(initialParams.maxMarketCap)
  const [selectedIndustry, setSelectedIndustry] = useState(initialParams.selectedIndustry)
  const [loading, setLoading] = useState(false)
  const [tableLoading, setTableLoading] = useState(false)
  const [allStockData, setAllStockData] = useState([])
  const [industryStats, setIndustryStats] = useState([])
  const [indexChangePct, setIndexChangePct] = useState(null)

  // 抽屉状态
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [selectedStock, setSelectedStock] = useState(null)

  const isMobile = false // PC 端固定为 false

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
    const pct = params.minChangePct ?? minChangePct
    const capMode = params.marketCapMode ?? marketCapMode
    const capVal = params.marketCapValue ?? marketCapValue
    const minCap = params.minMarketCap ?? minMarketCap
    const maxCap = params.maxMarketCap ?? maxMarketCap
    const industry = params.selectedIndustry ?? selectedIndustry

    if (start) newParams.set('start', start.format('YYYY-MM-DD'))
    if (end) newParams.set('end', end.format('YYYY-MM-DD'))
    if (pct !== 60) newParams.set('minPct', pct.toString())
    if (capMode !== 'range') newParams.set('capMode', capMode)
    if (capVal != null) newParams.set('capValue', capVal.toString())
    if (minCap != null) newParams.set('minCap', minCap.toString())
    if (maxCap != null) newParams.set('maxCap', maxCap.toString())
    if (industry) newParams.set('industry', industry)

    setSearchParams(newParams, { replace: true })
  }, [dateRange, minChangePct, marketCapMode, marketCapValue, minMarketCap, maxMarketCap, selectedIndustry, setSearchParams])

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
      right: isMobile ? 5 : 10,
      orient: 'vertical',
      data: isMobile ? [indexConfig.name] : [indexConfig.name, 'MA5', 'MA10', 'MA20', 'MA60'],
      textStyle: { fontSize: isMobile ? 10 : 12 }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      borderWidth: 1,
      borderColor: '#ccc',
      padding: isMobile ? 5 : 10,
      textStyle: { fontSize: isMobile ? 10 : 12 },
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
    toolbox: { feature: { brush: { type: ['lineX', 'clear'] } }, right: isMobile ? 5 : 10, itemSize: isMobile ? 12 : 15 },
    brush: { xAxisIndex: 'all', brushLink: 'all', outOfBrush: { colorAlpha: 1 } },
    visualMap: { show: false, seriesIndex: 6, dimension: 2, pieces: [{ value: 1, color: downColor }, { value: -1, color: upColor }] },
    grid: [
      { left: isMobile ? 40 : 60, right: isMobile ? 50 : 80, top: isMobile ? 5 : 10, bottom: isMobile ? '30%' : '25%' },
      { left: isMobile ? 40 : 60, right: isMobile ? 50 : 80, top: isMobile ? '75%' : '78%', bottom: isMobile ? 20 : 30 }
    ],
    xAxis: [
      { type: 'category', data: data.categoryData, boundaryGap: false, axisLine: { onZero: false }, splitLine: { show: false }, min: 'dataMin', max: 'dataMax', axisPointer: { z: 100 }, axisLabel: { fontSize: isMobile ? 9 : 12 } },
      { type: 'category', gridIndex: 1, data: data.categoryData, boundaryGap: false, axisLine: { onZero: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, min: 'dataMin', max: 'dataMax' }
    ],
    yAxis: [
      { scale: true, splitArea: { show: true }, axisLabel: { fontSize: isMobile ? 9 : 12 } },
      { scale: true, gridIndex: 1, splitNumber: 2, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } }
    ],
    dataZoom: [{ type: 'inside', xAxisIndex: [0, 1], startValue: dayjs().startOf('year').format('YYYY-MM-DD'), end: 100 }],
    series: [
      { name: indexConfig.name, type: 'candlestick', data: data.values, itemStyle: { color: upColor, color0: downColor, borderColor: upColor, borderColor0: downColor, borderWidth: 1 } },
      { name: 'MA5', type: 'line', data: calculateMA(5, data.values), smooth: true, lineStyle: { opacity: 0.5, width: 1 }, symbol: 'none', show: !isMobile },
      { name: 'MA10', type: 'line', data: calculateMA(10, data.values), smooth: true, lineStyle: { opacity: 0.5, width: 1 }, symbol: 'none', show: !isMobile },
      { name: 'MA20', type: 'line', data: calculateMA(20, data.values), smooth: true, lineStyle: { opacity: 0.5, width: 1 }, symbol: 'none', show: !isMobile },
      { name: 'MA60', type: 'line', data: calculateMA(60, data.values), smooth: true, lineStyle: { opacity: 0.5, width: 1 }, symbol: 'none', show: !isMobile },
      { name: 'Volume', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: data.volumes }
    ]
  }), [isMobile])

  // 获取 K 线数据
  const fetchKlineData = useCallback(async (initialDateRange, startDate = '20080101') => {
    setLoading(true)
    try {
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${indexConfig.secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=${startDate}&end=${dayjs().format('YYYYMMDD')}`
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
  const loadEarlierKlineData = useCallback(async () => {
    if (isLoadingMoreRef.current) return
    isLoadingMoreRef.current = true

    try {
      const currentStart = loadedStartDateRef.current
      const newStart = '19900101'
      if (currentStart === newStart) return

      const endDate = dayjs(currentStart).subtract(1, 'day').format('YYYYMMDD')
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${indexConfig.secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=${newStart}&end=${endDate}`

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

  // 获取区间涨幅股票数据
  const fetchStockData = useCallback(async (industry = '') => {
    if (!dateRange[0] || !dateRange[1]) return
    
    setTableLoading(true)
    try {
      let actualMinCap = 0, actualMaxCap = 0
      
      if (marketCapMode === 'less' && marketCapValue) actualMaxCap = marketCapValue
      else if (marketCapMode === 'greater' && marketCapValue) actualMinCap = marketCapValue
      else if (marketCapMode === 'range') {
        actualMinCap = minMarketCap || 0
        actualMaxCap = maxMarketCap || 0
      }
      
      const params = {
        start_date: dateRange[0].format('YYYYMMDD'),
        end_date: dateRange[1].format('YYYYMMDD'),
        min_change_pct: minChangePct,
        min_market_cap: actualMinCap,
        max_market_cap: actualMaxCap,
      }
      if (industry) params.industry = industry
      
      const response = await axios.get('/api/v1/stock/range', { params })
      const result = response.data
      
      if (result.data) {
        setAllStockData(result.data)
        if (!industry) setIndustryStats(result.industryStats || [])
      }
    } catch (error) {
      console.error('获取股票数据失败:', error)
      message.error('获取股票数据失败')
    } finally {
      setTableLoading(false)
    }
  }, [dateRange, minChangePct, marketCapMode, marketCapValue, minMarketCap, maxMarketCap])

  // 打开股票详情
  const openStockDetail = useCallback((stock) => {
    setSelectedStock(stock)
    setDrawerVisible(true)
  }, [])

  // 关闭抽屉
  const closeDrawer = useCallback(() => {
    setDrawerVisible(false)
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
  }, [])

  // 响应式变化时重新调整图表大小
  useEffect(() => {
    if (chartRef.current) setTimeout(() => chartRef.current.resize(), 100)
  }, [isMobile])

  // 初始加载 K 线
  useEffect(() => {
    fetchKlineData(dateRange)
  }, [])

  // URL 有查询参数时自动查询
  useEffect(() => {
    if (isInitialLoad.current && searchParams.has('start')) {
      isInitialLoad.current = false
      fetchStockData(initialParams.selectedIndustry)
    }
  }, [])

  // 日期范围变化
  const handleDateRangeChange = async (dates) => {
    if (dates?.[0] && dates?.[1]) {
      setDateRange(dates)
      
      const startStr = dates[0].format('YYYYMMDD')
      if (startStr < loadedStartDateRef.current && !isLoadingMoreRef.current) {
        message.loading({ content: '正在加载更早的K线数据...', key: 'loadMore' })
        await loadEarlierKlineData()
        message.success({ content: '数据加载完成', key: 'loadMore', duration: 1 })
      }
      
      if (!isUpdatingFromChart.current) {
        setTimeout(() => updateChartBrush(dates[0], dates[1]), 100)
      }
    }
  }

  const handleSearch = () => {
    setSelectedIndustry('')
    updateUrlParams({ selectedIndustry: '' })
    fetchStockData('')
  }

  const handleTableChange = (pag, filters, sorter) => {
    // 处理排序
    if (sorter.field && sorter.order) {
      const sorted = [...allStockData].sort((a, b) => {
        const aVal = a[sorter.field] || 0
        const bVal = b[sorter.field] || 0
        if (typeof aVal === 'string') {
          return sorter.order === 'ascend' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
        }
        return sorter.order === 'ascend' ? aVal - bVal : bVal - aVal
      })
      setAllStockData(sorted)
    }
  }

  const handleIndustryClick = (industry) => {
    if (selectedIndustry === industry) {
      setSelectedIndustry('')
      updateUrlParams({ selectedIndustry: '' })
      fetchStockData('')
    } else {
      setSelectedIndustry(industry)
      updateUrlParams({ selectedIndustry: industry })
      fetchStockData(industry)
    }
  }

  const handleMarketCapModeChange = (v) => {
    setMarketCapMode(v)
    if (v === 'range') {
      setMinMarketCap(20)
      setMaxMarketCap(500)
      setMarketCapValue(null)
    } else if (v === 'less') {
      setMarketCapValue(50)
      setMinMarketCap(null)
      setMaxMarketCap(null)
    } else if (v === 'greater') {
      setMarketCapValue(1000)
      setMinMarketCap(null)
      setMaxMarketCap(null)
    } else {
      setMarketCapValue(null)
      setMinMarketCap(null)
      setMaxMarketCap(null)
    }
  }

  // 生成查询条件标题
  const getQueryTitle = useCallback(() => {
    const parts = [`区间涨幅排行 ${dateRange[0]?.format('YYYY-MM-DD')} ~ ${dateRange[1]?.format('YYYY-MM-DD')}`]
    parts.push(`涨幅≥${minChangePct}%`)
    if (marketCapMode === 'range' && (minMarketCap || maxMarketCap)) {
      parts.push(`市值${minMarketCap || 0}~${maxMarketCap || '不限'}亿`)
    } else if (marketCapMode === 'greater' && marketCapValue) {
      parts.push(`市值>${marketCapValue}亿`)
    } else if (marketCapMode === 'less' && marketCapValue) {
      parts.push(`市值<${marketCapValue}亿`)
    }
    if (selectedIndustry) parts.push(`行业:${selectedIndustry}`)
    return parts.join(' | ')
  }, [dateRange, minChangePct, marketCapMode, marketCapValue, minMarketCap, maxMarketCap, selectedIndustry])

  // 导出 Excel
  const handleExportExcel = useCallback(() => {
    if (!allStockData.length) {
      message.warning('没有数据可导出')
      return
    }

    const title = getQueryTitle()
    const exportData = allStockData.map((item, index) => ({
      '排名': index + 1,
      '代码': item.symbol,
      '名称': item.name,
      '起始价': item.startPrice?.toFixed(3),
      '结束价': item.endPrice?.toFixed(3),
      '涨幅(%)': item.changePct?.toFixed(2),
      '现价': item.latestPrice?.toFixed(2),
      '市值(亿)': item.totalMarketCap ? (item.totalMarketCap / 100000000).toFixed(2) : '-',
      '市盈率': item.peRatio?.toFixed(2) || '-',
      '市净率': item.pbRatio?.toFixed(2) || '-',
      '换手率(%)': item.turnoverRate?.toFixed(2) || '-',
    }))

    const ws = XLSX.utils.json_to_sheet([])
    // 添加标题行
    XLSX.utils.sheet_add_aoa(ws, [[title]], { origin: 'A1' })
    // 添加空行
    XLSX.utils.sheet_add_aoa(ws, [[]], { origin: 'A2' })
    // 添加数据
    XLSX.utils.sheet_add_json(ws, exportData, { origin: 'A3' })
    
    // 合并标题单元格
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }]
    
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '区间涨幅')
    
    const fileName = `区间涨幅_${dateRange[0]?.format('YYYYMMDD')}_${dateRange[1]?.format('YYYYMMDD')}.xlsx`
    XLSX.writeFile(wb, fileName)
    message.success('导出成功')
  }, [allStockData, dateRange, getQueryTitle])

  // 复制到剪贴板
  const handleCopy = useCallback(async () => {
    if (!allStockData.length) {
      message.warning('没有数据可复制')
      return
    }

    const title = getQueryTitle()
    const header = ['排名', '代码', '名称', '起始价', '结束价', '涨幅(%)', '现价', '市值(亿)', '市盈率', '市净率', '换手率(%)'].join('\t')
    const rows = allStockData.map((item, index) => [
      index + 1,
      item.symbol,
      item.name,
      item.startPrice?.toFixed(3),
      item.endPrice?.toFixed(3),
      item.changePct?.toFixed(2),
      item.latestPrice?.toFixed(2),
      item.totalMarketCap ? (item.totalMarketCap / 100000000).toFixed(2) : '-',
      item.peRatio?.toFixed(2) || '-',
      item.pbRatio?.toFixed(2) || '-',
      item.turnoverRate?.toFixed(2) || '-',
    ].join('\t'))

    const text = [title, '', header, ...rows].join('\n')
    
    try {
      await navigator.clipboard.writeText(text)
      message.success(`已复制 ${allStockData.length} 条数据`)
    } catch {
      message.error('复制失败，请手动复制')
    }
  }, [allStockData, getQueryTitle])

  // 截图功能
  const handleScreenshot = useCallback(async () => {
    if (!tableCardRef.current || !allStockData.length) {
      message.warning('没有数据可截图')
      return
    }

    const hide = message.loading('正在生成截图...', 0)
    
    try {
      const canvas = await html2canvas(tableCardRef.current, {
        backgroundColor: '#fff',
        scale: 2,
        useCORS: true,
        logging: false,
      })
      
      const link = document.createElement('a')
      link.download = `区间涨幅_${dateRange[0]?.format('YYYYMMDD')}_${dateRange[1]?.format('YYYYMMDD')}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      
      hide()
      message.success('截图已保存')
    } catch (error) {
      hide()
      console.error('截图失败:', error)
      message.error('截图失败')
    }
  }, [allStockData, dateRange])

  // 表格列定义 - 使用 useMemo 优化
  const columns = useMemo(() => [
    {
      title: '#',
      dataIndex: 'rank',
      width: isMobile ? 36 : 60,
      fixed: 'left',
      render: (_, __, index) => {
        const rank = index + 1
        const color = rank <= 3 ? 'red' : rank <= 10 ? 'orange' : 'default'
        return <Tag color={color} style={{ margin: 0, fontSize: isMobile ? 10 : 12 }}>{rank}</Tag>
      },
    },
    { title: '代码', dataIndex: 'symbol', width: 70, responsive: ['md'], sorter: (a, b) => a.symbol.localeCompare(b.symbol) },
    {
      title: '名称',
      dataIndex: 'name',
      width: isMobile ? 60 : 100,
      fixed: 'left',
      ellipsis: true,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (text, record) => (
        <a onClick={() => openStockDetail(record)} style={{ color: '#1677ff', fontSize: isMobile ? 12 : 14 }}>{text}</a>
      ),
    },
    { title: '起始价', dataIndex: 'startPrice', width: 80, align: 'right', responsive: ['lg'], sorter: (a, b) => (a.startPrice || 0) - (b.startPrice || 0), render: (v) => v?.toFixed(3) },
    { title: '结束价', dataIndex: 'endPrice', width: 80, align: 'right', responsive: ['lg'], sorter: (a, b) => (a.endPrice || 0) - (b.endPrice || 0), render: (v) => v?.toFixed(3) },
    {
      title: '涨幅',
      dataIndex: 'changePct',
      width: isMobile ? 60 : 90,
      align: 'right',
      sorter: (a, b) => (a.changePct || 0) - (b.changePct || 0),
      defaultSortOrder: 'descend',
      render: (v) => <span style={{ color: v >= 0 ? '#ec5a5a' : '#47b262', fontWeight: 'bold', fontSize: isMobile ? 12 : 14 }}>{v >= 0 ? '+' : ''}{v?.toFixed(1)}%</span>,
    },
    { title: '现价', dataIndex: 'latestPrice', width: isMobile ? 50 : 70, align: 'right', sorter: (a, b) => (a.latestPrice || 0) - (b.latestPrice || 0), render: (v) => <span style={{ fontSize: isMobile ? 11 : 14 }}>{v?.toFixed(2)}</span> },
    { title: '市值', dataIndex: 'totalMarketCap', width: isMobile ? 50 : 80, align: 'right', sorter: (a, b) => (a.totalMarketCap || 0) - (b.totalMarketCap || 0), render: (v) => <span style={{ fontSize: isMobile ? 11 : 14 }}>{v ? (v / 100000000).toFixed(0) : '-'}</span> },
    { title: '市盈率', dataIndex: 'peRatio', width: 70, align: 'right', responsive: ['lg'], sorter: (a, b) => (a.peRatio || 0) - (b.peRatio || 0), render: (v) => v ? v.toFixed(2) : '-' },
    { title: '市净率', dataIndex: 'pbRatio', width: 70, align: 'right', responsive: ['xl'], sorter: (a, b) => (a.pbRatio || 0) - (b.pbRatio || 0), render: (v) => v ? v.toFixed(2) : '-' },
    { title: '换手率', dataIndex: 'turnoverRate', width: 70, align: 'right', responsive: ['xl'], sorter: (a, b) => (a.turnoverRate || 0) - (b.turnoverRate || 0), render: (v) => v ? v.toFixed(2) + '%' : '-' },
  ], [isMobile, openStockDetail])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: isMobile ? 4 : 16, padding: isMobile ? 4 : 0 }}>
      {/* 顶部控制区 */}
      <Card size="small" styles={{ body: { padding: isMobile ? 8 : 12 } }}>
        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <RangePicker value={dateRange} onChange={handleDateRangeChange} allowClear={false} presets={rangePresets} size="small" style={{ width: '100%' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                <span style={{ fontSize: 12, color: '#666', flexShrink: 0 }}>涨幅≥</span>
                <InputNumber value={minChangePct} onChange={setMinChangePct} min={0} max={1000} suffix="%" size="small" style={{ flex: 1, minWidth: 60 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                <span style={{ fontSize: 12, color: '#666', flexShrink: 0 }}>市值</span>
                <Select value={marketCapMode} onChange={handleMarketCapModeChange} size="small" style={{ flex: 1, minWidth: 60 }} options={[{ label: '区间', value: 'range' }, { label: '大于', value: 'greater' }, { label: '小于', value: 'less' }, { label: '不限', value: 'none' }]} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {marketCapMode === 'range' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                  <InputNumber value={minMarketCap} onChange={setMinMarketCap} min={0} size="small" style={{ flex: 1 }} placeholder="最小" suffix="亿" />
                  <span style={{ fontSize: 12, color: '#999' }}>~</span>
                  <InputNumber value={maxMarketCap} onChange={setMaxMarketCap} min={0} size="small" style={{ flex: 1 }} placeholder="最大" suffix="亿" />
                </div>
              )}
              {(marketCapMode === 'less' || marketCapMode === 'greater') && (
                <InputNumber value={marketCapValue} onChange={setMarketCapValue} min={0} size="small" style={{ flex: 1 }} placeholder={marketCapMode === 'less' ? '小于' : '大于'} suffix="亿" />
              )}
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={tableLoading} size="small" style={{ flexShrink: 0 }}>查询</Button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14 }}>日期:</span>
              <RangePicker value={dateRange} onChange={handleDateRangeChange} allowClear={false} presets={rangePresets} size="middle" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14 }}>涨幅:</span>
              <InputNumber value={minChangePct} onChange={setMinChangePct} min={0} max={1000} suffix="%" style={{ width: 90 }} />
              <span style={{ fontSize: 14 }}>市值:</span>
              <Select value={marketCapMode} onChange={handleMarketCapModeChange} style={{ width: 80 }} options={[{ label: '区间', value: 'range' }, { label: '大于', value: 'greater' }, { label: '小于', value: 'less' }, { label: '不限', value: 'none' }]} />
              {marketCapMode === 'range' && (
                <>
                  <InputNumber value={minMarketCap} onChange={setMinMarketCap} min={0} placeholder="最小" style={{ width: 80 }} />
                  <span>~</span>
                  <InputNumber value={maxMarketCap} onChange={setMaxMarketCap} min={0} placeholder="最大" style={{ width: 80 }} />
                </>
              )}
              {(marketCapMode === 'less' || marketCapMode === 'greater') && (
                <InputNumber value={marketCapValue} onChange={setMarketCapValue} min={0} placeholder={marketCapMode === 'less' ? '小于' : '大于'} style={{ width: 100 }} />
              )}
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={tableLoading}>查询区间涨幅</Button>
            </div>
          </div>
        )}
      </Card>

      {/* K 线图区域 */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{isMobile ? indexConfig.name : `${indexConfig.name} K线走势（使用工具栏画笔选择区间）`}</span>
            {indexChangePct !== null && (
              <Tag color={indexChangePct >= 0 ? 'red' : 'green'} style={{ margin: 0, fontWeight: 'bold', fontSize: isMobile ? 11 : 13 }}>
                {indexChangePct >= 0 ? '+' : ''}{indexChangePct.toFixed(2)}%
              </Tag>
            )}
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
          <div ref={chartContainerRef} style={{ height: isMobile ? 180 : 500 }} />
        </div>
      </Card>

      {/* 行业统计 */}
      {industryStats.length > 0 && (
        <Card 
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: isMobile ? 12 : 14 }}>行业分布</span>
              {selectedIndustry && (
                <Tag color="red" closable onClose={() => handleIndustryClick(selectedIndustry)} style={{ fontSize: 11, margin: 0 }}>{selectedIndustry}</Tag>
              )}
            </div>
          } 
          size="small"
          styles={{ body: { padding: isMobile ? 6 : 12 } }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 3 : 8 }}>
            {industryStats.map((item) => (
              <Tag key={item.name} color={selectedIndustry === item.name ? 'red' : 'blue'} style={{ margin: 0, cursor: 'pointer', fontSize: isMobile ? 10 : 12, padding: isMobile ? '0 4px' : undefined }} onClick={() => handleIndustryClick(item.name)}>
                {item.name}: {item.count}
              </Tag>
            ))}
          </div>
        </Card>
      )}

      {/* 股票表格区域 */}
      <Card
        ref={tableCardRef}
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: isMobile ? 12 : 14 }}>
                {isMobile ? `涨幅榜 ${dateRange[0]?.format('MM-DD')}~${dateRange[1]?.format('MM-DD')}` : getQueryTitle()}
              </span>
              {allStockData.length > 0 && <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>共{allStockData.length}只</Tag>}
            </div>
            {!isMobile && allStockData.length > 0 && (
              <Space size="small">
                <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>复制</Button>
                <Button size="small" icon={<DownloadOutlined />} onClick={handleExportExcel}>导出Excel</Button>
                <Button size="small" icon={<CameraOutlined />} onClick={handleScreenshot}>截图</Button>
              </Space>
            )}
          </div>
        }
        size="small"
        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        styles={{ body: { flex: 1, overflow: 'auto', padding: 0 } }}
      >
        <Table
          columns={columns}
          dataSource={allStockData}
          rowKey="symbol"
          loading={tableLoading}
          pagination={false}
          onChange={handleTableChange}
          size="small"
          scroll={{ x: isMobile ? 280 : 800, y: 'calc(100vh - 280px)' }}
          sticky
        />
      </Card>

      {/* 股票详情抽屉 */}
      <StockDetailDrawer visible={drawerVisible} stock={selectedStock} onClose={closeDrawer} />
    </div>
  )
}
