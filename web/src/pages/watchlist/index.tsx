import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { Button, Input, Modal, Form, Empty, message, Dropdown, Spin, Select, Tag, Drawer, Tooltip } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, MoreOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { ListTable } from '@visactor/react-vtable'
import { createGroup, createLine, createRect } from '@visactor/vtable/es/vrender'
import { useLocalStorageState, useRequest, useDebounceFn, useKeyPress, useClickAway, useInterval, useMemoizedFn } from 'ahooks'
import axios from 'axios'
import StockDetail from '../range-stats/StockDetail'
import { fetchStockInfo } from '../../api/stock'
import { fetchTrendData } from '../../utils/dataSourceAdapter'
import { DataSourceBadge } from '../../components/DataSourceBadge'
import { upColor, downColor } from '../../utils/chart'
import { useTheme, getVTableTheme } from '../../contexts/ThemeContext'
import { StockTableToolbar, exportColumnPresets } from '../../components/StockTable'

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
  if (day === 0 || day === 6) return false
  
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const time = hours * 100 + minutes
  
  return time >= 915 && time <= 1610
}

// 本地存储 key
const STORAGE_KEY = 'watchlist_data'
const DRAWER_WIDTH_KEY = 'watchlist_drawer_width'
const DEFAULT_GROUP = { id: 'default', name: '默认分组', stocks: [] }
const DEFAULT_DRAWER_WIDTH = 800
const MIN_DRAWER_WIDTH = 400
const MAX_DRAWER_WIDTH_RATIO = 0.9
const POLL_INTERVAL = 10000

export default function WatchlistPage() {
  const { vtableTheme, theme: currentTheme, isDark } = useTheme()
  
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
  
  const [searchKeyword, setSearchKeyword] = useState('')
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const searchContainerRef = useRef(null)
  
  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, stock: null })
  
  const [stockQuotes, setStockQuotes] = useState({})
  const [trendDataMap, setTrendDataMap] = useState({})
  
  const tableContainerRef = useRef(null)
  const vtableRef = useRef(null)
  const stockDataRef = useRef([])
  
  const activeGroup = groups.find(g => g.id === activeGroupId) || groups[0]
  
  useClickAway(() => {
    setShowSearchDropdown(false)
  }, searchContainerRef)
  
  // 点击页面任意位置关闭右键菜单
  useEffect(() => {
    const handleClick = () => setContextMenu(prev => ({ ...prev, visible: false }))
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])
  
  // 获取所有股票数据
  const fetchAllStockData = useMemoizedFn(async (stocks, includeTrend = true) => {
    if (!stocks?.length) return {}
    
    const results = {}
    const trendResults = {}
    
    await Promise.all(
      stocks.map(async (stock) => {
        const key = `${stock.symbol}_${stock.market}`
        try {
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
          
          if (includeTrend) {
            const trend = await fetchTrendData(stock.symbol, stock.market)
            if (trend?.length) {
              trendResults[key] = {
                data: trend,
                preClose: trend[0]?.avgPrice || 0
              }
            }
          }
        } catch (e) {
          console.error('获取数据失败:', stock.symbol, e)
        }
      })
    )
    
    setStockQuotes(prev => ({ ...prev, ...results }))
    if (includeTrend) {
      // 直接替换分时数据，不合并旧数据
      setTrendDataMap(trendResults)
    }
    
    return results
  })
  
  const { loading: loadingQuotes, run: runFetchData } = useRequest(
    () => fetchAllStockData(activeGroup.stocks, true),
    {
      refreshDeps: [activeGroup?.stocks],
      ready: activeGroup?.stocks?.length > 0,
    }
  )
  
  useInterval(
    async () => {
      if (activeGroup?.stocks?.length > 0 && isTradeTime()) {
        await fetchAllStockData(activeGroup.stocks, false)
      }
    },
    isTradeTime() ? POLL_INTERVAL : undefined
  )
  
  const handleRefresh = useMemoizedFn(() => {
    if (activeGroup?.stocks?.length > 0) {
      runFetchData()
      message.success('刷新成功')
    }
  })
  
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
    
    fetchAllStockData([newStock], true)
  })

  // 删除自选股
  const handleRemoveStock = useMemoizedFn((stock) => {
    const newGroups = groups.map(g => {
      if (g.id === activeGroupId) {
        return { ...g, stocks: g.stocks.filter(s => !(s.symbol === stock.symbol && s.market === stock.market)) }
      }
      return g
    })
    setGroups(newGroups)
    
    // 如果删除的是当前选中的股票，清除选中状态
    if (selectedStock?.symbol === stock.symbol && selectedStock?.market === stock.market) {
      setSelectedStock(null)
      setSelectedRowIndex(-1)
    }
    
    message.success(`已删除 ${stock.name}`)
  })

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

  const groupDropdownItems = [
    { key: 'edit', icon: <EditOutlined />, label: '编辑分组', onClick: () => { setEditingGroup(activeGroup); groupForm.setFieldsValue({ name: activeGroup.name }); setGroupModalVisible(true) } },
    { key: 'delete', icon: <DeleteOutlined />, label: '删除分组', danger: true, onClick: () => groups.length > 1 ? handleDeleteGroup(activeGroupId) : message.warning('至少保留一个分组') },
  ]

  // 表格数据
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

  stockDataRef.current = tableData

  // 键盘上下键切换
  useKeyPress(['uparrow', 'downarrow'], (event) => {
    if (tableData.length === 0) return
    
    event.preventDefault()
    
    let newIndex = selectedRowIndex
    if (event.key === 'ArrowUp') {
      newIndex = selectedRowIndex <= 0 ? 0 : selectedRowIndex - 1
    } else if (event.key === 'ArrowDown') {
      newIndex = selectedRowIndex < 0 ? 0 : Math.min(tableData.length - 1, selectedRowIndex + 1)
    }
    
    if (tableData[newIndex]) {
      const stock = tableData[newIndex]
      setSelectedRowIndex(newIndex)
      setSelectedStock({ symbol: stock.symbol, name: stock.name, market: stock.market })
      
      // 选中整行
      if (vtableRef.current) {
        vtableRef.current.selectRow(newIndex + 1) // VTable行号从1开始（0是表头）
      }
    }
  }, { exactMatch: true })
  
  useKeyPress(['leftarrow', 'rightarrow'], (event) => {
    if (selectedStock) {
      event.preventDefault()
    }
  })

  // 迷你分时图自定义渲染 - 使用 VRender 图元
  const renderSparkline = useCallback((args) => {
    const { table, row, col, rect } = args
    const record = table.getCellOriginRecord(col, row)
    
    const { width, height } = rect
    const padding = 4
    const chartWidth = width - padding * 2
    const chartHeight = height - padding * 2
    
    const container = createGroup({
      width,
      height,
    })
    
    if (!record?.trendData?.length) {
      // 无数据时显示灰色背景
      const bgRect = createRect({
        x: padding,
        y: padding,
        width: chartWidth,
        height: chartHeight,
        fill: isDark ? '#333' : '#f5f5f5',
      })
      container.add(bgRect)
      return {
        rootContainer: container,
        renderDefault: false,
      }
    }
    
    const trendData = record.trendData
    const preClose = record.trendPreClose || record.preClose
    const changePct = record.changePct
    const market = record.market || 'a'
    
    // A股一天 240 分钟 (9:30-11:30 = 120分钟, 13:00-15:00 = 120分钟)
    // 港股一天 330 分钟 (9:30-12:00 = 150分钟, 13:00-16:00 = 180分钟)
    const totalMinutes = market === 'hk' ? 330 : 240
    
    const prices = trendData.map(d => d[0])
    const min = Math.min(...prices, preClose || prices[0])
    const max = Math.max(...prices, preClose || prices[0])
    const range = max - min || 1
    
    // 昨收虚线
    if (preClose) {
      const preCloseY = padding + chartHeight - ((preClose - min) / range) * chartHeight
      const preCloseLine = createLine({
        points: [
          { x: padding, y: preCloseY },
          { x: padding + chartWidth, y: preCloseY }
        ],
        stroke: isDark ? '#666' : '#999',
        lineWidth: 0.5,
        lineDash: [2, 2],
      })
      container.add(preCloseLine)
    }
    
    // 分时线 - x坐标按时间比例计算，未完成的交易日右边留空
    const color = changePct >= 0 ? upColor : downColor
    const points = trendData.map((d, i) => ({
      x: padding + (i / totalMinutes) * chartWidth,
      y: padding + chartHeight - ((d[0] - min) / range) * chartHeight
    }))
    
    const trendLine = createLine({
      points,
      stroke: color,
      lineWidth: 1.5,
    })
    container.add(trendLine)
    
    return {
      rootContainer: container,
      renderDefault: false,
    }
  }, [isDark])

  // VTable 列配置
  const columns = useMemo(() => [
    { field: 'symbol', title: '代码', width: 70 },
    { 
      field: 'name', 
      title: '名称', 
      width: 80,
      style: { color: '#1677ff', fontWeight: 500, cursor: 'pointer' }
    },
    { 
      field: 'trend', 
      title: '走势', 
      width: 90,
      customLayout: renderSparkline,
    },
    { 
      field: 'price', 
      title: '现价', 
      width: 70,
      fieldFormat: (record) => record.price?.toFixed(2) || '-',
      style: (args) => {
        const record = args.table?.getCellOriginRecord(args.col, args.row)
        const changePct = record?.changePct
        return {
          color: changePct > 0 ? upColor : changePct < 0 ? downColor : vtableTheme.textColor,
        }
      }
    },
    { 
      field: 'changePct', 
      title: '涨跌幅', 
      width: 75,
      fieldFormat: (record) => record.changePct != null ? `${record.changePct >= 0 ? '+' : ''}${record.changePct.toFixed(2)}%` : '-',
      style: (args) => {
        const record = args.table?.getCellOriginRecord(args.col, args.row)
        const changePct = record?.changePct
        return {
          color: changePct > 0 ? upColor : changePct < 0 ? downColor : vtableTheme.textColor,
          fontWeight: 500,
        }
      }
    },
    { 
      field: 'marketCap', 
      title: '市值', 
      width: 70,
      fieldFormat: (record) => record.totalMarketCap ? `${(record.totalMarketCap / 100000000).toFixed(0)}亿` : '-',
    },
    { 
      field: 'amount', 
      title: '成交额', 
      width: 75,
      fieldFormat: (record) => record.amount ? `${(record.amount / 100000000).toFixed(2)}亿` : '-',
    },
    { 
      field: 'turnoverRate', 
      title: '换手率', 
      width: 70,
      fieldFormat: (record) => record.turnoverRate != null ? `${record.turnoverRate.toFixed(2)}%` : '-',
    },
    { 
      field: 'peRatio', 
      title: 'PE', 
      width: 60,
      fieldFormat: (record) => record.peRatio != null ? record.peRatio.toFixed(1) : '-',
    },
    { 
      field: 'pbRatio', 
      title: 'PB', 
      width: 55,
      fieldFormat: (record) => record.pbRatio != null ? record.pbRatio.toFixed(2) : '-',
    },
    { 
      field: 'amplitude', 
      title: '振幅', 
      width: 60,
      fieldFormat: (record) => record.amplitude != null ? `${record.amplitude.toFixed(2)}%` : '-',
    },
    { 
      field: 'high', 
      title: '最高', 
      width: 65,
      fieldFormat: (record) => record.high?.toFixed(2) || '-',
    },
    { 
      field: 'low', 
      title: '最低', 
      width: 65,
      fieldFormat: (record) => record.low?.toFixed(2) || '-',
    },
    { 
      field: 'open', 
      title: '今开', 
      width: 65,
      fieldFormat: (record) => record.open?.toFixed(2) || '-',
    },
    { 
      field: 'preClose', 
      title: '昨收', 
      width: 65,
      fieldFormat: (record) => record.preClose?.toFixed(2) || '-',
    },
  ], [renderSparkline, vtableTheme.textColor])

  // VTable 配置 - 使用主题
  const baseVTableTheme = useMemo(() => getVTableTheme(vtableTheme, { rowHeight: 40, headerRowHeight: 32, fontSize: 13 }), [vtableTheme])
  
  const vtableOption = useMemo(() => ({
    columns,
    records: tableData,
    ...baseVTableTheme,
    widthMode: 'adaptive',
    autoWrapText: false,
    hover: {
      highlightMode: 'row',
    },
    select: {
      highlightMode: 'row',
    },
    rowSeriesNumber: {
      title: '',
      width: 30,
      headerStyle: {
        color: 'transparent',
      },
      style: {
        color: '#999',
        fontSize: 11,
      },
      dragOrder: true,
    },
  }), [columns, tableData, baseVTableTheme])

  // 处理表格点击事件 - 点击任意单元格都选中整行
  const handleTableClick = useCallback((args) => {
    const { col, row } = args
    if (row === 0) return // 表头
    
    const record = vtableRef.current?.getRecordByRowCol(col, row)
    if (!record) return
    
    const rowIndex = row - 1
    setSelectedRowIndex(rowIndex)
    setSelectedStock({ symbol: record.symbol, name: record.name, market: record.market })
    
    // 选中整行
    vtableRef.current?.selectRow(row)
  }, [])

  // 处理右键菜单
  const handleContextMenu = useCallback((args) => {
    const { col, row, event } = args
    if (row === 0) return // 表头不处理
    
    const record = vtableRef.current?.getRecordByRowCol(col, row)
    if (!record) return
    
    event.preventDefault()
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      stock: { symbol: record.symbol, name: record.name, market: record.market }
    })
  }, [])

  // 处理拖拽排序
  const handleDragEnd = useCallback((args) => {
    const { source, target } = args
    if (!source || !target || source.row === target.row) return
    
    // source.row 和 target.row 是 VTable 的行号（从1开始，0是表头）
    const fromIndex = source.row - 1
    const toIndex = target.row - 1
    
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= activeGroup.stocks.length || toIndex >= activeGroup.stocks.length) return
    
    const newStocks = [...activeGroup.stocks]
    const [removed] = newStocks.splice(fromIndex, 1)
    newStocks.splice(toIndex, 0, removed)
    
    const newGroups = groups.map(g => {
      if (g.id === activeGroupId) {
        return { ...g, stocks: newStocks }
      }
      return g
    })
    setGroups(newGroups)
  }, [activeGroup.stocks, groups, activeGroupId, setGroups])

  // VTable 挂载后绑定事件
  const handleVTableReady = useCallback((instance) => {
    vtableRef.current = instance
    instance.on('click_cell', handleTableClick)
    instance.on('contextmenu_cell', handleContextMenu)
    // 监听行拖拽排序事件
    instance.on('change_header_position', handleDragEnd)
  }, [handleTableClick, handleContextMenu, handleDragEnd])

  // 监听 tableData 变化，更新 VTable
  useEffect(() => {
    if (vtableRef.current && tableData.length > 0) {
      vtableRef.current.setRecords(tableData)
    }
  }, [tableData])

  // 选中股票的行情
  const selectedStockQuote = useMemo(() => {
    if (!selectedStock) return null
    const key = `${selectedStock.symbol}_${selectedStock.market}`
    return stockQuotes[key] || {}
  }, [selectedStock, stockQuotes])

  // Drawer 标题
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

  // Drawer 拖动
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

  // 搜索下拉框
  const dropdownBg = isDark ? '#1f1f1f' : '#fff'
  const dropdownHoverBg = isDark ? '#2a2a2a' : '#f5f5f5'
  const dropdownBorderColor = isDark ? '#333' : '#f5f5f5'
  const dropdownDisabledBg = isDark ? '#252525' : '#fafafa'
  
  const searchDropdown = (
    <div style={{
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      maxHeight: 300,
      overflow: 'auto',
      background: dropdownBg,
      borderRadius: 8,
      boxShadow: isDark ? '0 6px 16px rgba(0,0,0,0.4)' : '0 6px 16px rgba(0,0,0,0.12)',
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
                borderBottom: index < searchResults.length - 1 ? `1px solid ${dropdownBorderColor}` : 'none',
                background: isAdded ? dropdownDisabledBg : dropdownBg,
                opacity: isAdded ? 0.6 : 1,
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => !isAdded && (e.currentTarget.style.background = dropdownHoverBg)}
              onMouseLeave={(e) => !isAdded && (e.currentTarget.style.background = isAdded ? dropdownDisabledBg : dropdownBg)}
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
                  <div style={{ fontWeight: 500, fontSize: 14, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isDark ? '#d4d4d4' : 'inherit' }}>
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: currentTheme.custom.bgColor, overflow: 'hidden' }}>
      {/* 顶部工具栏 */}
      <div style={{ padding: '8px 16px', borderBottom: `1px solid ${currentTheme.custom.borderColor}`, flexShrink: 0 }}>
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
          
          <DataSourceBadge showIcon={false} style={{ fontSize: 11 }} />
          
          <StockTableToolbar
            data={tableData}
            columns={exportColumnPresets.watchlist}
            title={`自选股 - ${activeGroup.name}`}
            fileName={`自选股_${activeGroup.name}`}
            sheetName="自选股"
            containerRef={tableContainerRef}
            isDark={isDark}
          />
          
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
      <div ref={tableContainerRef} style={{ flex: 1, overflow: 'hidden', background: currentTheme.custom.bgColor }}>
        {activeGroup.stocks.length === 0 ? (
          <Empty description="暂无自选股，请搜索添加" style={{ marginTop: 80 }} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Spin spinning={loadingQuotes && tableData.every(d => !d.price)}>
            <ListTable
              option={vtableOption}
              onReady={handleVTableReady}
              height={window.innerHeight - 120}
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
        onClose={() => { setSelectedStock(null); setSelectedRowIndex(-1) }}
        mask={false}
        styles={{ 
          header: { padding: '8px 16px', minHeight: 'auto' },
          body: { padding: 0, background: currentTheme.custom.bgColorSecondary },
          wrapper: { transition: isResizing ? 'none' : undefined }
        }}
      >
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

      {/* 右键菜单 */}
      {contextMenu.visible && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: isDark ? '#1f1f1f' : '#fff',
            borderRadius: 6,
            boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1050,
            minWidth: 120,
            overflow: 'hidden',
          }}
        >
          <div
            onClick={() => {
              if (contextMenu.stock) {
                handleRemoveStock(contextMenu.stock)
              }
              setContextMenu({ visible: false, x: 0, y: 0, stock: null })
            }}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#ff4d4f',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = isDark ? '#2a2a2a' : '#f5f5f5'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <DeleteOutlined />
            <span>删除自选</span>
          </div>
        </div>
      )}
    </div>
  )
}
