import { useState, useEffect, useCallback } from 'react'
import { Drawer, Spin, Empty, Tag, Card, Radio, Button, Space } from 'antd'
import { RiseOutlined, FallOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons'
import { fetchCommodityKline, fetchCommodityTrend } from '@/api/commodity'
import { getImpactAnalysis } from '@/constants/impactAnalysis'
import { useTheme } from '../../../contexts/ThemeContext'
import CommodityKlineChart from './CommodityKlineChart'

// K线周期配置
const KLINE_PERIODS = [
  { key: 'trend', label: '分时' },
  { key: 'day', label: '日K' },
  { key: 'week', label: '周K' },
  { key: 'month', label: '月K' },
]

// 时间范围配置
const TIME_RANGES = [
  { label: '1月', months: 1 },
  { label: '3月', months: 3 },
  { label: '6月', months: 6 },
  { label: '1年', months: 12 },
  { label: '3年', months: 36 },
]

// K线类型映射
const KLINE_TYPE_MAP = {
  day: 101,
  week: 102,
  month: 103,
}

/**
 * 股票影响区块组件
 */
const StockImpactSection = ({ marketName, impact: marketImpact, isDark }) => {
  const trendColor = {
    '利好': '#389e0d',
    '利空': '#cf1322',
    '分化': '#d48806',
    '中性': '#8c8c8c',
  }[marketImpact.trend]
  
  const stocks = marketImpact.stocks?.split('、') || []
  
  return (
    <div style={{ 
      background: isDark ? 'rgba(255,255,255,0.04)' : '#fafafa', 
      borderRadius: 8, 
      padding: 12,
      marginBottom: 12 
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>{marketName}</span>
        <Tag color={trendColor} style={{ margin: 0 }}>{marketImpact.trend}</Tag>
      </div>
      <div style={{ color: isDark ? '#aaa' : '#595959', fontSize: 13, marginBottom: 8 }}>
        {marketImpact.detail}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {stocks.map((stock, idx) => (
          <span key={idx} style={{ 
            fontSize: 12, 
            color: trendColor,
            background: trendColor + '15',
            padding: '2px 8px',
            borderRadius: 4
          }}>
            {stock}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * 商品详情抽屉组件
 */
const CommodityDetailDrawer = ({ visible, onClose, commodity, data: initialData, categoryColor, isMobile }) => {
  const { theme: currentTheme, isDark } = useTheme()
  const [klinePeriod, setKlinePeriod] = useState('trend')
  const [chartData, setChartData] = useState(null) // 图表数据
  const [realTimeData, setRealTimeData] = useState(null) // 实时价格数据（分时）
  const [chartLoading, setChartLoading] = useState(false)
  const [timeRangeIndex, setTimeRangeIndex] = useState(1) // 默认3月
  
  // 顶部价格始终使用实时数据（分时数据）
  const priceData = realTimeData || initialData
  const isUp = priceData?.changePct >= 0
  const color = isUp ? '#cf1322' : '#389e0d'
  const Icon = isUp ? RiseOutlined : FallOutlined
  const displayName = commodity?.label || commodity?.name || ''
  const impact = commodity ? getImpactAnalysis(commodity.name, priceData?.changePct || 0, priceData?.latestPrice || 0) : null

  // 当前是否为分时模式
  const isTrendMode = klinePeriod === 'trend'

  // 打开时重置状态并加载数据
  useEffect(() => {
    if (visible && commodity) {
      setKlinePeriod('trend')
      setChartData(null)
      setRealTimeData(null)
      setChartLoading(true)
      setTimeRangeIndex(1)
      
      // 加载分时数据（同时用于实时价格和图表）
      fetchCommodityTrend(commodity.code, commodity.market)
        .then(result => {
          setRealTimeData(result)
          setChartData(result)
        })
        .finally(() => {
          setChartLoading(false)
        })
    }
  }, [visible, commodity])

  // 加载K线数据（只更新图表数据，不更新实时价格）
  const loadKlineData = useCallback(async (period, rangeMonths = 3) => {
    if (!commodity) return
    
    setChartLoading(true)
    try {
      let result
      if (period === 'trend') {
        result = await fetchCommodityTrend(commodity.code, commodity.market)
        // 分时模式下同时更新实时价格
        setRealTimeData(result)
      } else {
        const klineType = KLINE_TYPE_MAP[period] || 101
        const periodMap = { 1: '1m', 3: '3m', 6: '6m', 12: '1y', 36: '3y' }
        result = await fetchCommodityKline(commodity.code, commodity.market, periodMap[rangeMonths] || '3m', klineType)
      }
      setChartData(result)
    } finally {
      setChartLoading(false)
    }
  }, [commodity])

  // 处理周期变化
  const handlePeriodChange = (period) => {
    setKlinePeriod(period)
    setTimeRangeIndex(1) // 重置为3月
    loadKlineData(period, 3)
  }

  // 放大（减少时间范围）
  const handleZoomIn = useCallback(() => {
    if (timeRangeIndex > 0) {
      const newIndex = timeRangeIndex - 1
      setTimeRangeIndex(newIndex)
      loadKlineData(klinePeriod, TIME_RANGES[newIndex].months)
    }
  }, [timeRangeIndex, klinePeriod, loadKlineData])

  // 缩小（增加时间范围）
  const handleZoomOut = useCallback(() => {
    if (timeRangeIndex < TIME_RANGES.length - 1) {
      const newIndex = timeRangeIndex + 1
      setTimeRangeIndex(newIndex)
      loadKlineData(klinePeriod, TIME_RANGES[newIndex].months)
    }
  }, [timeRangeIndex, klinePeriod, loadKlineData])

  // K线图操作栏
  const klineExtra = (
    <Space size={4}>
      <Radio.Group 
        value={klinePeriod} 
        onChange={(e) => handlePeriodChange(e.target.value)} 
        size="small"
        buttonStyle="solid"
      >
        {KLINE_PERIODS.map(p => (
          <Radio.Button key={p.key} value={p.key} style={{ padding: '0 8px' }}>{p.label}</Radio.Button>
        ))}
      </Radio.Group>
      {!isTrendMode && (
        <>
          <Button
            type="default"
            shape="circle"
            size="small"
            icon={<PlusOutlined />}
            onClick={handleZoomIn}
            disabled={timeRangeIndex === 0}
            title={`放大 (当前: ${TIME_RANGES[timeRangeIndex].label})`}
          />
          <Button
            type="default"
            shape="circle"
            size="small"
            icon={<MinusOutlined />}
            onClick={handleZoomOut}
            disabled={timeRangeIndex === TIME_RANGES.length - 1}
            title={`缩小 (当前: ${TIME_RANGES[timeRangeIndex].label})`}
          />
        </>
      )}
    </Space>
  )

  if (!commodity) return null

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ 
            width: 4, 
            height: 16, 
            borderRadius: 2, 
            background: categoryColor 
          }} />
          <span>{displayName}</span>
          <span style={{ 
            fontSize: 12, 
            color: commodity.region === 'domestic' ? '#d48806' : '#1677ff',
            padding: '2px 8px',
            borderRadius: 10,
            background: commodity.region === 'domestic' 
              ? (isDark ? 'rgba(212,136,6,0.2)' : '#fffbe6') 
              : (isDark ? 'rgba(22,119,255,0.2)' : '#e6f4ff'),
          }}>
            {commodity.region === 'domestic' ? '国内' : '国际'}
          </span>
        </div>
      }
      placement="right"
      width={isMobile ? '100%' : '50%'}
      onClose={onClose}
      open={visible}
      styles={{ body: { padding: 16 } }}
    >
      {/* 价格信息 - 始终显示实时价格和当日涨跌幅 */}
      <div style={{ 
        background: isDark ? 'rgba(255,255,255,0.04)' : '#fafafa', 
        borderRadius: 8, 
        padding: 16, 
        marginBottom: 16 
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ 
            fontSize: 28, 
            fontWeight: 600, 
            color,
            letterSpacing: '-1px'
          }}>
            {priceData?.latestPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          <span style={{ fontSize: 16, color, fontWeight: 500 }}>
            <Icon style={{ marginRight: 4 }} />
            {isUp ? '+' : ''}{priceData?.changePct?.toFixed(2)}%
          </span>
          <span style={{ fontSize: 12, color: isDark ? '#666' : '#999' }}>今日</span>
        </div>
        <div style={{ color: isDark ? '#888' : '#8c8c8c', fontSize: 12, marginTop: 4 }}>
          {impact?.desc}
        </div>
      </div>

      {/* K线走势图 */}
      <Card 
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 3, height: 14, borderRadius: 2, background: categoryColor }} />
            {isTrendMode ? '分时走势' : `K线走势 (${TIME_RANGES[timeRangeIndex].label})`}
          </div>
        }
        size="small" 
        style={{ marginBottom: 16 }}
        extra={klineExtra}
      >
        <Spin spinning={chartLoading}>
          {chartData?.prices?.length ? (
            <CommodityKlineChart data={chartData} color={color} isTrend={isTrendMode} />
          ) : (
            <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '40px 0' }} />
          )}
        </Spin>
      </Card>

      {/* 市场影响分析 */}
      <Card 
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 3, height: 14, borderRadius: 2, background: categoryColor }} />
            市场影响分析
          </div>
        }
        size="small"
      >
        {impact && (
          <>
            <StockImpactSection marketName="A股" impact={impact.aStock} isDark={isDark} />
            <StockImpactSection marketName="港股" impact={impact.hkStock} isDark={isDark} />
            <StockImpactSection marketName="美股" impact={impact.usStock} isDark={isDark} />
          </>
        )}
      </Card>
    </Drawer>
  )
}

export default CommodityDetailDrawer
