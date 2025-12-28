import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Card, DatePicker, Button, Tag, message, InputNumber, Select, Grid, Space, Spin, Dropdown } from 'antd'
import { SearchOutlined, DownloadOutlined, CopyOutlined, CameraOutlined } from '@ant-design/icons'
import { SheetComponent } from '@antv/s2-react'
import '@antv/s2-react/dist/s2-react.min.css'
import axios from 'axios'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import StockDetailDrawer from './StockDetailDrawer'

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

// 获取日期预设（包含通用预设 + 市场特定牛市阶段预设）
const getDatePresets = (market) => {
  // 通用预设
  const commonPresets = [
    { label: '近1周', value: [dayjs().subtract(7, 'day'), dayjs().subtract(1, 'day')] },
    { label: '近2周', value: [dayjs().subtract(14, 'day'), dayjs().subtract(1, 'day')] },
    { label: '近1月', value: [dayjs().subtract(1, 'month'), dayjs().subtract(1, 'day')] },
    { label: '近半年', value: [dayjs().subtract(6, 'month'), dayjs().subtract(1, 'day')] },
    { label: '近1年', value: [dayjs().subtract(1, 'year'), dayjs().subtract(1, 'day')] },
    { label: '近2年', value: [dayjs().subtract(2, 'year'), dayjs().subtract(1, 'day')] },
  ]

  // 市场特定的牛市阶段预设
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

/**
 * RangeStatsPanel - 区间涨幅查询面板
 * 包含：查询条件 + 行业分布 + 区间涨幅排行
 * 
 * @param {Object} props
 * @param {Array} props.dateRange - 日期范围 [dayjs, dayjs]
 * @param {Function} props.onDateRangeChange - 日期变化回调
 * @param {string} props.market - 市场 'hk' | 'a'
 * @param {Function} props.onMarketChange - 市场变化回调
 * @param {boolean} props.showDatePicker - 是否显示日期选择器（默认true）
 * @param {boolean} props.showMarketSelect - 是否显示市场选择（默认true）
 * @param {Object} props.queryParams - 外部传入的查询参数（从K线图title传入）
 * @param {number} props.searchTrigger - 外部触发查询的标记
 */
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

  // 内部状态（如果外部没传则使用内部状态）
  const [internalDateRange, setInternalDateRange] = useState([dayjs('2024-01-02'), dayjs().subtract(1, 'day')])
  const [internalMarket, setInternalMarket] = useState('hk')
  
  // 实际使用的值
  const dateRange = externalDateRange || internalDateRange
  const market = externalMarket ?? internalMarket

  // 当前市场的日期预设（包含牛市阶段 + 通用预设）
  const datePresets = useMemo(() => getDatePresets(market), [market])

  // 查询条件状态 - 优先使用外部传入的值
  const [minChangePct, setMinChangePct] = useState(queryParams?.minChangePct ?? 60)
  const [marketCapMode, setMarketCapMode] = useState(queryParams?.marketCapMode ?? 'range')
  const [marketCapValue, setMarketCapValue] = useState(queryParams?.marketCapValue ?? null)
  const [minMarketCap, setMinMarketCap] = useState(queryParams?.minMarketCap ?? 20)
  const [maxMarketCap, setMaxMarketCap] = useState(queryParams?.maxMarketCap ?? 1000)
  const [selectedIndustry, setSelectedIndustry] = useState('')

  // 同步外部查询参数变化
  useEffect(() => {
    if (queryParams) {
      if (queryParams.minChangePct !== undefined) setMinChangePct(queryParams.minChangePct)
      if (queryParams.marketCapMode !== undefined) setMarketCapMode(queryParams.marketCapMode)
      if (queryParams.marketCapValue !== undefined) setMarketCapValue(queryParams.marketCapValue)
      if (queryParams.minMarketCap !== undefined) setMinMarketCap(queryParams.minMarketCap)
      if (queryParams.maxMarketCap !== undefined) setMaxMarketCap(queryParams.maxMarketCap)
    }
  }, [queryParams])

  // 外部触发查询 - 直接使用 queryParams 的值
  useEffect(() => {
    if (searchTrigger > 0 && queryParams) {
      setSelectedIndustry('')
      fetchStockData('', null, queryParams)
    }
  }, [searchTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  // 数据状态
  const [tableLoading, setTableLoading] = useState(false)
  const [allStockData, setAllStockData] = useState([])
  const [industryStats, setIndustryStats] = useState([])
  // 排序状态
  const [sortParams, setSortParams] = useState([{ sortFieldId: 'changePct', sortMethod: 'DESC' }])

  // 抽屉状态
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [selectedStock, setSelectedStock] = useState(null)

  // 日期变化处理
  const handleDateRangeChange = (dates) => {
    if (dates?.[0] && dates?.[1]) {
      if (onDateRangeChange) {
        onDateRangeChange(dates)
      } else {
        setInternalDateRange(dates)
      }
    }
  }

  // 市场变化处理
  const handleMarketChange = (newMarket) => {
    if (onMarketChange) {
      onMarketChange(newMarket)
    } else {
      setInternalMarket(newMarket)
    }
    // 切换市场时使用该市场的默认预设
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

  // 获取区间涨幅股票数据
  const fetchStockData = useCallback(async (industry = '', customDateRange = null, customQueryParams = null) => {
    const useDateRange = customDateRange || dateRange
    if (!useDateRange[0] || !useDateRange[1]) return
    
    // 使用传入的参数或内部状态
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

  // 打开股票详情
  const openStockDetail = useCallback((stock) => {
    setSelectedStock(stock)
    setDrawerVisible(true)
  }, [])

  // 关闭抽屉
  const closeDrawer = useCallback(() => {
    setDrawerVisible(false)
  }, [])

  const handleSearch = () => {
    setSelectedIndustry('')
    fetchStockData('')
  }

  // 首次加载标记
  const isFirstMount = useRef(true)
  // 上一次的市场值和日期范围
  const prevMarketRef = useRef(market)
  const prevDateRangeRef = useRef(dateRange)

  // 组件挂载时自动查询
  useEffect(() => {
    fetchStockData('')
    isFirstMount.current = false
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 市场或日期区间切换时自动重新查询
  useEffect(() => {
    if (isFirstMount.current) return
    
    const marketChanged = prevMarketRef.current !== market
    const dateChanged = prevDateRangeRef.current[0]?.format('YYYY-MM-DD') !== dateRange[0]?.format('YYYY-MM-DD') ||
                        prevDateRangeRef.current[1]?.format('YYYY-MM-DD') !== dateRange[1]?.format('YYYY-MM-DD')
    
    prevMarketRef.current = market
    prevDateRangeRef.current = dateRange
    
    // 市场或日期变化时触发查询
    if (marketChanged || dateChanged) {
      // 使用 setTimeout 确保状态已更新
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

  // S2 表格配置
  // 根据排序参数对数据进行排序
  const sortedStockData = useMemo(() => {
    if (!allStockData.length) return allStockData
    if (!sortParams.length) return allStockData
    
    const { sortFieldId, sortMethod } = sortParams[0]
    console.log('执行排序:', sortFieldId, sortMethod, '数据量:', allStockData.length)
    
    const sorted = [...allStockData].sort((a, b) => {
      let aVal, bVal
      
      // 根据字段获取对应的原始数据值
      switch (sortFieldId) {
        case 'rank':
          return 0 // rank 按原始顺序
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
      
      // 字符串比较
      if (typeof aVal === 'string') {
        const cmp = aVal.localeCompare(bVal, 'zh-CN')
        return sortMethod === 'DESC' ? -cmp : cmp
      }
      
      // 数值比较
      const result = sortMethod === 'DESC' ? bVal - aVal : aVal - bVal
      return result
    })
    
    // 打印前3条排序后的数据
    console.log('排序后前3条:', sorted.slice(0, 3).map(s => ({ name: s.name, changePct: s.changePct })))
    
    return sorted
  }, [allStockData, sortParams])

  const s2DataCfg = useMemo(() => ({
    fields: {
      columns: ['rank', 'symbol', 'name', 'startPrice', 'endPrice', 'changePct', 'latestPrice', 'marketCap', 'peRatio', 'pbRatio', 'turnoverRate'],
    },
    meta: [
      { field: 'rank', name: '#' },
      { field: 'symbol', name: '代码' },
      { field: 'name', name: '名称' },
      { field: 'startPrice', name: '起始价' },
      { field: 'endPrice', name: '结束价' },
      { field: 'changePct', name: '涨幅' },
      { field: 'latestPrice', name: '现价' },
      { field: 'marketCap', name: '市值' },
      { field: 'peRatio', name: '市盈率' },
      { field: 'pbRatio', name: '市净率' },
      { field: 'turnoverRate', name: '换手率' },
    ],
    data: sortedStockData.map((item, index) => ({
      rank: index + 1,
      symbol: item.symbol,
      name: item.name,
      startPrice: item.startPrice?.toFixed(3) || '-',
      endPrice: item.endPrice?.toFixed(3) || '-',
      changePct: item.changePct?.toFixed(2) || '-',
      latestPrice: item.latestPrice?.toFixed(2) || '-',
      marketCap: item.totalMarketCap ? (item.totalMarketCap / 100000000).toFixed(0) : '-',
      peRatio: item.peRatio?.toFixed(2) || '-',
      pbRatio: item.pbRatio?.toFixed(2) || '-',
      turnoverRate: item.turnoverRate ? item.turnoverRate.toFixed(2) + '%' : '-',
    })),
    // 不传 sortParams，由前端排序后直接显示
  }), [sortedStockData])

  const s2Options = useMemo(() => ({
    width: tableCardRef.current?.clientWidth || 800,
    height: queryParams ? window.innerHeight - 360 : window.innerHeight - 420,
    showSeriesNumber: false,
    interaction: {
      selectedCellsSpotlight: false,
      hoverHighlight: true,
    },
    // 启用 tooltip 排序功能
    tooltip: {
      enable: true,
      operation: {
        sort: true,
        menu: {
          render: (props) => {
            const items = props.items?.map(item => ({
              key: item.key,
              label: item.label,
              onClick: item.onClick,
            })) || []
            return (
              <Dropdown menu={{ items }} trigger={['click']} open>
                <div style={{ display: 'none' }} />
              </Dropdown>
            )
          },
        },
      },
    },
    style: {
      layoutWidthType: 'adaptive',
      dataCell: {
        height: 32,
      },
      colCell: {
        height: 36,
      },
    },
    // 启用表头排序图标
    showDefaultHeaderActionIcon: true,
    conditions: {
      text: [
        {
          field: 'changePct',
          mapping: (value) => {
            const num = parseFloat(value)
            return {
              fill: num >= 0 ? '#ec5a5a' : '#47b262',
              fontWeight: 600,
            }
          },
        },
        {
          field: 'rank',
          mapping: (value) => {
            const rank = parseInt(value)
            if (rank <= 3) return { fill: '#ec5a5a', fontWeight: 600 }
            if (rank <= 10) return { fill: '#fa8c16', fontWeight: 600 }
            return { fill: '#333' }
          },
        },
        {
          field: 'name',
          mapping: () => ({ fill: '#1677ff' }),
        },
      ],
    },
  }), [queryParams])

  // S2 ref 用于绑定事件
  const s2Ref = useRef(null)
  // 保存原始数据的引用，用于点击时获取完整数据
  const stockDataRef = useRef([])
  // 保存排序状态的引用
  const sortParamsRef = useRef(sortParams)
  
  // 同步数据到 ref（使用排序后的数据）
  useEffect(() => {
    stockDataRef.current = sortedStockData
  }, [sortedStockData])
  
  // 同步排序状态到 ref
  useEffect(() => {
    sortParamsRef.current = sortParams
  }, [sortParams])

  // 处理排序事件
  const handleRangeSort = useCallback((params) => {
    console.log('排序参数:', params)
    // S2 排序参数格式: { sortKey, sortMethod } 或 [{ sortFieldId, sortMethod }]
    if (Array.isArray(params) && params.length > 0) {
      const { sortFieldId, sortMethod } = params[0]
      if (sortFieldId && sortMethod) {
        setSortParams([{ sortFieldId, sortMethod: sortMethod.toUpperCase() }])
      }
    } else if (params.sortKey && params.sortMethod) {
      setSortParams([{ sortFieldId: params.sortKey, sortMethod: params.sortMethod.toUpperCase() }])
    }
  }, [])

  // 处理列头点击排序
  const handleColCellClick = useCallback((field) => {
    if (field && field !== 'rank') {
      const current = sortParamsRef.current[0]
      if (current?.sortFieldId === field) {
        // 同一字段，切换排序方向
        const newMethod = current.sortMethod === 'DESC' ? 'ASC' : 'DESC'
        setSortParams([{ sortFieldId: field, sortMethod: newMethod }])
      } else {
        // 新字段，默认降序
        setSortParams([{ sortFieldId: field, sortMethod: 'DESC' }])
      }
    }
  }, [])

  // 使用 onMounted 绑定点击事件
  const handleS2Mounted = useCallback((spreadsheet) => {
    s2Ref.current = spreadsheet
    
    // 监听列头点击事件实现排序
    spreadsheet.on('col-cell:click', (event) => {
      const cell = spreadsheet.getCell(event.target)
      const meta = cell?.getMeta?.()
      const field = meta?.field
      console.log('列头点击:', field, meta)
      handleColCellClick(field)
    })
    
    // 监听 data-cell:click 事件
    spreadsheet.on('data-cell:click', (event) => {
      const cell = spreadsheet.getCell(event.target)
      const meta = cell?.getMeta?.()
      const field = meta?.valueField
      // 只有点击名称列才打开详情
      if (field === 'name') {
        // 从表格获取当前行的完整数据
        const rowData = spreadsheet.dataSet.getRowData(meta)
        // 用 symbol 匹配原始数据
        const symbol = rowData?.symbol
        if (symbol) {
          const originalData = stockDataRef.current.find(item => item.symbol === symbol)
          if (originalData) {
            openStockDetail(originalData)
          }
        }
      }
    })
  }, [openStockDetail, handleColCellClick])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 4 : 6 }}>
      {/* 查询条件区 - 一排布局（仅在没有外部 queryParams 时显示） */}
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
            <SheetComponent
              sheetType="table"
              dataCfg={s2DataCfg}
              options={s2Options}
              onMounted={handleS2Mounted}
              onRangeSort={handleRangeSort}
              adaptive={{ width: true, height: false }}
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
