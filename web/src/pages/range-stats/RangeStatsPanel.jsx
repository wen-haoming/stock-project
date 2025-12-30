import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Card, DatePicker, Button, Tag, message, InputNumber, Select, Grid, Space, Spin } from 'antd'
import { SearchOutlined, DownloadOutlined, CopyOutlined, CameraOutlined } from '@ant-design/icons'
import { ListTable } from '@visactor/react-vtable'
import axios from 'axios'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import StockDetailDrawer from './StockDetailDrawer'
import { useTheme, getVTableTheme } from '../../contexts/ThemeContext'

const { RangePicker } = DatePicker
const { useBreakpoint } = Grid

// 市场配置
const marketOptions = [
  { label: '港股', value: 'hk' },
  { label: 'A股', value: 'a' },
]

// 市场默认预设配置
const marketDefaultPresets = {
  hk: { label: '24.01-至今 AI浪潮', value: [dayjs('2024-01-02'), dayjs().subtract(1, 'day')] },
  a: { label: '24.09-至今 政策牛', value: [dayjs('2024-09-24'), dayjs().subtract(1, 'day')] },
}

// 获取日期预设
const getDatePresets = (market) => {
  const commonPresets = [
    { label: '近1周', value: [dayjs().subtract(7, 'day'), dayjs().subtract(1, 'day')] },
    { label: '近2周', value: [dayjs().subtract(14, 'day'), dayjs().subtract(1, 'day')] },
    { label: '近1月', value: [dayjs().subtract(1, 'month'), dayjs().subtract(1, 'day')] },
    { label: '近半年', value: [dayjs().subtract(6, 'month'), dayjs().subtract(1, 'day')] },
    { label: '近1年', value: [dayjs().subtract(1, 'year'), dayjs().subtract(1, 'day')] },
    { label: '近2年', value: [dayjs().subtract(2, 'year'), dayjs().subtract(1, 'day')] },
  ]

  const marketPresets = market === 'a' 
    ? [
        { label: '24.09-至今 政策牛', value: [dayjs('2024-09-24'), dayjs().subtract(1, 'day')] },
        { label: '19.01-21.02 核心资产牛', value: [dayjs('2019-01-04'), dayjs('2021-02-18')] },
        { label: '14.07-15.06 杠杆牛', value: [dayjs('2014-07-01'), dayjs('2015-06-12')] },
        { label: '05.06-07.10 股改牛', value: [dayjs('2005-06-06'), dayjs('2007-10-16')] },
      ]
    : [
        { label: '24.01-至今 AI浪潮', value: [dayjs('2024-01-02'), dayjs().subtract(1, 'day')] },
        { label: '16.02-18.01 南下资金', value: [dayjs('2016-02-01'), dayjs('2018-01-31')] },
        { label: '03.04-07.10 SARS后', value: [dayjs('2003-04-01'), dayjs('2007-10-31')] },
      ]

  return [...marketPresets, ...commonPresets]
}

// 颜色配置
const upColor = '#ec5a5a'
const downColor = '#47b262'

export default function RangeStatsPanel({
  dateRange: externalDateRange,
  onDateRangeChange,
  market: externalMarket,
  onMarketChange,
  showDatePicker = true,
  showMarketSelect = true,
  queryParams,
  searchTrigger,
}) {
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const tableCardRef = useRef(null)
  const vtableRef = useRef(null)
  const { vtableTheme } = useTheme()

  const [internalDateRange, setInternalDateRange] = useState([dayjs('2024-01-02'), dayjs().subtract(1, 'day')])
  const [internalMarket, setInternalMarket] = useState('hk')
  
  const dateRange = externalDateRange || internalDateRange
  const market = externalMarket ?? internalMarket

  const datePresets = useMemo(() => getDatePresets(market), [market])

  const [minChangePct, setMinChangePct] = useState(queryParams?.minChangePct ?? 60)
  const [marketCapMode, setMarketCapMode] = useState(queryParams?.marketCapMode ?? 'range')
  const [marketCapValue, setMarketCapValue] = useState(queryParams?.marketCapValue ?? null)
  const [minMarketCap, setMinMarketCap] = useState(queryParams?.minMarketCap ?? 20)
  const [maxMarketCap, setMaxMarketCap] = useState(queryParams?.maxMarketCap ?? 1000)
  const [selectedIndustry, setSelectedIndustry] = useState('')

  useEffect(() => {
    if (queryParams) {
      if (queryParams.minChangePct !== undefined) setMinChangePct(queryParams.minChangePct)
      if (queryParams.marketCapMode !== undefined) setMarketCapMode(queryParams.marketCapMode)
      if (queryParams.marketCapValue !== undefined) setMarketCapValue(queryParams.marketCapValue)
      if (queryParams.minMarketCap !== undefined) setMinMarketCap(queryParams.minMarketCap)
      if (queryParams.maxMarketCap !== undefined) setMaxMarketCap(queryParams.maxMarketCap)
    }
  }, [queryParams])

  useEffect(() => {
    if (searchTrigger > 0 && queryParams) {
      setSelectedIndustry('')
      fetchStockData('', null, queryParams)
    }
  }, [searchTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  const [tableLoading, setTableLoading] = useState(false)
  const [allStockData, setAllStockData] = useState([])
  const [industryStats, setIndustryStats] = useState([])
  const [sortState, setSortState] = useState({ field: 'changePct', order: 'desc' })

  const [drawerVisible, setDrawerVisible] = useState(false)
  const [selectedStock, setSelectedStock] = useState(null)

  const handleDateRangeChange = (dates) => {
    if (dates?.[0] && dates?.[1]) {
      if (onDateRangeChange) {
        onDateRangeChange(dates)
      } else {
        setInternalDateRange(dates)
      }
    }
  }

  const handleMarketChange = (newMarket) => {
    if (onMarketChange) {
      onMarketChange(newMarket)
    } else {
      setInternalMarket(newMarket)
    }
    const defaultPreset = marketDefaultPresets[newMarket]
    if (defaultPreset && onDateRangeChange) {
      onDateRangeChange(defaultPreset.value)
    } else if (defaultPreset) {
      setInternalDateRange(defaultPreset.value)
    }
    setAllStockData([])
    setIndustryStats([])
    setSelectedIndustry('')
  }

  const fetchStockData = useCallback(async (industry = '', customDateRange = null, customQueryParams = null) => {
    const useDateRange = customDateRange || dateRange
    if (!useDateRange[0] || !useDateRange[1]) return
    
    const useMinChangePct = customQueryParams?.minChangePct ?? minChangePct
    const useMarketCapMode = customQueryParams?.marketCapMode ?? marketCapMode
    const useMarketCapValue = customQueryParams?.marketCapValue ?? marketCapValue
    const useMinMarketCap = customQueryParams?.minMarketCap ?? minMarketCap
    const useMaxMarketCap = customQueryParams?.maxMarketCap ?? maxMarketCap
    
    setTableLoading(true)
    try {
      let actualMinCap = 0, actualMaxCap = 0
      
      if (useMarketCapMode === 'less' && useMarketCapValue) actualMaxCap = useMarketCapValue
      else if (useMarketCapMode === 'greater' && useMarketCapValue) actualMinCap = useMarketCapValue
      else if (useMarketCapMode === 'range') {
        actualMinCap = useMinMarketCap || 0
        actualMaxCap = useMaxMarketCap || 0
      }
      
      const params = {
        start_date: useDateRange[0].format('YYYYMMDD'),
        end_date: useDateRange[1].format('YYYYMMDD'),
        min_change_pct: useMinChangePct,
        min_market_cap: actualMinCap,
        max_market_cap: actualMaxCap,
        market: market,
      }
      if (industry) params.industry = industry
      
      const response = await axios.get('/api/v1/stock/range', { params, timeout: 120000 })
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
  }, [dateRange, minChangePct, marketCapMode, marketCapValue, minMarketCap, maxMarketCap, market])

  const openStockDetail = useCallback((stock) => {
    setSelectedStock(stock)
    setDrawerVisible(true)
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerVisible(false)
  }, [])

  const handleSearch = () => {
    setSelectedIndustry('')
    fetchStockData('')
  }

  const isFirstMount = useRef(true)
  const prevMarketRef = useRef(market)
  const prevDateRangeRef = useRef(dateRange)

  useEffect(() => {
    fetchStockData('')
    isFirstMount.current = false
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isFirstMount.current) return
    
    const marketChanged = prevMarketRef.current !== market
    const dateChanged = prevDateRangeRef.current[0]?.format('YYYY-MM-DD') !== dateRange[0]?.format('YYYY-MM-DD') ||
                        prevDateRangeRef.current[1]?.format('YYYY-MM-DD') !== dateRange[1]?.format('YYYY-MM-DD')
    
    prevMarketRef.current = market
    prevDateRangeRef.current = dateRange
    
    if (marketChanged || dateChanged) {
      setTimeout(() => {
        setSelectedIndustry('')
        fetchStockData('')
      }, 0)
    }
  }, [market, dateRange]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleIndustryClick = (industry) => {
    if (selectedIndustry === industry) {
      setSelectedIndustry('')
      fetchStockData('')
    } else {
      setSelectedIndustry(industry)
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
    XLSX.utils.sheet_add_aoa(ws, [[title]], { origin: 'A1' })
    XLSX.utils.sheet_add_aoa(ws, [[]], { origin: 'A2' })
    XLSX.utils.sheet_add_json(ws, exportData, { origin: 'A3' })
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }]
    
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '区间涨幅')
    
    const fileName = `区间涨幅_${dateRange[0]?.format('YYYYMMDD')}_${dateRange[1]?.format('YYYYMMDD')}.xlsx`
    XLSX.writeFile(wb, fileName)
    message.success('导出成功')
  }, [allStockData, dateRange, getQueryTitle])

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

  // 排序后的数据
  const sortedStockData = useMemo(() => {
    if (!allStockData.length) return allStockData
    
    const { field, order } = sortState
    
    return [...allStockData].sort((a, b) => {
      let aVal, bVal
      
      switch (field) {
        case 'symbol':
          aVal = a.symbol || ''
          bVal = b.symbol || ''
          break
        case 'name':
          aVal = a.name || ''
          bVal = b.name || ''
          break
        case 'startPrice':
          aVal = a.startPrice ?? -Infinity
          bVal = b.startPrice ?? -Infinity
          break
        case 'endPrice':
          aVal = a.endPrice ?? -Infinity
          bVal = b.endPrice ?? -Infinity
          break
        case 'changePct':
          aVal = a.changePct ?? -Infinity
          bVal = b.changePct ?? -Infinity
          break
        case 'latestPrice':
          aVal = a.latestPrice ?? -Infinity
          bVal = b.latestPrice ?? -Infinity
          break
        case 'marketCap':
          aVal = a.totalMarketCap ?? -Infinity
          bVal = b.totalMarketCap ?? -Infinity
          break
        case 'peRatio':
          aVal = a.peRatio ?? -Infinity
          bVal = b.peRatio ?? -Infinity
          break
        case 'pbRatio':
          aVal = a.pbRatio ?? -Infinity
          bVal = b.pbRatio ?? -Infinity
          break
        case 'turnoverRate':
          aVal = a.turnoverRate ?? -Infinity
          bVal = b.turnoverRate ?? -Infinity
          break
        default:
          return 0
      }
      
      if (typeof aVal === 'string') {
        const cmp = aVal.localeCompare(bVal, 'zh-CN')
        return order === 'desc' ? -cmp : cmp
      }
      
      return order === 'desc' ? bVal - aVal : aVal - bVal
    })
  }, [allStockData, sortState])

  // 保存数据引用
  const stockDataRef = useRef([])
  useEffect(() => {
    stockDataRef.current = sortedStockData
  }, [sortedStockData])

  // VTable 列配置
  const columns = useMemo(() => [
    { 
      field: 'rank', 
      title: '#', 
      width: 45,
      sort: false,
    },
    { field: 'symbol', title: '代码', width: 70, sort: true },
    { 
      field: 'name', 
      title: '名称', 
      width: 90, 
      sort: true,
      style: { color: '#1677ff', cursor: 'pointer' }
    },
    { 
      field: 'startPrice', 
      title: '起始价', 
      width: 70, 
      sort: true,
      fieldFormat: (record) => record.startPrice?.toFixed(3) || '-',
    },
    { 
      field: 'endPrice', 
      title: '结束价', 
      width: 70, 
      sort: true,
      fieldFormat: (record) => record.endPrice?.toFixed(3) || '-',
    },
    { 
      field: 'changePct', 
      title: '涨幅', 
      width: 75, 
      sort: true,
      fieldFormat: (record) => record.changePct != null ? `${record.changePct.toFixed(2)}%` : '-',
    },
    { 
      field: 'latestPrice', 
      title: '现价', 
      width: 65, 
      sort: true,
      fieldFormat: (record) => record.latestPrice?.toFixed(2) || '-',
    },
    { 
      field: 'marketCap', 
      title: '市值', 
      width: 70, 
      sort: true,
      fieldFormat: (record) => record.totalMarketCap ? `${(record.totalMarketCap / 100000000).toFixed(0)}亿` : '-',
    },
    { 
      field: 'peRatio', 
      title: '市盈率', 
      width: 65, 
      sort: true,
      fieldFormat: (record) => record.peRatio?.toFixed(2) || '-',
    },
    { 
      field: 'pbRatio', 
      title: '市净率', 
      width: 60, 
      sort: true,
      fieldFormat: (record) => record.pbRatio?.toFixed(2) || '-',
    },
    { 
      field: 'turnoverRate', 
      title: '换手率', 
      width: 70, 
      sort: true,
      fieldFormat: (record) => record.turnoverRate ? `${record.turnoverRate.toFixed(2)}%` : '-',
    },
  ], [])

  // 表格数据（添加排名）
  const tableRecords = useMemo(() => {
    return sortedStockData.map((item, index) => ({
      ...item,
      rank: index + 1,
    }))
  }, [sortedStockData])

  // VTable 配置 - 使用主题
  const baseVTableTheme = useMemo(() => getVTableTheme(vtableTheme, { rowHeight: 32, headerRowHeight: 32, fontSize: 13 }), [vtableTheme])
  
  const vtableOption = useMemo(() => ({
    columns,
    records: tableRecords,
    ...baseVTableTheme,
    widthMode: 'adaptive',
    autoWrapText: false,
    sortState: {
      field: sortState.field,
      order: sortState.order,
    },
    hover: {
      highlightMode: 'row',
    },
  }), [columns, tableRecords, sortState, baseVTableTheme])

  // 处理表格点击
  const handleTableClick = useCallback((args) => {
    const { col, row, field } = args
    if (row === 0) return
    
    const record = vtableRef.current?.getRecordByRowCol(col, row)
    if (!record) return
    
    if (field === 'name') {
      const originalData = stockDataRef.current.find(item => item.symbol === record.symbol)
      if (originalData) {
        openStockDetail(originalData)
      }
    }
  }, [openStockDetail])

  // 处理排序
  const handleSortClick = useCallback((args) => {
    const { field, order } = args
    if (field && field !== 'rank') {
      setSortState({ field, order: order || 'desc' })
    }
  }, [])

  const handleVTableReady = useCallback((instance) => {
    vtableRef.current = instance
    instance.on('click_cell', handleTableClick)
    instance.on('sort_click', handleSortClick)
  }, [handleTableClick, handleSortClick])

  // 更新表格数据
  useEffect(() => {
    if (vtableRef.current && tableRecords.length > 0) {
      vtableRef.current.setRecords(tableRecords)
    }
  }, [tableRecords])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 4 : 6 }}>
      {/* 查询条件区 */}
      {!queryParams && (
        <Card size="small" styles={{ body: { padding: isMobile ? 6 : '4px 10px' } }}>
          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {showDatePicker && (
                <RangePicker value={dateRange} onChange={handleDateRangeChange} allowClear={false} size="small" style={{ width: '100%' }} presets={datePresets} />
              )}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {showMarketSelect && (
                <Select value={market} onChange={handleMarketChange} style={{ width: 80 }} options={marketOptions} />
              )}
              {showDatePicker && (
                <RangePicker value={dateRange} onChange={handleDateRangeChange} allowClear={false} size="middle" style={{ width: 260 }} presets={datePresets} />
              )}
              {!showDatePicker && dateRange[0] && dateRange[1] && (
                <span style={{ fontSize: 13, color: '#666', padding: '0 8px', background: '#f5f5f5', borderRadius: 4, lineHeight: '30px' }}>
                  {dateRange[0].format('YYYY-MM-DD')} ~ {dateRange[1].format('YYYY-MM-DD')}
                </span>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 13, color: '#666' }}>涨幅≥</span>
                <InputNumber value={minChangePct} onChange={setMinChangePct} min={0} max={1000} suffix="%" size="middle" style={{ width: 80 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 13, color: '#666' }}>市值</span>
                <Select value={marketCapMode} onChange={handleMarketCapModeChange} style={{ width: 72 }} options={[{ label: '区间', value: 'range' }, { label: '大于', value: 'greater' }, { label: '小于', value: 'less' }, { label: '不限', value: 'none' }]} />
                {marketCapMode === 'range' && (
                  <>
                    <InputNumber value={minMarketCap} onChange={setMinMarketCap} min={0} placeholder="最小" style={{ width: 100 }} suffix="亿" />
                    <span style={{ color: '#999' }}>~</span>
                    <InputNumber value={maxMarketCap} onChange={setMaxMarketCap} min={0} placeholder="最大" style={{ width: 100 }} suffix="亿" />
                  </>
                )}
                {(marketCapMode === 'less' || marketCapMode === 'greater') && (
                  <InputNumber value={marketCapValue} onChange={setMarketCapValue} min={0} style={{ width: 100 }} suffix="亿" />
                )}
              </div>
              <div style={{ flex: 1 }} />
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={tableLoading}>查询</Button>
            </div>
          )}
        </Card>
      )}

      {/* 行业统计 */}
      {industryStats.length > 0 && (
        <Card 
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: isMobile ? 12 : 13 }}>行业分布</span>
              {selectedIndustry && (
                <Tag color="red" closable onClose={() => handleIndustryClick(selectedIndustry)} style={{ fontSize: 11, margin: 0 }}>{selectedIndustry}</Tag>
              )}
            </div>
          } 
          size="small"
          styles={{ body: { padding: isMobile ? 4 : '4px 8px' } }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 3 : 6 }}>
            {industryStats.map((item) => (
              <Tag key={item.name} color={selectedIndustry === item.name ? 'red' : 'blue'} style={{ margin: 0, cursor: 'pointer', fontSize: isMobile ? 10 : 11, padding: isMobile ? '0 4px' : '0 6px' }} onClick={() => handleIndustryClick(item.name)}>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: isMobile ? 12 : 13 }}>
                {isMobile ? `涨幅榜 ${dateRange[0]?.format('MM-DD')}~${dateRange[1]?.format('MM-DD')}` : getQueryTitle()}
              </span>
              {allStockData.length > 0 && <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>共{allStockData.length}只</Tag>}
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
        styles={{ body: { flex: 1, overflow: 'hidden', padding: 0 } }}
      >
        <Spin spinning={tableLoading} style={{ minHeight: 200 }}>
          {allStockData.length > 0 ? (
            <ListTable
              option={vtableOption}
              onReady={handleVTableReady}
              height={queryParams ? window.innerHeight - 360 : window.innerHeight - 420}
            />
          ) : !tableLoading ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              暂无数据
            </div>
          ) : (
            <div style={{ height: 200 }} />
          )}
        </Spin>
      </Card>

      {/* 股票详情抽屉 */}
      <StockDetailDrawer visible={drawerVisible} stock={selectedStock} onClose={closeDrawer} market={market} dateRange={dateRange} />
    </div>
  )
}
