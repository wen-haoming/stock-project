import { useState, useRef, useMemo, useCallback } from 'react'
import { Button, Input, Modal, Form, Empty, message, Dropdown, Spin, Select, Tag, Drawer, Tooltip } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, MoreOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { SheetComponent } from '@antv/s2-react'
import { TableDataCell } from '@antv/s2'
import '@antv/s2-react/dist/s2-react.min.css'
import { useLocalStorageState, useRequest, useDebounceFn, useKeyPress, useClickAway, useInterval, useMemoizedFn } from 'ahooks'
import axios from 'axios'
import StockDetail from '../range-stats/StockDetail'
import { fetchStockInfo, fetchStockTrend } from '../../api/stock'
import { upColor, downColor } from '../../utils/chart'

// 市场标签配置
const MARKET_TAG_CONFIG = {
  hk: { color: '#ff4d4f', text: '港股' },
  a: { color: '#1890ff', text: 'A股' },
  us: { color: '#52c41a', text: '美股' },
}

// 判断是否为衍生品
const isDerivative = (stock) => {
  if (stock.market === 'hk') {
    if (!stock.industry || stock.industry === '-') return true
    if (stock.symbol?.length === 5) {
      const code = parseInt(stock.symbol, 10)
      if (!isNaN(code) && code >= 10000) return true
    }
    const keywords = ['牛', '熊', '购', '沽', '轮', '界内证']
    if (keywords.some(kw => stock.name?.includes(kw))) return true
  }
  return false
}

// 判断是否在交易时间
const isTradeTime = () => {
  const now = new Date()
  const day = now.getDay()
  // 周末不交易
  if (day === 0 || day === 6) return false
  
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const time = hours * 100 + minutes
  
  // A股/港股交易时间: 9:30-11:30, 13:00-15:00 (港股到16:00)
  // 简化判断: 9:15-16:10
  return time >= 915 && time <= 1610
}

// 本地存储 key
const STORAGE_KEY = 'watchlist_data'
const DRAWER_WIDTH_KEY = 'watchlist_drawer_width'
const DEFAULT_GROUP = { id: 'default', name: '默认分组', stocks: [] }
const DEFAULT_DRAWER_WIDTH = 800
const MIN_DRAWER_WIDTH = 400
const MAX_DRAWER_WIDTH_RATIO = 0.9
const POLL_INTERVAL = 10000 // 轮询间隔 10秒

// 自定义分时图单元格
class TrendChartCell extends TableDataCell {
  drawTextShape() {
    const { x, y, width, height } = this.getCellArea()
    
    // 获取分时数据
    const rowData = this.meta.data || {}
    const trendData = rowData._trendData
    const preClose = rowData._trendPreClose || rowData.preClose
    const changePct = rowData._originalChangePct
    
    if (!trendData?.length) {
      // 无数据时显示灰色背景
      this.addShape('rect', {
        attrs: {
          x: x + 4,
          y: y + 4,
          width: width - 8,
          height: height - 8,
          fill: '#f5f5f5',
          radius: 2,
        },
      })
      return
    }
    
    const prices = trendData.map(d => d[0])
    const min = Math.min(...prices, preClose)
    const max = Math.max(...prices, preClose)
    const range = max - min || 1
    
    const chartX = x + 4
    const chartY = y + 4
    const chartWidth = width - 8
    const chartHeight = height - 8
    
    // 绘制昨收虚线
    const preCloseY = chartY + chartHeight - ((preClose - min) / range) * chartHeight
    this.addShape('line', {
      attrs: {
        x1: chartX,
        y1: preCloseY,
        x2: chartX + chartWidth,
        y2: preCloseY,
        stroke: '#999',
        lineWidth: 0.5,
        lineDash: [2, 2],
      },
    })
    
    // 绘制分时线
    const points = trendData.map((d, i) => {
      const px = chartX + (i / (trendData.length - 1)) * chartWidth
      const py = chartY + chartHeight - ((d[0] - min) / range) * chartHeight
      return [px, py]
    })
    
    const color = changePct >= 0 ? upColor : downColor
    
    this.addShape('polyline', {
      attrs: {
        points,
        stroke: color,
        lineWidth: 1.5,
      },
    })
  }
}

export default function WatchlistPage() {
  // 使用 ahooks 的 useLocalStorageState 管理本地存储
  const [watchlistData, setWatchlistData] = useLocalStorageState(STORAGE_KEY, {
    defaultValue: { groups: [DEFAULT_GROUP], activeGroupId: 'default' }
  })
  const [drawerWidth, setDrawerWidth] = useLocalStorageState(DRAWER_WIDTH_KEY, {
    defaultValue: DEFAULT_DRAWER_WIDTH
  })
  
  const groups = watchlistData?.groups || [DEFAULT_GROUP]
  const activeGroupId = watchlistData?.activeGroupId || 'default'
  
  const setGroups = (newGroups) => {
    setWatchlistData(prev => ({ ...prev, groups: newGroups }))
  }
  const setActiveGroupId = (id) => {
    setWatchlistData(prev => ({ ...prev, activeGroupId: id }))
  }
  
  const [selectedStock, setSelectedStock] = useState(null)
  const [selectedRowIndex, setSelectedRowIndex] = useState(-1)
  const [groupModalVisible, setGroupModalVisible] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [groupForm] = Form.useForm()
  const [isResizing, setIsResizing] = useState(false)
  
  // 搜索相关状态
  const [searchKeyword, setSearchKeyword] = useState('')
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const searchContainerRef = useRef(null)
  
  // 股票实时行情和分时数据
  const [stockQuotes, setStockQuotes] = useState({})
  const [trendDataMap, setTrendDataMap] = useState({})
  
  const tableContainerRef = useRef(null)
  const s2Ref = useRef(null)
  const stockDataRef = useRef([])
  const selectedRowIndexRef = useRef(selectedRowIndex)
  
  // 获取当前分组
  const activeGroup = groups.find(g => g.id === activeGroupId) || groups[0]
  
  // 点击外部关闭搜索下拉框
  useClickAway(() => {
    setShowSearchDropdown(false)
  }, searchContainerRef)
  
  // 获取所有股票数据（行情+分时）
  const fetchAllStockData = useMemoizedFn(async (stocks, includeTrend = true) => {
    if (!stocks?.length) return {}
    
    const results = {}
    const trendResults = {}
    
    await Promise.all(
      stocks.map(async (stock) => {
        const key = `${stock.symbol}_${stock.market}`
        try {
          // 获取行情
          const info = await fetchStockInfo(stock.symbol, stock.name, stock.market)
          if (info) {
            results[key] = {
              price: info.latestPrice,
              changePct: info.changePct,
              changeAmt: info.changeAmt,
              totalMarketCap: info.totalMarketCap,
              amount: info.amount,
              volume: info.volume,
              turnoverRate: info.turnoverRate,
              peRatio: info.peRatio,
              pbRatio: info.pbRatio,
              preClose: info.preClose,
              open: info.open,
              high: info.high,
              low: info.low,
              amplitude: info.amplitude,
            }
          }
          
          // 获取分时数据（仅首次加载或手动刷新时）
          if (includeTrend) {
            const trend = await fetchStockTrend(stock.symbol, stock.market, 1)
            if (trend?.values?.length) {
              trendResults[key] = {
                data: trend.values,
                preClose: trend.preClose
              }
            }
          }
        } catch (e) {
          console.error('获取数据失败:', stock.symbol, e)
        }
      })
    )
    
    setStockQuotes(prev => ({ ...prev, ...results }))
    if (includeTrend && Object.keys(trendResults).length) {
      setTrendDataMap(prev => ({ ...prev, ...trendResults }))
    }
    
    return results
  })
  
  // 使用 useRequest 管理数据请求
  const { loading: loadingQuotes, run: runFetchData } = useRequest(
    () => fetchAllStockData(activeGroup.stocks, true),
    {
      refreshDeps: [activeGroup?.stocks],
      ready: activeGroup?.stocks?.length > 0,
    }
  )
  
  // 轮询刷新（仅行情，不刷新分时图）
  useInterval(
    async () => {
      if (activeGroup?.stocks?.length > 0 && isTradeTime()) {
        await fetchAllStockData(activeGroup.stocks, false) // 轮询时不刷新分时
      }
    },
    isTradeTime() ? POLL_INTERVAL : undefined
  )
  
  // 手动刷新
  const handleRefresh = useMemoizedFn(() => {
    if (activeGroup?.stocks?.length > 0) {
      runFetchData()
      message.success('刷新成功')
    }
  })
  
  // 搜索股票 - 使用 useRequest
  const { data: searchResults = [], loading: searching, run: runSearch } = useRequest(
    async (keyword) => {
      if (!keyword?.trim()) return []
      const response = await axios.get('/api/v1/stock/search', {
        params: { keyword: keyword.trim(), limit: 20 }
      })
      return response.data?.data || []
    },
    { manual: true }
  )
  
  // 防抖搜索
  const { run: debouncedSearch } = useDebounceFn(
    (keyword) => {
      if (keyword?.trim()) {
        setShowSearchDropdown(true)
        runSearch(keyword)
      } else {
        setShowSearchDropdown(false)
      }
    },
    { wait: 300 }
  )
  
  const handleSearchInputChange = (e) => {
    const value = e.target.value
    setSearchKeyword(value)
    debouncedSearch(value)
  }
  
  // 添加股票到自选
  const handleAddStock = useMemoizedFn((stock) => {
    const market = stock.market || 'hk'
    const symbol = stock.symbol
    const name = stock.name
    
    if (activeGroup.stocks.some(s => s.symbol === symbol && s.market === market)) {
      message.warning('该股票已在当前分组中')
      return
    }

    const newStock = { symbol, name, market }
    const newGroups = groups.map(g => {
      if (g.id === activeGroupId) {
        return { ...g, stocks: [...g.stocks, newStock] }
      }
      return g
    })
    
    setGroups(newGroups)
    setSearchKeyword('')
    setShowSearchDropdown(false)
    message.success(`已添加 ${name}`)
    
    // 获取新添加股票的数据
    fetchAllStockData([newStock], true)
  })

  // 新增/编辑分组
  const handleGroupSubmit = useMemoizedFn(() => {
    groupForm.validateFields().then(values => {
      let newGroups
      if (editingGroup) {
        newGroups = groups.map(g => g.id === editingGroup.id ? { ...g, name: values.name } : g)
      } else {
        const newGroup = { id: Date.now().toString(), name: values.name, stocks: [] }
        newGroups = [...groups, newGroup]
      }
      setGroups(newGroups)
      setGroupModalVisible(false)
      setEditingGroup(null)
      groupForm.resetFields()
      message.success(editingGroup ? '分组已更新' : '分组已创建')
    })
  })

  // 删除分组
  const handleDeleteGroup = useMemoizedFn((groupId) => {
    if (groups.length <= 1) {
      message.warning('至少保留一个分组')
      return
    }
    const newGroups = groups.filter(g => g.id !== groupId)
    const newActiveId = groupId === activeGroupId ? newGroups[0].id : activeGroupId
    setGroups(newGroups)
    if (groupId === activeGroupId) {
      setActiveGroupId(newActiveId)
    }
    if (selectedStock && activeGroup.stocks.some(s => s.symbol === selectedStock.symbol)) {
      setSelectedStock(null)
    }
    message.success('分组已删除')
  })

  // 分组操作下拉菜单
  const groupDropdownItems = [
    { key: 'edit', icon: <EditOutlined />, label: '编辑分组', onClick: () => { setEditingGroup(activeGroup); groupForm.setFieldsValue({ name: activeGroup.name }); setGroupModalVisible(true) } },
    { key: 'delete', icon: <DeleteOutlined />, label: '删除分组', danger: true, onClick: () => groups.length > 1 ? handleDeleteGroup(activeGroupId) : message.warning('至少保留一个分组') },
  ]

  // 表格数据源
  const tableData = useMemo(() => {
    return activeGroup.stocks.map(stock => {
      const key = `${stock.symbol}_${stock.market}`
      const quote = stockQuotes[key] || {}
      const trend = trendDataMap[key]
      return {
        key,
        ...stock,
        ...quote,
        trendData: trend?.data,
        trendPreClose: trend?.preClose,
      }
    })
  }, [activeGroup.stocks, stockQuotes, trendDataMap])

  // 排序状态
  const [sortParams, setSortParams] = useState([{ sortFieldId: 'changePct', sortMethod: 'DESC' }])
  const sortParamsRef = useRef(sortParams)
  sortParamsRef.current = sortParams

  // 排序后的数据
  const sortedTableData = useMemo(() => {
    if (!sortParams.length || !tableData.length) return tableData
    
    const { sortFieldId, sortMethod } = sortParams[0]
    
    return [...tableData].sort((a, b) => {
      let aVal, bVal
      
      const numFields = ['price', 'changePct', 'marketCap', 'volume', 'amount', 'turnoverRate', 'peRatio', 'pbRatio', 'amplitude', 'high', 'low', 'open', 'preClose']
      
      if (sortFieldId === 'name' || sortFieldId === 'symbol') {
        aVal = a[sortFieldId] || ''
        bVal = b[sortFieldId] || ''
        const cmp = aVal.localeCompare(bVal, 'zh-CN')
        return sortMethod === 'DESC' ? -cmp : cmp
      }
      
      if (numFields.includes(sortFieldId)) {
        const fieldMap = { marketCap: 'totalMarketCap' }
        const field = fieldMap[sortFieldId] || sortFieldId
        aVal = a[field] ?? -Infinity
        bVal = b[field] ?? -Infinity
        return sortMethod === 'DESC' ? bVal - aVal : aVal - bVal
      }
      
      return 0
    })
  }, [tableData, sortParams])
  
  stockDataRef.current = sortedTableData

  // 键盘上下键切换个股
  useKeyPress(['uparrow', 'downarrow'], (event) => {
    if (!selectedStock || sortedTableData.length === 0) return
    
    event.preventDefault()
    
    let newIndex = selectedRowIndex
    if (event.key === 'ArrowUp') {
      newIndex = Math.max(0, selectedRowIndex - 1)
    } else if (event.key === 'ArrowDown') {
      newIndex = Math.min(sortedTableData.length - 1, selectedRowIndex + 1)
    }
    
    if (newIndex !== selectedRowIndex && sortedTableData[newIndex]) {
      const stock = sortedTableData[newIndex]
      setSelectedRowIndex(newIndex)
      selectedRowIndexRef.current = newIndex
      setSelectedStock({ symbol: stock.symbol, name: stock.name, market: stock.market })
      
      // 触发 S2 重新渲染
      if (s2Ref.current) {
        s2Ref.current.render(false)
      }
    }
  }, { exactMatch: true })
  
  // 阻止左右键
  useKeyPress(['leftarrow', 'rightarrow'], (event) => {
    if (selectedStock) {
      event.preventDefault()
    }
  })

  // 当选中行变化时，更新 ref 并触发 S2 重新渲染
  const updateSelectedRow = useCallback((index) => {
    selectedRowIndexRef.current = index
    setSelectedRowIndex(index)
    if (s2Ref.current && index >= 0) {
      s2Ref.current.render(false)
    }
  }, [])

  // S2 表格配置
  const s2DataCfg = useMemo(() => {
    const columns = ['symbol', 'name', 'trend', 'price', 'changePct', 'marketCap', 'amount', 'turnoverRate', 'peRatio', 'pbRatio', 'amplitude', 'high', 'low', 'open', 'preClose']
    
    return {
      fields: { columns },
      meta: [
        { field: 'symbol', name: '代码' },
        { field: 'name', name: '名称' },
        { field: 'trend', name: '走势' },
        { field: 'price', name: '现价' },
        { field: 'changePct', name: '涨跌幅' },
        { field: 'marketCap', name: '市值' },
        { field: 'amount', name: '成交额' },
        { field: 'turnoverRate', name: '换手率' },
        { field: 'peRatio', name: 'PE' },
        { field: 'pbRatio', name: 'PB' },
        { field: 'amplitude', name: '振幅' },
        { field: 'high', name: '最高' },
        { field: 'low', name: '最低' },
        { field: 'open', name: '今开' },
        { field: 'preClose', name: '昨收' },
      ],
      data: sortedTableData.map((item, index) => ({
        symbol: item.symbol || '-',
        name: item.name || '-',
        market: item.market,
        trend: '', // 占位，实际渲染用自定义
        price: item.price?.toFixed(2) || '-',
        changePct: item.changePct != null ? item.changePct.toFixed(2) : '-',
        marketCap: item.totalMarketCap ? (item.totalMarketCap / 100000000).toFixed(0) : '-',
        amount: item.amount ? (item.amount / 100000000).toFixed(2) : '-',
        turnoverRate: item.turnoverRate != null ? item.turnoverRate.toFixed(2) : '-',
        peRatio: item.peRatio != null ? item.peRatio.toFixed(1) : '-',
        pbRatio: item.pbRatio != null ? item.pbRatio.toFixed(2) : '-',
        amplitude: item.amplitude != null ? item.amplitude.toFixed(2) : '-',
        high: item.high?.toFixed(2) || '-',
        low: item.low?.toFixed(2) || '-',
        open: item.open?.toFixed(2) || '-',
        preClose: item.preClose?.toFixed(2) || '-',
        _originalChangePct: item.changePct,
        _rowIndex: index,
        _trendData: item.trendData,
        _trendPreClose: item.trendPreClose,
      })),
    }
  }, [sortedTableData])

  // 行选中背景色 mapping 函数
  const rowBgMapping = useCallback((_, data) => {
    if (data?._rowIndex === selectedRowIndexRef.current) {
      return { fill: '#fff1f0' }
    }
    return null
  }, [])

  const s2Options = useMemo(() => ({
    width: tableContainerRef.current?.clientWidth || 800,
    height: window.innerHeight - 120,
    showSeriesNumber: false,
    interaction: {
      selectedCellsSpotlight: false,
      hoverHighlight: true,
      selectedCellHighlight: true,
    },
    tooltip: { enable: false },
    style: {
      layoutWidthType: 'adaptive',
      dataCell: { height: 40 },
      colCell: { height: 32 },
    },
    showDefaultHeaderActionIcon: true,
    // 自定义单元格
    dataCell: (viewMeta, spreadsheet) => {
      if (viewMeta.field === 'trend') {
        return new TrendChartCell(viewMeta, spreadsheet)
      }
      return new TableDataCell(viewMeta, spreadsheet)
    },
    conditions: {
      background: [
        { field: 'symbol', mapping: rowBgMapping },
        { field: 'name', mapping: rowBgMapping },
        { field: 'trend', mapping: rowBgMapping },
        { field: 'price', mapping: rowBgMapping },
        { field: 'changePct', mapping: rowBgMapping },
        { field: 'marketCap', mapping: rowBgMapping },
        { field: 'amount', mapping: rowBgMapping },
        { field: 'turnoverRate', mapping: rowBgMapping },
        { field: 'peRatio', mapping: rowBgMapping },
        { field: 'pbRatio', mapping: rowBgMapping },
        { field: 'amplitude', mapping: rowBgMapping },
        { field: 'high', mapping: rowBgMapping },
        { field: 'low', mapping: rowBgMapping },
        { field: 'open', mapping: rowBgMapping },
        { field: 'preClose', mapping: rowBgMapping },
      ],
      text: [
        {
          field: 'changePct',
          mapping: (value) => {
            const num = parseFloat(value)
            return {
              fill: num >= 0 ? upColor : downColor,
              fontWeight: 600,
            }
          },
        },
        {
          field: 'price',
          mapping: (_, data) => {
            const changePct = data?._originalChangePct
            if (changePct == null) return { fill: '#333' }
            return {
              fill: changePct >= 0 ? upColor : downColor,
              fontWeight: 500,
            }
          },
        },
        {
          field: 'name',
          mapping: () => ({ fill: '#1677ff', fontWeight: 500 }),
        },
      ],
    },
  }), [rowBgMapping])

  // 处理列头点击排序
  const handleColCellClick = useCallback((field) => {
    if (field && field !== 'name' && field !== 'trend') {
      const current = sortParamsRef.current[0]
      if (current?.sortFieldId === field) {
        const newMethod = current.sortMethod === 'DESC' ? 'ASC' : 'DESC'
        setSortParams([{ sortFieldId: field, sortMethod: newMethod }])
      } else {
        setSortParams([{ sortFieldId: field, sortMethod: 'DESC' }])
      }
    }
  }, [])

  // S2 挂载事件
  const handleS2Mounted = useCallback((spreadsheet) => {
    s2Ref.current = spreadsheet
    
    // 监听列头点击排序
    spreadsheet.on('col-cell:click', (event) => {
      const cell = spreadsheet.getCell(event.target)
      const meta = cell?.getMeta?.()
      const field = meta?.field
      handleColCellClick(field)
    })
    
    // 监听数据单元格点击 - 只有点击名称列才打开详情
    spreadsheet.on('data-cell:click', (event) => {
      const cell = spreadsheet.getCell(event.target)
      const meta = cell?.getMeta?.()
      const colIndex = meta?.colIndex
      
      // 只有点击 name 列（索引1）才打开详情
      if (colIndex !== 1) return
      
      const rowData = spreadsheet.dataSet.getRowData(meta)
      const rowIndex = meta?.rowIndex ?? -1
      
      if (rowData?.symbol) {
        const stock = stockDataRef.current.find(s => s.symbol === rowData.symbol && s.market === rowData.market)
        if (stock) {
          updateSelectedRow(rowIndex)
          setSelectedStock({ symbol: stock.symbol, name: stock.name, market: stock.market })
        }
      }
    })
  }, [handleColCellClick, updateSelectedRow])

  // 获取选中股票的行情数据
  const selectedStockQuote = useMemo(() => {
    if (!selectedStock) return null
    const key = `${selectedStock.symbol}_${selectedStock.market}`
    return stockQuotes[key] || {}
  }, [selectedStock, stockQuotes])

  // Drawer 标题组件
  const drawerTitle = useMemo(() => {
    if (!selectedStock) return null
    const quote = selectedStockQuote
    const changePct = quote?.changePct
    const price = quote?.price
    const color = changePct >= 0 ? upColor : downColor
    
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{selectedStock.name}</span>
        <span style={{ color: '#999', fontSize: 12 }}>{selectedStock.symbol}</span>
        {price != null && (
          <>
            <span style={{ color, fontWeight: 600, fontSize: 14 }}>{price.toFixed(2)}</span>
            <span style={{ color, fontSize: 12 }}>
              {changePct >= 0 ? '+' : ''}{changePct?.toFixed(2)}%
            </span>
          </>
        )}
      </div>
    )
  }, [selectedStock, selectedStockQuote])

  // Drawer 拖动调整宽度
  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    setIsResizing(true)
    
    const startX = e.clientX
    const startWidth = drawerWidth
    
    const handleMouseMove = (moveEvent) => {
      const deltaX = startX - moveEvent.clientX
      const newWidth = Math.min(
        Math.max(startWidth + deltaX, MIN_DRAWER_WIDTH),
        window.innerWidth * MAX_DRAWER_WIDTH_RATIO
      )
      setDrawerWidth(newWidth)
    }
    
    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [drawerWidth, setDrawerWidth])

  // 搜索下拉框内容
  const searchDropdown = (
    <div style={{
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      maxHeight: 300,
      overflow: 'auto',
      background: '#fff',
      borderRadius: 8,
      boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
      zIndex: 1000,
      marginTop: 4
    }}>
      {searching ? (
        <div style={{ padding: 20, textAlign: 'center' }}>
          <Spin size="small" />
          <span style={{ marginLeft: 8, color: '#999' }}>搜索中...</span>
        </div>
      ) : searchResults.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>
          {searchKeyword ? '未找到相关股票' : '输入代码或名称搜索'}
        </div>
      ) : (
        searchResults.map((stock, index) => {
          const isAdded = activeGroup.stocks.some(s => s.symbol === stock.symbol && s.market === stock.market)
          const isDeriv = isDerivative(stock)
          const tagConfig = MARKET_TAG_CONFIG[stock.market] || MARKET_TAG_CONFIG.hk
          return (
            <div
              key={`${stock.symbol}_${stock.market}_${index}`}
              onClick={() => !isAdded && handleAddStock(stock)}
              style={{
                padding: '10px 12px',
                cursor: isAdded ? 'not-allowed' : 'pointer',
                borderBottom: index < searchResults.length - 1 ? '1px solid #f5f5f5' : 'none',
                background: isAdded ? '#fafafa' : '#fff',
                opacity: isAdded ? 0.6 : 1,
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => !isAdded && (e.currentTarget.style.background = '#f5f5f5')}
              onMouseLeave={(e) => !isAdded && (e.currentTarget.style.background = '#fff')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag color={tagConfig.color} style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
                      {tagConfig.text}
                    </Tag>
                    {isDeriv && (
                      <Tag color="default" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', color: '#999' }}>
                        衍生品
                      </Tag>
                    )}
                  </div>
                  <div style={{ fontWeight: 500, fontSize: 14, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {stock.name}
                  </div>
                  <div style={{ fontSize: 12, color: '#999' }}>{stock.symbol}</div>
                </div>
                {isAdded ? (
                  <span style={{ fontSize: 12, color: '#52c41a', flexShrink: 0 }}>已添加</span>
                ) : (
                  <PlusOutlined style={{ color: '#1890ff', flexShrink: 0 }} />
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
      {/* 顶部工具栏 */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Select
            value={activeGroupId}
            onChange={setActiveGroupId}
            style={{ width: 160 }}
            size="small"
            options={groups.map(g => ({ value: g.id, label: `${g.name} (${g.stocks.length})` }))}
          />
          <Dropdown menu={{ items: groupDropdownItems }} trigger={['click']}>
            <Button size="small" icon={<MoreOutlined />} />
          </Dropdown>
          <Button size="small" icon={<PlusOutlined />} onClick={() => { setEditingGroup(null); groupForm.resetFields(); setGroupModalVisible(true) }} />
          
          <Tooltip title={`手动刷新${isTradeTime() ? '（交易时间自动刷新中）' : ''}`}>
            <Button 
              size="small" 
              icon={<ReloadOutlined spin={loadingQuotes} />} 
              onClick={handleRefresh}
              disabled={loadingQuotes}
            />
          </Tooltip>
          
          {isTradeTime() && (
            <Tag color="green" style={{ margin: 0 }}>交易中</Tag>
          )}
          
          <div style={{ flex: 1 }} />
          <div ref={searchContainerRef} style={{ position: 'relative', width: 240 }}>
            <Input
              placeholder="搜索代码或名称添加股票"
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              value={searchKeyword}
              onChange={handleSearchInputChange}
              onFocus={() => searchKeyword && setShowSearchDropdown(true)}
              allowClear
              size="small"
            />
            {showSearchDropdown && searchDropdown}
          </div>
        </div>
      </div>

      {/* 表格区域 */}
      <div ref={tableContainerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {activeGroup.stocks.length === 0 ? (
          <Empty description="暂无自选股，请搜索添加" style={{ marginTop: 80 }} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Spin spinning={loadingQuotes && sortedTableData.every(d => !d.price)}>
            <SheetComponent
              sheetType="table"
              dataCfg={s2DataCfg}
              options={s2Options}
              onMounted={handleS2Mounted}
              adaptive={{ width: true, height: false }}
            />
          </Spin>
        )}
      </div>
      
      {/* 右侧详情抽屉 */}
      <Drawer
        title={drawerTitle}
        placement="right"
        width={drawerWidth}
        open={!!selectedStock}
        onClose={() => { setSelectedStock(null); setSelectedRowIndex(-1); selectedRowIndexRef.current = -1 }}
        mask={false}
        styles={{ 
          header: { padding: '8px 16px', minHeight: 'auto' },
          body: { padding: 0, background: '#f5f5f5' },
          wrapper: { transition: isResizing ? 'none' : undefined }
        }}
      >
        {/* 左侧拖动条 */}
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 6,
            cursor: 'ew-resize',
            background: isResizing ? '#1890ff' : 'transparent',
            transition: 'background 0.2s',
            zIndex: 10,
          }}
          onMouseEnter={(e) => { if (!isResizing) e.currentTarget.style.background = '#e6e6e6' }}
          onMouseLeave={(e) => { if (!isResizing) e.currentTarget.style.background = 'transparent' }}
        />
        {selectedStock && (
          <StockDetail stock={selectedStock} market={selectedStock.market} />
        )}
      </Drawer>

      {/* 新建/编辑分组弹窗 */}
      <Modal
        title={editingGroup ? '编辑分组' : '新建分组'}
        open={groupModalVisible}
        onOk={handleGroupSubmit}
        onCancel={() => { setGroupModalVisible(false); setEditingGroup(null); groupForm.resetFields() }}
        width={360}
      >
        <Form form={groupForm} layout="vertical">
          <Form.Item name="name" label="分组名称" rules={[{ required: true, message: '请输入分组名称' }]}>
            <Input placeholder="请输入分组名称" maxLength={20} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
