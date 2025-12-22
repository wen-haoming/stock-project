import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, DatePicker, Button, Table, Tag, Space, Spin, message, InputNumber, Drawer, Descriptions, Empty, Select } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { createChart } from 'lightweight-charts'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

// 恒生指数配置
const indexConfig = { secid: '100.HSI', name: '恒生指数' }

// 市值预设选项
const marketCapPresets = [
  { label: '微盘股 (<10亿)', mode: 'less', value: 10 },
  { label: '小盘股 (10-50亿)', mode: 'range', min: 10, max: 50 },
  { label: '中小盘 (50-200亿)', mode: 'range', min: 50, max: 200 },
  { label: '中盘股 (200-500亿)', mode: 'range', min: 200, max: 500 },
  { label: '中大盘 (500-1000亿)', mode: 'range', min: 500, max: 1000 },
  { label: '大盘股 (1000-10000亿)', mode: 'range', min: 1000, max: 10000 },
  { label: '超大盘 (>10000亿)', mode: 'greater', value: 10000 },
  { label: '不限', mode: 'range', min: null, max: null },
]

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
  const page = searchParams.get('page')
  const pageSize = searchParams.get('pageSize')

  // 默认市值区间 1000-10000 亿
  const defaultMinCap = 1000
  const defaultMaxCap = 10000

  return {
    dateRange: startDate && endDate 
      ? [dayjs(startDate), dayjs(endDate)]
      : [dayjs('2024-01-01'), dayjs()], // 默认第9波 AI浪潮
    minChangePct: minPct ? parseFloat(minPct) : 60,
    marketCapMode: capMode || 'range',
    marketCapValue: capValue ? parseFloat(capValue) : null,
    minMarketCap: minCap !== null ? (minCap ? parseFloat(minCap) : null) : defaultMinCap,
    maxMarketCap: maxCap !== null ? (maxCap ? parseFloat(maxCap) : null) : defaultMaxCap,
    selectedIndustry: industry || '',
    page: page ? parseInt(page) : 1,
    pageSize: pageSize ? parseInt(pageSize) : 20,
  }
}

export default function RangeStats() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialParams = parseUrlParams(searchParams)
  const isInitialLoad = useRef(true)

  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const candlestickSeriesRef = useRef(null)
  const volumeSeriesRef = useRef(null)
  const isUpdatingFromChart = useRef(false)
  const isChartReady = useRef(false)

  // 抽屉图表
  const drawerChartContainerRef = useRef(null)
  const drawerChartRef = useRef(null)

  const [dateRange, setDateRange] = useState(initialParams.dateRange)
  const [minChangePct, setMinChangePct] = useState(initialParams.minChangePct)
  const [marketCapMode, setMarketCapMode] = useState(initialParams.marketCapMode)
  const [marketCapValue, setMarketCapValue] = useState(initialParams.marketCapValue)
  const [minMarketCap, setMinMarketCap] = useState(initialParams.minMarketCap)
  const [maxMarketCap, setMaxMarketCap] = useState(initialParams.maxMarketCap)
  const [selectedIndustry, setSelectedIndustry] = useState(initialParams.selectedIndustry)
  const [loading, setLoading] = useState(false)
  const [tableLoading, setTableLoading] = useState(false)
  const [allStockData, setAllStockData] = useState([]) // 全部数据
  const [pagination, setPagination] = useState({ 
    current: initialParams.page, 
    pageSize: initialParams.pageSize, 
    total: 0 
  })

  // 抽屉相关状态
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [selectedStock, setSelectedStock] = useState(null)
  const [stockDetailLoading, setStockDetailLoading] = useState(false)
  const [stockNews, setStockNews] = useState([])
  const [industryStats, setIndustryStats] = useState([]) // 行业统计

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
    const page = params.page ?? pagination.current
    const pageSize = params.pageSize ?? pagination.pageSize

    if (start) newParams.set('start', start.format('YYYY-MM-DD'))
    if (end) newParams.set('end', end.format('YYYY-MM-DD'))
    if (pct !== 60) newParams.set('minPct', pct.toString())
    if (capMode !== 'range') newParams.set('capMode', capMode)
    if (capVal != null) newParams.set('capValue', capVal.toString())
    if (minCap != null) newParams.set('minCap', minCap.toString())
    if (maxCap != null) newParams.set('maxCap', maxCap.toString())
    if (industry) newParams.set('industry', industry)
    if (page !== 1) newParams.set('page', page.toString())
    if (pageSize !== 20) newParams.set('pageSize', pageSize.toString())

    setSearchParams(newParams, { replace: true })
  }, [dateRange, minChangePct, marketCapMode, marketCapValue, minMarketCap, maxMarketCap, selectedIndustry, pagination, setSearchParams])

  // 更新图表可见范围
  const updateChartVisibleRange = useCallback((startDate, endDate) => {
    if (!chartRef.current || !isChartReady.current) return
    
    try {
      const from = startDate.format('YYYY-MM-DD')
      const to = endDate.format('YYYY-MM-DD')
      
      chartRef.current.timeScale().setVisibleRange({ from, to })
    } catch (e) {
      console.warn('设置图表范围失败:', e)
    }
  }, [])

  // 获取 K 线数据（获取全量历史数据）
  const fetchKlineData = useCallback(async (initialDateRange) => {
    setLoading(true)
    isChartReady.current = false
    
    try {
      const { secid } = indexConfig
      const start = '19900101'
      const end = dayjs().format('YYYYMMDD')

      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=${start}&end=${end}`

      const response = await axios.get(url)
      const data = response.data?.data?.klines || []

      if (data.length === 0) {
        message.warning('未获取到K线数据')
        return
      }

      const klineData = []
      const volumeData = []

      data.forEach((item) => {
        const fields = item.split(',')
        const time = fields[0]
        const open = parseFloat(fields[1])
        const close = parseFloat(fields[2])
        const high = parseFloat(fields[3])
        const low = parseFloat(fields[4])
        const volume = parseInt(fields[5])

        klineData.push({ time, open, high, low, close })
        volumeData.push({
          time,
          value: volume,
          color: close >= open ? 'rgba(239, 83, 80, 0.5)' : 'rgba(38, 166, 154, 0.5)',
        })
      })

      // 更新图表
      if (candlestickSeriesRef.current && volumeSeriesRef.current) {
        candlestickSeriesRef.current.setData(klineData)
        volumeSeriesRef.current.setData(volumeData)
        
        isChartReady.current = true

        // 设置可见范围到选中的日期区间
        setTimeout(() => {
          updateChartVisibleRange(initialDateRange[0], initialDateRange[1])
        }, 50)
      }
    } catch (error) {
      console.error('获取 K 线数据失败:', error)
      message.error('获取 K 线数据失败')
    } finally {
      setLoading(false)
    }
  }, [updateChartVisibleRange])

  // 获取区间涨幅股票数据（后端返回全部数据，前端分页）
  const fetchStockData = useCallback(async (industry = '') => {
    if (!dateRange[0] || !dateRange[1]) return
    
    setTableLoading(true)
    try {
      // 根据市值筛选模式计算实际的 min/max 值
      let actualMinCap = 0
      let actualMaxCap = 0
      
      if (marketCapMode === 'less' && marketCapValue) {
        actualMaxCap = marketCapValue
      } else if (marketCapMode === 'greater' && marketCapValue) {
        actualMinCap = marketCapValue
      } else if (marketCapMode === 'range') {
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
      if (industry) {
        params.industry = industry
      }
      
      const response = await axios.get('/api/v1/stock/range', { params })

      const result = response.data
      if (result.data) {
        setAllStockData(result.data)
        setPagination((prev) => ({
          ...prev,
          current: 1,
          total: result.total || 0,
        }))
        // 只在没有行业筛选时更新行业统计
        if (!industry) {
          setIndustryStats(result.industryStats || [])
        }
      }
    } catch (error) {
      console.error('获取股票数据失败:', error)
      message.error('获取股票数据失败')
    } finally {
      setTableLoading(false)
    }
  }, [dateRange, minChangePct, marketCapMode, marketCapValue, minMarketCap, maxMarketCap])

  // 获取个股 K 线数据
  const fetchStockKline = async (symbol) => {
    try {
      const start = dayjs().subtract(1, 'year').format('YYYYMMDD')
      const end = dayjs().format('YYYYMMDD')
      
      // 港股 secid 格式: 116.股票代码
      const secid = `116.${symbol}`
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=${start}&end=${end}`

      const response = await axios.get(url)
      const data = response.data?.data?.klines || []

      const klineData = []
      const volumeData = []

      data.forEach((item) => {
        const fields = item.split(',')
        const time = fields[0]
        const open = parseFloat(fields[1])
        const close = parseFloat(fields[2])
        const high = parseFloat(fields[3])
        const low = parseFloat(fields[4])
        const volume = parseInt(fields[5])

        klineData.push({ time, open, high, low, close })
        volumeData.push({
          time,
          value: volume,
          color: close >= open ? 'rgba(239, 83, 80, 0.5)' : 'rgba(38, 166, 154, 0.5)',
        })
      })

      return { klineData, volumeData }
    } catch (error) {
      console.error('获取个股K线失败:', error)
      return { klineData: [], volumeData: [] }
    }
  }

  // 获取个股新闻
  const fetchStockNews = async (symbol, name) => {
    try {
      // 使用东方财富新闻接口
      const url = `https://search-api-web.eastmoney.com/search/jsonp?cb=jQuery&param={"uid":"","keyword":"${encodeURIComponent(name)}","type":["cmsArticleWebOld"],"client":"web","clientType":"web","clientVersion":"curr","param":{"cmsArticleWebOld":{"searchScope":"default","sort":"default","pageIndex":1,"pageSize":10,"preTag":"<em>","postTag":"</em>"}}}`
      
      const response = await axios.get(url)
      const text = response.data
      
      // 解析 JSONP 响应
      const jsonStr = text.replace(/^jQuery\(/, '').replace(/\)$/, '')
      const data = JSON.parse(jsonStr)
      
      const articles = data?.result?.cmsArticleWebOld?.list || []
      return articles.map(item => ({
        title: item.title?.replace(/<\/?em>/g, ''),
        url: item.url,
        date: item.date,
        source: item.mediaName,
      }))
    } catch (error) {
      console.error('获取新闻失败:', error)
      return []
    }
  }

  // 打开股票详情抽屉
  const openStockDetail = async (stock) => {
    setSelectedStock(stock)
    setDrawerVisible(true)
    setStockDetailLoading(true)
    setStockNews([])

    try {
      // 并行获取 K 线和新闻
      const [klineResult, newsResult] = await Promise.all([
        fetchStockKline(stock.symbol),
        fetchStockNews(stock.symbol, stock.name),
      ])

      setStockNews(newsResult)

      // 初始化抽屉图表
      setTimeout(() => {
        if (drawerChartContainerRef.current && klineResult.klineData.length > 0) {
          // 清除旧图表
          if (drawerChartRef.current) {
            drawerChartRef.current.remove()
          }

          const chart = createChart(drawerChartContainerRef.current, {
            width: drawerChartContainerRef.current.clientWidth,
            height: 300,
            layout: {
              background: { type: 'solid', color: '#1a1a2e' },
              textColor: '#d1d4dc',
            },
            grid: {
              vertLines: { color: '#2B2B43' },
              horzLines: { color: '#2B2B43' },
            },
            rightPriceScale: { borderColor: '#2B2B43' },
            timeScale: { borderColor: '#2B2B43', timeVisible: true },
          })

          const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#ef5350',
            downColor: '#26a69a',
            borderDownColor: '#26a69a',
            borderUpColor: '#ef5350',
            wickDownColor: '#26a69a',
            wickUpColor: '#ef5350',
          })

          const volumeSeries = chart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: { type: 'volume' },
            priceScaleId: '',
          })

          chart.priceScale('').applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
          })

          candlestickSeries.setData(klineResult.klineData)
          volumeSeries.setData(klineResult.volumeData)

          drawerChartRef.current = chart
        }
      }, 100)
    } catch (error) {
      console.error('获取股票详情失败:', error)
    } finally {
      setStockDetailLoading(false)
    }
  }

  // 关闭抽屉
  const closeDrawer = () => {
    setDrawerVisible(false)
    if (drawerChartRef.current) {
      drawerChartRef.current.remove()
      drawerChartRef.current = null
    }
  }

  // 初始化图表
  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 450,
      layout: {
        background: { type: 'solid', color: '#1a1a2e' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2B2B43' },
        horzLines: { color: '#2B2B43' },
      },
      crosshair: {
        mode: 1, // Normal crosshair mode
      },
      rightPriceScale: {
        borderColor: '#2B2B43',
      },
      timeScale: {
        borderColor: '#2B2B43',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        minBarSpacing: 3,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    })

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#ef5350',
      downColor: '#26a69a',
      borderDownColor: '#26a69a',
      borderUpColor: '#ef5350',
      wickDownColor: '#26a69a',
      wickUpColor: '#ef5350',
    })

    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    })

    chart.priceScale('').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    // 监听可见范围变化，更新日期选择器
    chart.timeScale().subscribeVisibleTimeRangeChange((timeRange) => {
      if (!timeRange || !isChartReady.current) return
      if (isUpdatingFromChart.current) return
      
      const { from, to } = timeRange
      if (from && to) {
        isUpdatingFromChart.current = true
        setDateRange([dayjs(from), dayjs(to)])
        setTimeout(() => {
          isUpdatingFromChart.current = false
        }, 100)
      }
    })

    chartRef.current = chart
    candlestickSeriesRef.current = candlestickSeries
    volumeSeriesRef.current = volumeSeries

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [])

  // 初始加载 K 线
  useEffect(() => {
    fetchKlineData(dateRange)
  }, [])

  // 如果 URL 有查询参数，初始加载时自动查询
  useEffect(() => {
    if (isInitialLoad.current && searchParams.has('start')) {
      isInitialLoad.current = false
      fetchStockData(initialParams.selectedIndustry)
    }
  }, [])

  // 日期范围变化时更新图表可见范围
  const handleDateRangeChange = (dates) => {
    if (dates && dates[0] && dates[1]) {
      setDateRange(dates)
      // 只有不是从图表触发的才更新图表
      if (!isUpdatingFromChart.current && isChartReady.current) {
        setTimeout(() => {
          updateChartVisibleRange(dates[0], dates[1])
        }, 0)
      }
    }
  }

  // 查询区间涨幅按钮
  const handleSearch = () => {
    setSelectedIndustry('')
    setPagination(prev => ({ ...prev, current: 1 }))
    updateUrlParams({ selectedIndustry: '', page: 1 })
    fetchStockData('')
  }

  // 表格分页变化（前端分页）
  const handleTableChange = (pag) => {
    setPagination(prev => ({ ...prev, current: pag.current, pageSize: pag.pageSize }))
    updateUrlParams({ page: pag.current, pageSize: pag.pageSize })
  }

  // 点击行业标签筛选
  const handleIndustryClick = (industry) => {
    if (selectedIndustry === industry) {
      // 再次点击取消筛选
      setSelectedIndustry('')
      updateUrlParams({ selectedIndustry: '', page: 1 })
      fetchStockData('')
    } else {
      setSelectedIndustry(industry)
      updateUrlParams({ selectedIndustry: industry, page: 1 })
      fetchStockData(industry)
    }
  }

  // 计算当前页显示的数据（前端分页）
  const currentPageData = allStockData.slice(
    (pagination.current - 1) * pagination.pageSize,
    pagination.current * pagination.pageSize
  )

  // 表格列定义
  const columns = [
    {
      title: '排名',
      dataIndex: 'rank',
      width: 70,
      render: (_, __, index) => {
        const rank = (pagination.current - 1) * pagination.pageSize + index + 1
        const color = rank <= 3 ? 'red' : rank <= 10 ? 'orange' : 'default'
        return <Tag color={color}>{rank}</Tag>
      },
    },
    { title: '代码', dataIndex: 'symbol', width: 80 },
    {
      title: '名称',
      dataIndex: 'name',
      width: 120,
      render: (text, record) => (
        <a onClick={() => openStockDetail(record)} style={{ color: '#1677ff' }}>
          {text}
        </a>
      ),
    },
    {
      title: '起始价',
      dataIndex: 'startPrice',
      width: 90,
      align: 'right',
      render: (v) => v?.toFixed(3),
    },
    {
      title: '结束价',
      dataIndex: 'endPrice',
      width: 90,
      align: 'right',
      render: (v) => v?.toFixed(3),
    },
    {
      title: '区间涨幅',
      dataIndex: 'changePct',
      width: 100,
      align: 'right',
      render: (v) => (
        <span style={{ color: v >= 0 ? '#ef5350' : '#26a69a', fontWeight: 'bold' }}>
          {v >= 0 ? '+' : ''}{v?.toFixed(2)}%
        </span>
      ),
    },
    {
      title: '最新价',
      dataIndex: 'latestPrice',
      width: 90,
      align: 'right',
      render: (v) => v?.toFixed(3),
    },
    {
      title: '总市值(亿)',
      dataIndex: 'totalMarketCap',
      width: 100,
      align: 'right',
      render: (v) => v ? (v / 100000000).toFixed(2) : '-',
    },
    {
      title: '市盈率',
      dataIndex: 'peRatio',
      width: 80,
      align: 'right',
      render: (v) => v ? v.toFixed(2) : '-',
    },
    {
      title: '市净率',
      dataIndex: 'pbRatio',
      width: 80,
      align: 'right',
      render: (v) => v ? v.toFixed(2) : '-',
    },
    {
      title: '换手率',
      dataIndex: 'turnoverRate',
      width: 80,
      align: 'right',
      render: (v) => v ? v.toFixed(2) + '%' : '-',
    },
  ]

  // 日期区间预设
  const rangePresets = [
    { label: '── 常用区间 ──', value: [dayjs(), dayjs()] },
    { label: '近1周', value: [dayjs().subtract(7, 'day'), dayjs()] },
    { label: '近1月', value: [dayjs().subtract(1, 'month'), dayjs()] },
    { label: '近3月', value: [dayjs().subtract(3, 'month'), dayjs()] },
    { label: '近6月', value: [dayjs().subtract(6, 'month'), dayjs()] },
    { label: '近1年', value: [dayjs().subtract(1, 'year'), dayjs()] },
    { label: '今年以来', value: [dayjs().startOf('year'), dayjs()] },
    { label: '── 港股历史牛市 ──', value: [dayjs(), dayjs()] },
    { label: '第9波 24.01-至今 AI浪潮', value: [dayjs('2024-01-01'), dayjs()] },
    { label: '第8波 16.02-18.01 南下资金', value: [dayjs('2016-02-01'), dayjs('2018-01-31')] },
    { label: '第7波 03.04-07.10 SARS后', value: [dayjs('2003-04-01'), dayjs('2007-10-31')] },
    { label: '第6波 98.08-00.03 科网泡沫', value: [dayjs('1998-08-01'), dayjs('2000-03-31')] },
    { label: '第5波 95.01-97.08 回归前夕', value: [dayjs('1995-01-01'), dayjs('1997-08-31')] },
    { label: '第4波 87.12-94.01 资金南下', value: [dayjs('1987-12-01'), dayjs('1994-01-31')] },
    { label: '第3波 84.12-87.10 中英声明', value: [dayjs('1984-12-01'), dayjs('1987-10-31')] },
    { label: '第2波 74.12-81.07 经济繁荣', value: [dayjs('1974-12-01'), dayjs('1981-07-31')] },
    { label: '第1波 69.11-73.03 恒指推出', value: [dayjs('1969-11-01'), dayjs('1973-03-31')] },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
      {/* 顶部控制区 */}
      <Card size="small">
        <Space wrap>
          <span>日期区间:</span>
          <RangePicker
            value={dateRange}
            onChange={handleDateRangeChange}
            allowClear={false}
            presets={rangePresets}
          />
          <span>最小涨幅:</span>
          <InputNumber
            value={minChangePct}
            onChange={setMinChangePct}
            min={0}
            max={1000}
            addonAfter="%"
            style={{ width: 120 }}
          />
          <span>市值(亿):</span>
          <Select
            value={(() => {
              // 匹配当前值对应的预设
              const preset = marketCapPresets.find(p => {
                if (p.mode !== marketCapMode) return false
                if (p.mode === 'range') {
                  return p.min === minMarketCap && p.max === maxMarketCap
                }
                return p.value === marketCapValue
              })
              return preset ? marketCapPresets.indexOf(preset) : -1
            })()}
            onChange={(idx) => {
              if (idx === -1) return
              const preset = marketCapPresets[idx]
              setMarketCapMode(preset.mode)
              if (preset.mode === 'range') {
                setMinMarketCap(preset.min)
                setMaxMarketCap(preset.max)
                setMarketCapValue(null)
              } else {
                setMarketCapValue(preset.value)
                setMinMarketCap(null)
                setMaxMarketCap(null)
              }
            }}
            style={{ width: 160 }}
            options={marketCapPresets.map((p, idx) => ({ label: p.label, value: idx }))}
          />
          <Select
            value={marketCapMode}
            onChange={(v) => {
              setMarketCapMode(v)
              setMarketCapValue(null)
              setMinMarketCap(null)
              setMaxMarketCap(null)
            }}
            style={{ width: 80 }}
            options={[
              { label: '小于', value: 'less' },
              { label: '大于', value: 'greater' },
              { label: '区间', value: 'range' },
            ]}
          />
          {marketCapMode === 'range' ? (
            <>
              <InputNumber
                value={minMarketCap}
                onChange={setMinMarketCap}
                min={0}
                placeholder="最小"
                style={{ width: 90 }}
              />
              <span>~</span>
              <InputNumber
                value={maxMarketCap}
                onChange={setMaxMarketCap}
                min={0}
                placeholder="最大"
                style={{ width: 90 }}
              />
            </>
          ) : (
            <InputNumber
              value={marketCapValue}
              onChange={setMarketCapValue}
              min={0}
              placeholder={marketCapMode === 'less' ? '小于此值' : '大于此值'}
              style={{ width: 100 }}
            />
          )}
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleSearch}
            loading={tableLoading}
          >
            查询区间涨幅
          </Button>
        </Space>
      </Card>

      {/* K 线图区域 */}
      <Card
        title={`${indexConfig.name} K线走势（拖动图表或修改日期选择区间）`}
        size="small"
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ position: 'relative' }}>
          {loading && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.5)',
              zIndex: 10,
            }}>
              <Spin size="large" />
            </div>
          )}
          <div ref={chartContainerRef} style={{ height: 450 }} />
        </div>
      </Card>

      {/* 行业统计 */}
      {industryStats.length > 0 && (
        <Card 
          title={
            <Space>
              <span>行业分布统计</span>
              {selectedIndustry && (
                <Tag color="red" closable onClose={() => handleIndustryClick(selectedIndustry)}>
                  当前筛选: {selectedIndustry}
                </Tag>
              )}
            </Space>
          } 
          size="small"
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {industryStats.map((item) => (
              <Tag 
                key={item.name} 
                color={selectedIndustry === item.name ? 'red' : 'blue'} 
                style={{ margin: 0, cursor: 'pointer' }}
                onClick={() => handleIndustryClick(item.name)}
              >
                {item.name}: {item.count}
              </Tag>
            ))}
          </div>
        </Card>
      )}

      {/* 股票表格区域 */}
      <Card
        title={
          <Space>
            <span>区间涨幅排行 ({dateRange[0]?.format('YYYY-MM-DD')} ~ {dateRange[1]?.format('YYYY-MM-DD')})</span>
            {pagination.total > 0 && <Tag color="blue">共 {pagination.total} 只股票</Tag>}
          </Space>
        }
        size="small"
        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        styles={{ body: { flex: 1, overflow: 'auto', padding: 0 } }}
      >
        <Table
          columns={columns}
          dataSource={currentPageData}
          rowKey="symbol"
          loading={tableLoading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          onChange={handleTableChange}
          size="small"
          scroll={{ x: 1000 }}
        />
      </Card>

      {/* 股票详情抽屉 */}
      <Drawer
        title={selectedStock ? `${selectedStock.name} (${selectedStock.symbol})` : '股票详情'}
        placement="right"
        width={600}
        onClose={closeDrawer}
        open={drawerVisible}
      >
        <Spin spinning={stockDetailLoading}>
          {selectedStock && (
            <div>
              {/* 基本信息 */}
              <Descriptions title="基本信息" column={2} size="small" bordered>
                <Descriptions.Item label="代码">{selectedStock.symbol}</Descriptions.Item>
                <Descriptions.Item label="名称">{selectedStock.name}</Descriptions.Item>
                <Descriptions.Item label="最新价">{selectedStock.latestPrice?.toFixed(3)}</Descriptions.Item>
                <Descriptions.Item label="区间涨幅">
                  <span style={{ color: selectedStock.changePct >= 0 ? '#ef5350' : '#26a69a', fontWeight: 'bold' }}>
                    {selectedStock.changePct >= 0 ? '+' : ''}{selectedStock.changePct?.toFixed(2)}%
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="起始价">{selectedStock.startPrice?.toFixed(3)}</Descriptions.Item>
                <Descriptions.Item label="结束价">{selectedStock.endPrice?.toFixed(3)}</Descriptions.Item>
                <Descriptions.Item label="总市值">{selectedStock.totalMarketCap ? (selectedStock.totalMarketCap / 100000000).toFixed(2) + '亿' : '-'}</Descriptions.Item>
                <Descriptions.Item label="市盈率">{selectedStock.peRatio?.toFixed(2) || '-'}</Descriptions.Item>
                <Descriptions.Item label="市净率">{selectedStock.pbRatio?.toFixed(2) || '-'}</Descriptions.Item>
                <Descriptions.Item label="换手率">{selectedStock.turnoverRate ? selectedStock.turnoverRate.toFixed(2) + '%' : '-'}</Descriptions.Item>
                <Descriptions.Item label="行业" span={2}>{selectedStock.industry || '-'}</Descriptions.Item>
              </Descriptions>

              {/* K 线图 */}
              <Card title="近一年走势" size="small" style={{ marginTop: 16 }} styles={{ body: { padding: 0 } }}>
                <div ref={drawerChartContainerRef} style={{ height: 300 }} />
              </Card>

              {/* 相关新闻 */}
              <Card title="相关新闻" size="small" style={{ marginTop: 16 }}>
                {stockNews.length > 0 ? (
                  <div style={{ maxHeight: 300, overflow: 'auto' }}>
                    {stockNews.map((news, index) => (
                      <div key={index} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f0f0f0' }}>
                        <a
                          href={news.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#1677ff', fontSize: 14 }}
                        >
                          {news.title}
                        </a>
                        <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                          {news.source} · {news.date}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty description="暂无相关新闻" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Card>
            </div>
          )}
        </Spin>
      </Drawer>
    </div>
  )
}
