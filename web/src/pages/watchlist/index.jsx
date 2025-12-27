import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import { Button, Input, Modal, Form, Empty, Popconfirm, message, Dropdown, Grid, Spin, Select, Tag, Table } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, MoreOutlined, SearchOutlined } from '@ant-design/icons'
import axios from 'axios'
import StockDetail from '../range-stats/StockDetail'
import { fetchStockInfo, fetchStockTrend } from '../../api/stock'
import { upColor, downColor } from '../../utils/chart'

const { useBreakpoint } = Grid

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

// 本地存储 key
const STORAGE_KEY = 'watchlist_data'
const DEFAULT_GROUP = { id: 'default', name: '默认分组', stocks: [] }

// 格式化数字
const formatNumber = (num, unit = '') => {
  if (num == null || isNaN(num)) return '--'
  if (num >= 100000000) return (num / 100000000).toFixed(0) + '亿' + unit
  if (num >= 10000) return (num / 10000).toFixed(0) + '万' + unit
  return num.toFixed(0) + unit
}

// 分时图Canvas组件 - 使用memo优化性能
const MiniTrendChart = memo(({ data, preClose, width = 80, height = 32 }) => {
  const canvasRef = useRef(null)
  
  useEffect(() => {
    if (!canvasRef.current || !data?.length) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    
    // 设置高清Canvas
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    ctx.scale(dpr, dpr)
    
    // 清空画布
    ctx.clearRect(0, 0, width, height)
    
    // 计算价格范围
    const prices = data.map(d => d[0])
    const minPrice = Math.min(...prices, preClose)
    const maxPrice = Math.max(...prices, preClose)
    const range = maxPrice - minPrice || 1
    const padding = range * 0.1
    const yMin = minPrice - padding
    const yMax = maxPrice + padding
    
    // 绘制昨收线
    const preCloseY = height - ((preClose - yMin) / (yMax - yMin)) * height
    ctx.strokeStyle = '#999'
    ctx.lineWidth = 0.5
    ctx.setLineDash([2, 2])
    ctx.beginPath()
    ctx.moveTo(0, preCloseY)
    ctx.lineTo(width, preCloseY)
    ctx.stroke()
    ctx.setLineDash([])
    
    // 绘制分时线
    const lastPrice = prices[prices.length - 1]
    ctx.strokeStyle = lastPrice >= preClose ? upColor : downColor
    ctx.lineWidth = 1
    ctx.beginPath()
    
    data.forEach((point, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - ((point[0] - yMin) / (yMax - yMin)) * height
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
    
    // 绘制均线
    ctx.strokeStyle = '#f5a623'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    data.forEach((point, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - ((point[1] - yMin) / (yMax - yMin)) * height
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
    
  }, [data, preClose, width, height])
  
  if (!data?.length) {
    return <div style={{ width, height, background: '#f9f9f9', borderRadius: 2 }} />
  }
  
  return <canvas ref={canvasRef} style={{ display: 'block' }} />
})

MiniTrendChart.displayName = 'MiniTrendChart'

export default function WatchlistPage() {
  const screens = useBreakpoint()
  const isMobile = !screens.md
  
  const [groups, setGroups] = useState([DEFAULT_GROUP])
  const [activeGroupId, setActiveGroupId] = useState('default')
  const [selectedStock, setSelectedStock] = useState(null)
  const [groupModalVisible, setGroupModalVisible] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [groupForm] = Form.useForm()
  
  // 搜索相关状态
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const searchTimeoutRef = useRef(null)
  const searchContainerRef = useRef(null)
  
  // 股票实时行情数据
  const [stockQuotes, setStockQuotes] = useState({})
  // 分时数据
  const [trendData, setTrendData] = useState({})
  const [loadingQuotes, setLoadingQuotes] = useState(false)

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowSearchDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 从本地存储加载数据
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const data = JSON.parse(saved)
        if (data.groups?.length > 0) {
          setGroups(data.groups)
          setActiveGroupId(data.activeGroupId || data.groups[0].id)
        }
      } catch (e) {
        console.error('加载自选股数据失败:', e)
      }
    }
  }, [])

  // 保存到本地存储
  const saveToStorage = useCallback((newGroups, newActiveId) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      groups: newGroups,
      activeGroupId: newActiveId
    }))
  }, [])

  // 获取当前分组
  const activeGroup = groups.find(g => g.id === activeGroupId) || groups[0]

  // 获取股票实时行情和分时数据
  const fetchAllData = useCallback(async (stocks) => {
    if (!stocks || stocks.length === 0) return
    
    setLoadingQuotes(true)
    const quoteResults = {}
    const trendResults = {}
    
    // 并行获取所有数据
    await Promise.all(
      stocks.map(async (stock) => {
        const key = `${stock.symbol}_${stock.market}`
        try {
          // 获取行情
          const info = await fetchStockInfo(stock.symbol, stock.name, stock.market)
          if (info) {
            quoteResults[key] = {
              price: info.latestPrice,
              changePct: info.changePct,
              changeAmt: info.changeAmt,
              totalMarketCap: info.totalMarketCap,
              amount: info.amount,
              volume: info.volume,
              turnoverRate: info.turnoverRate,
              peRatio: info.peRatio,
              preClose: info.preClose,
            }
          }
          // 获取分时数据
          const trend = await fetchStockTrend(stock.symbol, stock.market, 1)
          if (trend?.values?.length > 0) {
            trendResults[key] = {
              values: trend.values,
              preClose: trend.preClose
            }
          }
        } catch (e) {
          console.error('获取数据失败:', stock.symbol, e)
        }
      })
    )
    
    setStockQuotes(prev => ({ ...prev, ...quoteResults }))
    setTrendData(prev => ({ ...prev, ...trendResults }))
    setLoadingQuotes(false)
  }, [])

  // 当自选股列表变化时获取数据
  useEffect(() => {
    if (activeGroup?.stocks?.length > 0) {
      fetchAllData(activeGroup.stocks)
    }
  }, [activeGroup?.stocks, fetchAllData])

  // 搜索股票
  const handleSearch = useCallback(async (keyword) => {
    if (!keyword.trim()) {
      setSearchResults([])
      setShowSearchDropdown(false)
      return
    }
    
    setSearching(true)
    setShowSearchDropdown(true)
    
    try {
      const response = await axios.get('/api/v1/stock/search', {
        params: { keyword: keyword.trim(), limit: 20 }
      })
      const data = response.data?.data || []
      setSearchResults(data)
    } catch (error) {
      console.error('搜索股票失败:', error)
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  // 输入变化时防抖搜索
  const handleSearchInputChange = useCallback((e) => {
    const value = e.target.value
    setSearchKeyword(value)
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    
    if (!value.trim()) {
      setSearchResults([])
      setShowSearchDropdown(false)
      return
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(value)
    }, 300)
  }, [handleSearch])

  // 添加股票到自选
  const handleAddStock = useCallback((stock) => {
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
    saveToStorage(newGroups, activeGroupId)
    setSearchKeyword('')
    setSearchResults([])
    setShowSearchDropdown(false)
    message.success(`已添加 ${name}`)
    
    // 获取新添加股票的数据
    fetchAllData([newStock])
  }, [activeGroup, groups, activeGroupId, saveToStorage, fetchAllData])

  // 新增/编辑分组
  const handleGroupSubmit = useCallback(() => {
    groupForm.validateFields().then(values => {
      let newGroups
      if (editingGroup) {
        newGroups = groups.map(g => g.id === editingGroup.id ? { ...g, name: values.name } : g)
      } else {
        const newGroup = { id: Date.now().toString(), name: values.name, stocks: [] }
        newGroups = [...groups, newGroup]
      }
      setGroups(newGroups)
      saveToStorage(newGroups, activeGroupId)
      setGroupModalVisible(false)
      setEditingGroup(null)
      groupForm.resetFields()
      message.success(editingGroup ? '分组已更新' : '分组已创建')
    })
  }, [groupForm, editingGroup, groups, activeGroupId, saveToStorage])

  // 删除分组
  const handleDeleteGroup = useCallback((groupId) => {
    if (groups.length <= 1) {
      message.warning('至少保留一个分组')
      return
    }
    const newGroups = groups.filter(g => g.id !== groupId)
    const newActiveId = groupId === activeGroupId ? newGroups[0].id : activeGroupId
    setGroups(newGroups)
    setActiveGroupId(newActiveId)
    saveToStorage(newGroups, newActiveId)
    if (selectedStock && activeGroup.stocks.some(s => s.symbol === selectedStock.symbol)) {
      setSelectedStock(null)
    }
    message.success('分组已删除')
  }, [groups, activeGroupId, activeGroup, selectedStock, saveToStorage])

  // 删除股票
  const handleDeleteStock = useCallback((stock, e) => {
    e?.stopPropagation()
    const newGroups = groups.map(g => {
      if (g.id === activeGroupId) {
        return { ...g, stocks: g.stocks.filter(s => !(s.symbol === stock.symbol && s.market === stock.market)) }
      }
      return g
    })
    setGroups(newGroups)
    saveToStorage(newGroups, activeGroupId)
    if (selectedStock?.symbol === stock.symbol) {
      setSelectedStock(null)
    }
    message.success('股票已移除')
  }, [groups, activeGroupId, selectedStock, saveToStorage])

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
      const trend = trendData[key]
      return {
        key,
        ...stock,
        ...quote,
        trendValues: trend?.values,
        trendPreClose: trend?.preClose || quote.preClose,
      }
    })
  }, [activeGroup.stocks, stockQuotes, trendData])

  // 表格列定义 - 根据是否选中调整
  const columns = useMemo(() => {
    const baseColumns = [
      {
        title: '名称',
        dataIndex: 'name',
        key: 'name',
        width: selectedStock ? 130 : 180,
        fixed: selectedStock ? undefined : 'left',
        render: (name, record) => {
          const tagConfig = MARKET_TAG_CONFIG[record.market] || MARKET_TAG_CONFIG.hk
          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Tag color={tagConfig.color} style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '14px' }}>
                  {tagConfig.text}
                </Tag>
                <span style={{ fontWeight: 500, fontSize: 13 }}>{name}</span>
              </div>
              <div style={{ fontSize: 11, color: '#999' }}>{record.symbol}</div>
            </div>
          )
        }
      },
      {
        title: '价格',
        dataIndex: 'price',
        key: 'price',
        width: 80,
        align: 'right',
        render: (price, record) => {
          const color = record.changePct > 0 ? upColor : record.changePct < 0 ? downColor : '#666'
          return (
            <span style={{ color, fontWeight: 500, fontFamily: 'monospace', fontSize: 13 }}>
              {price?.toFixed(2) || '--'}
            </span>
          )
        }
      },
    ]
    
    // 未选中时显示分时图和更多列
    if (!selectedStock) {
      baseColumns.push(
        {
          title: '分时',
          key: 'trend',
          width: 100,
          render: (_, record) => (
            <MiniTrendChart 
              data={record.trendValues} 
              preClose={record.trendPreClose}
              width={90}
              height={32}
            />
          )
        },
        {
          title: '总市值',
          dataIndex: 'totalMarketCap',
          key: 'totalMarketCap',
          width: 100,
          align: 'right',
          render: (v) => <span style={{ fontSize: 12 }}>{formatNumber(v)}</span>
        },
        {
          title: '成交量',
          dataIndex: 'volume',
          key: 'volume',
          width: 100,
          align: 'right',
          render: (v) => <span style={{ fontSize: 12 }}>{formatNumber(v)}</span>
        },
        {
          title: '当日涨跌',
          dataIndex: 'changePct',
          key: 'changePct',
          width: 100,
          align: 'right',
          sorter: (a, b) => (a.changePct || 0) - (b.changePct || 0),
          render: (pct) => {
            if (pct == null) return '--'
            const color = pct > 0 ? upColor : pct < 0 ? downColor : '#666'
            return (
              <span style={{ 
                color: '#fff', 
                background: color, 
                padding: '2px 8px', 
                borderRadius: 4,
                fontSize: 12,
                fontFamily: 'monospace'
              }}>
                {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
              </span>
            )
          }
        },
        {
          title: '换手率',
          dataIndex: 'turnoverRate',
          key: 'turnoverRate',
          width: 80,
          align: 'right',
          render: (v) => <span style={{ fontSize: 12 }}>{v != null ? v.toFixed(2) + '%' : '--'}</span>
        },
        {
          title: 'PE',
          dataIndex: 'peRatio',
          key: 'peRatio',
          width: 70,
          align: 'right',
          render: (v) => <span style={{ fontSize: 12 }}>{v != null ? v.toFixed(1) : '--'}</span>
        }
      )
    } else {
      // 选中时只显示涨跌
      baseColumns.push({
        title: '涨跌',
        dataIndex: 'changePct',
        key: 'changePct',
        width: 65,
        align: 'right',
        render: (pct) => {
          if (pct == null) return '--'
          const color = pct > 0 ? upColor : pct < 0 ? downColor : '#666'
          return (
            <span style={{ color, fontSize: 12, fontFamily: 'monospace' }}>
              {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
            </span>
          )
        }
      })
    }
    
    // 操作列
    baseColumns.push({
      title: '',
      key: 'action',
      width: 40,
      render: (_, record) => (
        <Popconfirm 
          title="确定移除？" 
          onConfirm={(e) => handleDeleteStock(record, e)} 
          okText="确定" 
          cancelText="取消"
          onPopupClick={e => e.stopPropagation()}
        >
          <Button 
            type="text" 
            size="small" 
            icon={<DeleteOutlined />} 
            onClick={e => e.stopPropagation()} 
            style={{ color: '#999', padding: '0 4px' }} 
          />
        </Popconfirm>
      )
    })
    
    return baseColumns
  }, [selectedStock, handleDeleteStock])

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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'row', background: '#fff', overflow: 'hidden' }}>
      {/* 左侧列表区域 */}
      <div style={{ 
        width: selectedStock ? 280 : '100%',
        minWidth: selectedStock ? 280 : 600,
        display: 'flex',
        flexDirection: 'column',
        borderRight: selectedStock ? '1px solid #e8e8e8' : 'none',
        overflow: 'hidden',
        flexShrink: 0,
        transition: 'width 0.2s'
      }}>
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
            <div style={{ flex: 1 }} />
            <div ref={searchContainerRef} style={{ position: 'relative', width: selectedStock ? 100 : 240 }}>
              <Input
                placeholder={selectedStock ? "搜索" : "搜索代码或名称添加股票"}
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
        <div style={{ flex: 1, overflow: 'auto' }}>
          {activeGroup.stocks.length === 0 ? (
            <Empty description="暂无自选股，请搜索添加" style={{ marginTop: 80 }} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Spin spinning={loadingQuotes && tableData.every(d => !d.price)}>
              <Table
                dataSource={tableData}
                columns={columns}
                pagination={false}
                size="small"
                scroll={{ x: selectedStock ? 260 : 800 }}
                rowClassName={(record) => 
                  selectedStock?.symbol === record.symbol && selectedStock?.market === record.market 
                    ? 'ant-table-row-selected' 
                    : ''
                }
                onRow={(record) => ({
                  onClick: () => setSelectedStock({ symbol: record.symbol, name: record.name, market: record.market }),
                  style: { cursor: 'pointer' }
                })}
                virtual={tableData.length > 50}
              />
            </Spin>
          )}
        </div>
      </div>
      
      {/* 右侧详情区域 - 只在选中时显示 */}
      {selectedStock && (
        <div style={{ flex: 1, overflow: 'auto', background: '#f5f5f5', minWidth: 0 }}>
          <StockDetail stock={selectedStock} market={selectedStock.market} />
        </div>
      )}

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
      
      <style>{`
        .ant-table-row-selected td {
          background: #e6f7ff !important;
        }
        .ant-table-row:hover td {
          background: #fafafa !important;
        }
        .ant-table-row-selected:hover td {
          background: #e6f7ff !important;
        }
      `}</style>
    </div>
  )
}
