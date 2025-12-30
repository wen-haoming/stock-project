import { memo, useState, useEffect, useCallback } from 'react'
<<<<<<< HEAD
import { Card, Spin } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
=======
import { Card, Spin, Tooltip } from 'antd'
import { ReloadOutlined, QuestionCircleOutlined } from '@ant-design/icons'
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
import { useTheme } from '../../../contexts/ThemeContext'
import axios from 'axios'

/**
 * 盘口数据卡片 - 五档买卖盘、委比委差、内外盘
 */
function OrderBookCard({ stock, market = 'hk' }) {
  const { theme } = useTheme()
  const isDark = theme.custom?.isDark
  const [loading, setLoading] = useState(false)
  const [orderData, setOrderData] = useState(null)

  const cardStyle = { background: isDark ? '#1f1f1f' : '#fff' }
  const textColor = isDark ? '#e0e0e0' : '#333'
  const subTextColor = isDark ? '#999' : '#666'
  const upColor = '#f5222d'
  const downColor = '#52c41a'

  // 获取五档盘口数据
  const fetchOrderBook = useCallback(async () => {
    if (!stock?.symbol) return
    
    setLoading(true)
    try {
      let secid
      if (market === 'a') {
<<<<<<< HEAD
        // A股：上证 1.xxx，深证 0.xxx
        secid = stock.symbol.startsWith('6') ? `1.${stock.symbol}` : `0.${stock.symbol}`
      } else {
        // 港股：116.xxxxx
=======
        secid = stock.symbol.startsWith('6') ? `1.${stock.symbol}` : `0.${stock.symbol}`
      } else {
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
        secid = `116.${stock.symbol}`
      }
      
      // 东方财富五档盘口数据
<<<<<<< HEAD
      // f11-f20: 卖1-5价格和数量, f31-f40: 买1-5价格和数量
      // f43: 最新价, f60: 昨收, f185: 外盘, f186: 内盘
=======
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
      const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f11,f12,f13,f14,f15,f16,f17,f18,f19,f20,f31,f32,f33,f34,f35,f36,f37,f38,f39,f40,f43,f60,f185,f186`
      const response = await axios.get(url)
      const data = response.data?.data
      
<<<<<<< HEAD
=======
      console.log('盘口原始数据:', data) // 调试用
      
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
      if (!data) {
        setOrderData(null)
        return
      }
      
<<<<<<< HEAD
      // 价格处理：东方财富返回的价格可能是整数（需要除以换算因子）
      // A股通常需要除以100，港股检测数据判断
      let priceDiv = 1
      const samplePrice = data.f31 || data.f43 || data.f60
      if (market === 'a') {
        // A股价格需要除以100
        priceDiv = 100
      } else if (samplePrice && samplePrice > 10000) {
        // 港股：如果价格看起来像是放大了1000倍
        priceDiv = 1000
      }
      
      // 解析价格
      const parsePrice = (val) => {
        if (val === '-' || val == null || val === '') return 0
=======
      // A股价格需要除以100，港股返回的是原始价格（已经是正确的小数）
      // 检测数据格式：如果f31(买1价)大于1000，说明需要除以换算
      const samplePrice = data.f31
      let priceDiv = 1
      if (market === 'a') {
        priceDiv = 100
      } else if (samplePrice > 1000) {
        priceDiv = 1000
      }
      
      // 检查数据是否有效
      const parsePrice = (val) => {
        if (val === '-' || val == null || val === '' || (typeof val === 'string' && val.includes('-'))) return 0
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
        const num = typeof val === 'string' ? parseFloat(val) : val
        if (isNaN(num) || num <= 0) return 0
        return num / priceDiv
      }
      
<<<<<<< HEAD
      // 解析成交量
=======
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
      const parseVol = (val) => {
        if (val === '-' || val == null || val === '') return 0
        const num = typeof val === 'string' ? parseFloat(val) : val
        if (isNaN(num)) return 0
<<<<<<< HEAD
        return Math.abs(num)
      }
      
      // 解析五档数据（卖盘从高到低：卖5-卖1）
=======
        return Math.abs(num)  // 取绝对值
      }
      
      // 解析五档数据
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
      const asks = [
        { price: parsePrice(data.f19), volume: parseVol(data.f20) },  // 卖5
        { price: parsePrice(data.f17), volume: parseVol(data.f18) },  // 卖4
        { price: parsePrice(data.f15), volume: parseVol(data.f16) },  // 卖3
        { price: parsePrice(data.f13), volume: parseVol(data.f14) },  // 卖2
        { price: parsePrice(data.f11), volume: parseVol(data.f12) },  // 卖1
      ]
      
<<<<<<< HEAD
      // 买盘从高到低：买1-买5
=======
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
      const bids = [
        { price: parsePrice(data.f31), volume: parseVol(data.f32) },  // 买1
        { price: parsePrice(data.f33), volume: parseVol(data.f34) },  // 买2
        { price: parsePrice(data.f35), volume: parseVol(data.f36) },  // 买3
        { price: parsePrice(data.f37), volume: parseVol(data.f38) },  // 买4
        { price: parsePrice(data.f39), volume: parseVol(data.f40) },  // 买5
      ]
      
      const preClose = parsePrice(data.f60)
      const outerVol = parseVol(data.f185)  // 外盘
      const innerVol = parseVol(data.f186)  // 内盘
      
      // 计算委比委差
      const totalBidVol = bids.reduce((sum, b) => sum + (b.volume || 0), 0)
      const totalAskVol = asks.reduce((sum, a) => sum + (a.volume || 0), 0)
      const weibi = totalBidVol + totalAskVol > 0 
        ? ((totalBidVol - totalAskVol) / (totalBidVol + totalAskVol) * 100).toFixed(2)
        : 0
      const weicha = totalBidVol - totalAskVol
      
      setOrderData({
        asks,
        bids,
        preClose,
        outerVol,
        innerVol,
        weibi,
        weicha,
        totalBidVol,
        totalAskVol,
      })
    } catch (error) {
      console.error('获取盘口数据失败:', error)
      setOrderData(null)
    } finally {
      setLoading(false)
    }
  }, [stock?.symbol, market])

  useEffect(() => {
    fetchOrderBook()
    // 每5秒刷新一次
    const timer = setInterval(fetchOrderBook, 5000)
    return () => clearInterval(timer)
  }, [fetchOrderBook])

  // 格式化成交量
  const formatVolume = (vol) => {
    if (!vol || vol === 0) return '-'
    if (vol >= 10000) return (vol / 10000).toFixed(1) + '万'
    return vol.toFixed(0)
  }

  // 计算最大成交量用于显示比例条
  const maxVolume = orderData ? Math.max(
    ...orderData.asks.map(a => a.volume || 0),
    ...orderData.bids.map(b => b.volume || 0)
  ) : 0

  const OrderRow = ({ label, price, volume, type, preClose }) => {
    const isUp = price > preClose
    const isDown = price < preClose
    const priceColor = isUp ? upColor : isDown ? downColor : textColor
    const barColor = type === 'ask' ? 'rgba(82, 196, 26, 0.3)' : 'rgba(245, 34, 45, 0.3)'
    const barWidth = maxVolume > 0 ? (volume / maxVolume) * 100 : 0
    
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        padding: '3px 0',
        position: 'relative',
      }}>
        {/* 背景条 */}
        <div style={{
          position: 'absolute',
          [type === 'ask' ? 'right' : 'left']: 0,
          top: 0,
          bottom: 0,
          width: `${barWidth}%`,
          background: barColor,
          zIndex: 0,
        }} />
        
        <span style={{ width: 36, color: subTextColor, fontSize: 11, zIndex: 1 }}>{label}</span>
        <span style={{ flex: 1, color: priceColor, fontWeight: 500, fontSize: 13, zIndex: 1 }}>
          {price > 0 ? price.toFixed(market === 'a' ? 2 : 3) : '-'}
        </span>
        <span style={{ width: 60, textAlign: 'right', color: textColor, fontSize: 12, zIndex: 1 }}>
          {formatVolume(volume)}
        </span>
      </div>
    )
  }

  if (!orderData && !loading) {
    return (
      <Card 
        title="五档盘口" 
        size="small" 
        style={cardStyle}
<<<<<<< HEAD
        styles={{ header: { color: textColor, borderBottom: isDark ? '1px solid #333' : undefined } }}
=======
        headStyle={{ color: textColor, borderBottom: isDark ? '1px solid #333' : undefined }}
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
      >
        <div style={{ color: '#999', textAlign: 'center', padding: 20 }}>暂无数据</div>
      </Card>
    )
  }

  return (
    <Card 
<<<<<<< HEAD
      title="五档盘口"
      size="small" 
      style={cardStyle}
      styles={{ header: { color: textColor, borderBottom: isDark ? '1px solid #333' : undefined } }}
=======
      title={
        <span>
          五档盘口
          <Tooltip title="实时五档买卖盘数据，每5秒自动刷新">
            <QuestionCircleOutlined style={{ marginLeft: 6, fontSize: 11, color: subTextColor }} />
          </Tooltip>
        </span>
      }
      size="small" 
      style={cardStyle}
      headStyle={{ color: textColor, borderBottom: isDark ? '1px solid #333' : undefined }}
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
      extra={
        <ReloadOutlined 
          spin={loading} 
          onClick={fetchOrderBook} 
          style={{ cursor: 'pointer', color: subTextColor }}
        />
      }
    >
      <Spin spinning={loading}>
        {orderData && (
          <>
            {/* 卖盘 */}
            <div style={{ marginBottom: 4 }}>
              {orderData.asks.map((ask, i) => (
                <OrderRow 
                  key={`ask-${i}`}
                  label={`卖${5 - i}`}
                  price={ask.price}
                  volume={ask.volume}
                  type="ask"
                  preClose={orderData.preClose}
                />
              ))}
            </div>
            
            {/* 分隔线 */}
            <div style={{ 
              borderTop: isDark ? '1px dashed #444' : '1px dashed #e0e0e0',
              margin: '6px 0',
            }} />
            
            {/* 买盘 */}
            <div style={{ marginBottom: 8 }}>
              {orderData.bids.map((bid, i) => (
                <OrderRow 
                  key={`bid-${i}`}
                  label={`买${i + 1}`}
                  price={bid.price}
                  volume={bid.volume}
                  type="bid"
                  preClose={orderData.preClose}
                />
              ))}
            </div>
            
            {/* 委比委差 + 内外盘 */}
            <div style={{ 
              borderTop: isDark ? '1px solid #333' : '1px solid #f0f0f0',
              paddingTop: 8,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              fontSize: 11,
            }}>
              <div>
                <span style={{ color: subTextColor }}>委比：</span>
                <span style={{ 
                  color: parseFloat(orderData.weibi) > 0 ? upColor : parseFloat(orderData.weibi) < 0 ? downColor : textColor,
                  fontWeight: 500 
                }}>
                  {orderData.weibi}%
                </span>
              </div>
              <div>
                <span style={{ color: subTextColor }}>委差：</span>
                <span style={{ 
                  color: orderData.weicha > 0 ? upColor : orderData.weicha < 0 ? downColor : textColor,
                  fontWeight: 500 
                }}>
                  {formatVolume(orderData.weicha)}
                </span>
              </div>
              <div>
                <span style={{ color: subTextColor }}>外盘：</span>
                <span style={{ color: upColor, fontWeight: 500 }}>{formatVolume(orderData.outerVol)}</span>
              </div>
              <div>
                <span style={{ color: subTextColor }}>内盘：</span>
                <span style={{ color: downColor, fontWeight: 500 }}>{formatVolume(orderData.innerVol)}</span>
              </div>
            </div>
          </>
        )}
      </Spin>
    </Card>
  )
}

export default memo(OrderBookCard)
