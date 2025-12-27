import { useState, useEffect, useCallback, useRef } from 'react'
import { Layout, Button, Input, Modal, Form, Empty, Popconfirm, message, Dropdown, Grid, Spin, Select, Tag } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, MoreOutlined, StarFilled, SearchOutlined } from '@ant-design/icons'
import axios from 'axios'
import StockDetail from '../range-stats/StockDetail'
import { fetchStockInfo } from '../../api/stock'

const { Sider, Content } = Layout
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

// 默认分组
const DEFAULT_GROUP = { id: 'default', name: '默认分组', stocks: [] }

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

  // 获取股票实时行情
  const fetchQuotes = useCallback(async (stocks) => {
    if (!stocks || stocks.length === 0) return
    
    const results = {}
    await Promise.all(
      stocks.map(async (stock) => {
        try {
          const info = await fetchStockInfo(stock.symbol, stock.name, stock.market)
          if (info) {
            results[`${stock.symbol}_${stock.market}`] = {
              price: info.latestPrice,
              changePct: info.changePct,
            }
          }
        } catch (e) {
          console.error('获取行情失败:', stock.symbol, e)
        }
      })
    )
    setStockQuotes(prev => ({ ...prev, ...results }))
  }, [])

  // 当自选股列表变化时获取行情
  useEffect(() => {
    if (activeGroup?.stocks?.length > 0) {
      fetchQuotes(activeGroup.stocks)
    }
  }, [activeGroup?.stocks, fetchQuotes])

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
    
    // 检查是否已存在
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
  }, [activeGroup, groups, activeGroupId, saveToStorage])

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
  const handleDeleteStock = useCallback((stock) => {
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

  // 左侧面板
  const siderContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 分组选择 */}
      <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Select
            value={activeGroupId}
            onChange={setActiveGroupId}
            style={{ flex: 1 }}
            size="small"
            options={groups.map(g => ({ value: g.id, label: `${g.name} (${g.stocks.length})` }))}
          />
          <Dropdown menu={{ items: groupDropdownItems }} trigger={['click']}>
            <Button size="small" icon={<MoreOutlined />} />
          </Dropdown>
          <Button size="small" icon={<PlusOutlined />} onClick={() => { setEditingGroup(null); groupForm.resetFields(); setGroupModalVisible(true) }} />
        </div>
        
        {/* 搜索添加股票 */}
        <div ref={searchContainerRef} style={{ position: 'relative' }}>
          <Input
            placeholder="搜索代码或名称添加股票"
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={searchKeyword}
            onChange={handleSearchInputChange}
            onFocus={() => searchKeyword && setShowSearchDropdown(true)}
            allowClear
            size="small"
          />
          
          {/* 搜索结果下拉框 */}
          {showSearchDropdown && (
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
          )}
        </div>
      </div>

      {/* 股票列表 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeGroup.stocks.length === 0 ? (
          <Empty description="暂无自选股" style={{ marginTop: 40 }} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div style={{ padding: '4px 0' }}>
            {activeGroup.stocks.map(stock => {
              const tagConfig = MARKET_TAG_CONFIG[stock.market] || MARKET_TAG_CONFIG.hk
              const quote = stockQuotes[`${stock.symbol}_${stock.market}`]
              const isSelected = selectedStock?.symbol === stock.symbol && selectedStock?.market === stock.market
              const priceColor = quote?.changePct > 0 ? '#f5222d' : quote?.changePct < 0 ? '#52c41a' : '#666'
              
              return (
                <div
                  key={`${stock.symbol}_${stock.market}`}
                  onClick={() => setSelectedStock(stock)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    background: isSelected ? '#e6f7ff' : 'transparent',
                    borderLeft: isSelected ? '3px solid #1890ff' : '3px solid transparent',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => !isSelected && (e.currentTarget.style.background = '#fafafa')}
                  onMouseLeave={e => !isSelected && (e.currentTarget.style.background = 'transparent')}
                >
                  <Tag color={tagConfig.color} style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', flexShrink: 0 }}>
                    {tagConfig.text}
                  </Tag>
                  <span style={{ 
                    flex: 1, 
                    margin: '0 8px', 
                    fontWeight: 500, 
                    fontSize: 13,
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    minWidth: 0 
                  }}>
                    {stock.name}
                  </span>
                  <span style={{ 
                    fontSize: 12, 
                    color: priceColor, 
                    fontFamily: 'monospace',
                    minWidth: 50,
                    textAlign: 'right',
                    flexShrink: 0
                  }}>
                    {quote?.price?.toFixed(2) || '--'}
                  </span>
                  <span style={{ 
                    fontSize: 11, 
                    color: priceColor, 
                    fontFamily: 'monospace',
                    minWidth: 50,
                    textAlign: 'right',
                    marginLeft: 4,
                    flexShrink: 0
                  }}>
                    {quote?.changePct != null ? `${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(2)}%` : '--'}
                  </span>
                  <Popconfirm 
                    title="确定移除？" 
                    onConfirm={(e) => { e.stopPropagation(); handleDeleteStock(stock) }} 
                    okText="确定" 
                    cancelText="取消"
                  >
                    <Button 
                      type="text" 
                      size="small" 
                      icon={<DeleteOutlined />} 
                      onClick={e => e.stopPropagation()} 
                      style={{ color: '#999', marginLeft: 4, padding: '0 4px' }} 
                    />
                  </Popconfirm>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <Layout style={{ height: '100%', background: '#fff' }}>
      <Sider 
        width={240} 
        theme="light" 
        style={{ 
          borderRight: '1px solid #f0f0f0',
          height: isMobile ? 'auto' : 'calc(100vh - 64px)',
          overflow: 'hidden'
        }}
      >
        {siderContent}
      </Sider>
      
      <Content style={{ overflow: 'auto', background: '#f5f5f5' }}>
        {selectedStock ? (
          <StockDetail stock={selectedStock} market={selectedStock.market} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400 }}>
            <Empty 
              description="请从左侧选择一只股票查看详情" 
              image={<StarFilled style={{ fontSize: 64, color: '#d9d9d9' }} />}
            />
          </div>
        )}
      </Content>

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
    </Layout>
  )
}
