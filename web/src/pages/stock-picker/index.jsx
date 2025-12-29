import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Segmented, Select, Tag, Empty, Spin, message } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { ListTable } from '@visactor/react-vtable'
import { useKeyPress } from 'ahooks'
import axios from 'axios'
import StockDetail from '../range-stats/StockDetail'
import { upColor, downColor } from '../../utils/chart'

// 异动类型
const signalOptions = [
  { label: '全部', value: 'all' },
  { label: '放量突破', value: 'volume_breakout' },
  { label: '底部放量', value: 'bottom_volume' },
  { label: '放量后走平', value: 'volume_then_flat' },
  { label: '均线多头', value: 'ma_bull' },
  { label: '金叉信号', value: 'golden_cross' },
  { label: '涨停板', value: 'limit_up' },
  { label: '连板股', value: 'continuous_limit' },
  { label: '首板股', value: 'first_limit' },
]

// 市值范围
const marketCapOptions = [
  { label: '全部', value: 'all' },
  { label: '微盘(<50亿)', value: 'micro' },
  { label: '小盘(50-200亿)', value: 'small' },
  { label: '中盘(200-500亿)', value: 'mid' },
  { label: '大盘(500-2000亿)', value: 'large' },
  { label: '超大盘(>2000亿)', value: 'mega' },
]

// 行情选股页面
export default function StockPickerPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tableRef = useRef(null)
  const vtableRef = useRef(null)
  
  // 筛选条件
  const market = searchParams.get('market') || 'A股'
  const theme = searchParams.get('theme') || 'all'
  const signal = searchParams.get('signal') || 'all'
  const marketCap = searchParams.get('cap') || 'all'
  
  // 状态
  const [stocks, setStocks] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedStock, setSelectedStock] = useState(null)
  const [industries, setIndustries] = useState([])

  // 更新URL参数
  const updateParam = useCallback((key, value) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      if (value === 'all' || value === 'A股') {
        newParams.delete(key)
      } else {
        newParams.set(key, value)
      }
      return newParams
    })
  }, [setSearchParams])

  // 加载行业列表
  useEffect(() => {
    const marketCode = market === 'A股' ? 'a' : 'hk'
    axios.get('/api/v1/stock/picker/industries', { params: { market: marketCode } })
      .then(res => {
        if (res.data?.code === 0 && res.data?.data) {
          const options = [
            { label: '全部', value: 'all' },
            ...res.data.data.map(ind => ({ label: ind, value: ind }))
          ]
          setIndustries(options)
        }
      })
      .catch(() => {})
  }, [market])

  // 加载股票数据
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const marketCode = market === 'A股' ? 'a' : 'hk'
        const res = await axios.get('/api/v1/stock/picker', {
          params: {
            market: marketCode,
            theme: theme,
            signal: signal,
            marketCap: marketCap,
            limit: 200,
          }
        })
        
        if (res.data?.code === 0) {
          const data = res.data.data || []
          // 转换数据格式
          const formattedData = data.map(item => ({
            symbol: item.symbol,
            name: item.name,
            market: item.market,
            changePct: item.changePct,
            latestPrice: item.latestPrice,
            totalMarketCap: item.totalMarketCap,
            industry: item.industry,
            signal: item.signal,
            signalStrength: item.signalStrength,
            volume: item.volume,
            turnoverRate: item.turnoverRate,
          }))
          
          setStocks(formattedData)
          setTotal(res.data.total || formattedData.length)
          setSelectedIndex(0)
          if (formattedData.length > 0) {
            setSelectedStock(formattedData[0])
          } else {
            setSelectedStock(null)
          }
        } else {
          message.error(res.data?.message || '获取数据失败')
        }
      } catch (err) {
        console.error('获取选股数据失败:', err)
        message.error('获取数据失败，请稍后重试')
      } finally {
        setLoading(false)
      }
    }
    
    fetchData()
  }, [market, theme, signal, marketCap])

  // 键盘上下键切换
  useKeyPress(['uparrow', 'downarrow'], (event) => {
    if (stocks.length === 0) return
    
    event.preventDefault()
    
    let newIndex = selectedIndex
    if (event.key === 'ArrowUp') {
      newIndex = selectedIndex <= 0 ? 0 : selectedIndex - 1
    } else if (event.key === 'ArrowDown') {
      newIndex = selectedIndex < 0 ? 0 : Math.min(stocks.length - 1, selectedIndex + 1)
    }
    
    if (stocks[newIndex]) {
      setSelectedIndex(newIndex)
      setSelectedStock(stocks[newIndex])
      
      // 选中整行
      if (vtableRef.current) {
        vtableRef.current.selectRow(newIndex + 1)
      }
    }
  }, { exactMatch: true })

  // VTable 配置
  const tableOption = useMemo(() => ({
    columns: [
      { 
        field: 'name', 
        title: '股票', 
        width: 'auto',
        style: {
          fontSize: 12,
          fontWeight: 500,
          color: '#262626',
          padding: [8, 8]
        }
      },
      { 
        field: 'changePct', 
        title: '涨跌', 
        width: 70,
        style: (args) => {
          const value = args.value
          return {
            fontSize: 12,
            fontWeight: 500,
            color: value >= 0 ? upColor : downColor,
            padding: [8, 8],
            textAlign: 'right'
          }
        },
        fieldFormat: (record) => {
          const value = record.changePct
          return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
        }
      },
    ],
    records: stocks,
    defaultRowHeight: 36,
    autoFillWidth: true,
    hover: {
      highlightMode: 'row'
    },
    select: {
      highlightMode: 'row'
    },
    theme: {
      defaultStyle: {
        fontSize: 12,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      },
      headerStyle: {
        fontSize: 11,
        fontWeight: 600,
        color: '#8c8c8c',
        bgColor: '#fafafa',
        padding: [8, 8]
      },
      bodyStyle: {
        hover: {
          cellBgColor: '#f5f5f5'
        },
        select: {
          cellBgColor: '#e6f4ff'
        }
      }
    }
  }), [stocks])

  // 处理行点击
  const handleCellClick = useCallback((args) => {
    const rowIndex = args.row - 1 // 减去表头
    if (rowIndex >= 0 && rowIndex < stocks.length) {
      setSelectedIndex(rowIndex)
      setSelectedStock(stocks[rowIndex])
      vtableRef.current?.selectRow(args.row)
    }
  }, [stocks])

  // VTable 挂载后绑定事件
  const handleVTableReady = useCallback((instance) => {
    vtableRef.current = instance
    instance.on('click_cell', handleCellClick)
    // 默认选中第一行
    if (stocks.length > 0) {
      instance.selectRow(1)
    }
  }, [handleCellClick, stocks.length])

  // 行业选项
  const themeOptions = useMemo(() => {
    if (industries.length > 0) {
      return industries
    }
    return [{ label: '全部', value: 'all' }]
  }, [industries])

  return (
    <div style={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      background: '#fafafa',
      overflow: 'hidden'
    }}>
      {/* 筛选区域 - 紧凑布局 */}
      <div style={{ 
        background: '#fff',
        borderBottom: '1px solid #f0f0f0',
        padding: '8px 16px',
        flexShrink: 0,
      }}>
        {/* 筛选条件 - 同一行 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {/* 市场选择 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>市场</span>
            <Segmented
              size="small"
              value={market}
              onChange={(v) => updateParam('market', v)}
              options={[
                { label: 'A股', value: 'A股' },
                { label: '港股', value: '港股' },
              ]}
            />
          </div>
          
          {/* 题材选择 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>行业</span>
            <Select
              style={{ width: 120 }}
              value={theme}
              onChange={(v) => updateParam('theme', v)}
              options={themeOptions}
              size="small"
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </div>
          
          {/* 异动信号 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>异动信号</span>
            <Select
              style={{ width: 120 }}
              value={signal}
              onChange={(v) => updateParam('signal', v)}
              options={signalOptions}
              size="small"
            />
          </div>
          
          {/* 市值范围 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>市值</span>
            <Select
              style={{ width: 130 }}
              value={marketCap}
              onChange={(v) => updateParam('cap', v)}
              options={marketCapOptions}
              size="small"
            />
          </div>

          {/* 快捷标签 */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 8 }}>
            <Tag 
              color={signal === 'limit_up' ? 'red' : 'default'}
              style={{ cursor: 'pointer', margin: 0, fontSize: 12, lineHeight: '20px' }}
              onClick={() => updateParam('signal', signal === 'limit_up' ? 'all' : 'limit_up')}
            >
              涨停板
            </Tag>
            <Tag 
              color={signal === 'volume_breakout' ? 'orange' : 'default'}
              style={{ cursor: 'pointer', margin: 0, fontSize: 12, lineHeight: '20px' }}
              onClick={() => updateParam('signal', signal === 'volume_breakout' ? 'all' : 'volume_breakout')}
            >
              放量突破
            </Tag>
            <Tag 
              color={signal === 'bottom_volume' ? 'green' : 'default'}
              style={{ cursor: 'pointer', margin: 0, fontSize: 12, lineHeight: '20px' }}
              onClick={() => updateParam('signal', signal === 'bottom_volume' ? 'all' : 'bottom_volume')}
            >
              底部异动
            </Tag>
            <Tag 
              color={signal === 'golden_cross' ? 'blue' : 'default'}
              style={{ cursor: 'pointer', margin: 0, fontSize: 12, lineHeight: '20px' }}
              onClick={() => updateParam('signal', signal === 'golden_cross' ? 'all' : 'golden_cross')}
            >
              金叉信号
            </Tag>
            <Tag 
              color={marketCap === 'mega' ? 'purple' : 'default'}
              style={{ cursor: 'pointer', margin: 0, fontSize: 12, lineHeight: '20px' }}
              onClick={() => updateParam('cap', marketCap === 'mega' ? 'all' : 'mega')}
            >
              大盘权重
            </Tag>
          </div>

          {/* 结果统计 */}
          <div style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 'auto' }}>
            共 <span style={{ color: '#1677ff', fontWeight: 600 }}>{total}</span> 只
          </div>
        </div>
      </div>

      {/* 列表 + 详情区域 */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* 股票列表 */}
        <div style={{ 
          width: 200, 
          flexShrink: 0,
          borderRight: '1px solid #f0f0f0',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            {loading && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(255,255,255,0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10
              }}>
                <Spin />
              </div>
            )}
            {stocks.length > 0 ? (
              <ListTable
                ref={tableRef}
                option={tableOption}
                onReady={handleVTableReady}
                style={{ width: '100%', height: '100%' }}
              />
            ) : !loading && (
              <div style={{ 
                height: '100%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: '#bfbfbf',
                fontSize: 12
              }}>
                暂无数据
              </div>
            )}
          </div>
        </div>

        {/* 详情区域 - 复用 StockDetail 组件 */}
        <div style={{ flex: 1, background: '#f5f5f5', minWidth: 0, overflow: 'auto' }}>
          {selectedStock ? (
            <StockDetail 
              stock={selectedStock} 
              market={selectedStock.market} 
            />
          ) : (
            <div style={{ 
              height: '100%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              <Empty description="请选择股票查看详情" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
