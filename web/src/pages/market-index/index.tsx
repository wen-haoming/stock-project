import { useCallback, useState } from 'react'
import { Spin, Button, Tabs } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useRequest, useInterval } from 'ahooks'
import ReactECharts from 'echarts-for-react'
import axios from 'axios'
import StockDetailDrawer from '../range-stats/StockDetailDrawer'
import TopGainersTable from '../market-overview/components/TopGainersTable'
import { useTheme } from '../../contexts/ThemeContext'

const upColor = '#ec5a5a'
const downColor = '#47b262'

// 判断是否在交易时间
const isTradeTime = (market: string) => {
  const now = new Date()
  const day = now.getDay()
  if (day === 0 || day === 6) return false
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const time = hours * 100 + minutes
  
  if (market === 'us') {
    return time >= 2130 || time <= 500
  }
  return time >= 915 && time <= 1610
}

// 指数分时图配置
const getIndexChartOption = (index) => {
  if (!index?.trendData || index.trendData.length === 0) {
    return {}
  }
  const prices = index.trendData.map(d => d[1])
  const preClose = index.preClose || prices[0]
  const isUp = prices[prices.length - 1] >= preClose

  return {
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    xAxis: { type: 'category', data: index.trendData.map(d => d[0]), show: false },
    yAxis: { type: 'value', show: false, scale: true },
    series: [{
      type: 'line',
      data: prices,
      smooth: true,
      symbol: 'none',
      lineStyle: { color: isUp ? upColor : downColor, width: 1 },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: isUp ? 'rgba(236,90,90,0.15)' : 'rgba(71,178,98,0.15)' },
            { offset: 1, color: 'rgba(255,255,255,0)' }
          ]
        }
      },
    }],
    tooltip: { show: false },
  }
}

// 单个市场面板组件
function MarketPanel({ market, onStockClick }) {
  const { theme: currentTheme } = useTheme()

  // 获取指数行情
  const { data: indexData = [], loading: indexLoading, run: fetchIndex } = useRequest(
    async () => {
      const res = await axios.get('/api/v1/market/index', { params: { market } })
      return res.data?.data || []
    },
    { refreshDeps: [market] }
  )

  // 获取热门板块
  const { data: sectorData = [], loading: sectorLoading, run: fetchSectors } = useRequest(
    async () => {
      const res = await axios.get('/api/v1/market/sectors', { params: { market, limit: 10 } })
      return res.data?.data || []
    },
    { refreshDeps: [market] }
  )

  // 手动刷新
  const refreshAll = useCallback(() => {
    fetchIndex()
    fetchSectors()
  }, [fetchIndex, fetchSectors])

  // 交易时间轮询（30秒）
  useInterval(() => {
    if (isTradeTime(market)) {
      refreshAll()
    }
  }, 30000)

  const marketName = market === 'a' ? 'A股' : market === 'hk' ? '港股' : '美股'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', padding: '0 10px 10px' }}>
      {/* 指数行情 - 紧凑行内展示 */}
      <Spin spinning={indexLoading} size="small">
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '8px 0', borderBottom: `1px solid ${currentTheme.custom.borderColor}` }}>
          {indexData.map((idx) => (
            <div key={idx.symbol} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: currentTheme.custom.textColorSecondary }}>{idx.name}</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: (idx.changePct || 0) >= 0 ? upColor : downColor, fontFamily: 'Consolas, monospace' }}>
                {idx.latestPrice?.toFixed(2) || '-'}
              </span>
              <span style={{ fontSize: 12, color: (idx.changePct || 0) >= 0 ? upColor : downColor }}>
                {idx.changePct != null ? `${idx.changePct >= 0 ? '+' : ''}${idx.changePct.toFixed(2)}%` : '-'}
              </span>
              {/* 迷你分时图 */}
              <div style={{ width: 60, height: 24 }}>
                {idx.trendData && idx.trendData.length > 0 && (
                  <ReactECharts option={getIndexChartOption(idx)} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'svg' }} />
                )}
              </div>
            </div>
          ))}
          <Button 
            type="text" 
            size="small" 
            icon={<ReloadOutlined />} 
            onClick={refreshAll}
            loading={indexLoading || sectorLoading}
            style={{ fontSize: 12, marginLeft: 'auto' }}
          />
        </div>
      </Spin>

      {/* 热门板块 - 紧凑展示 */}
      <Spin spinning={sectorLoading} size="small">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 0', borderBottom: `1px solid ${currentTheme.custom.borderColor}` }}>
          <span style={{ fontSize: 12, color: currentTheme.custom.textColorSecondary, flexShrink: 0 }}>热门板块</span>
          {sectorData.length > 0 ? (
            sectorData.slice(0, 10).map((sector) => (
              <div key={sector.name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: currentTheme.custom.textColor }}>{sector.name}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: sector.changePct >= 0 ? upColor : downColor }}>
                  {sector.changePct >= 0 ? '+' : ''}{sector.changePct?.toFixed(2)}%
                </span>
              </div>
            ))
          ) : (
            <span style={{ fontSize: 12, color: currentTheme.custom.textColorSecondary }}>暂无</span>
          )}
        </div>
      </Spin>

      {/* 涨幅榜 */}
      <div style={{ flex: 1, minHeight: 300 }}>
        <TopGainersTable 
          key={market}
          market={market} 
          title={`${marketName}涨幅榜`} 
          height={400} 
          onStockClick={onStockClick} 
        />
      </div>
    </div>
  )
}

export default function MarketIndexPage() {
  const [selectedStock, setSelectedStock] = useState(null)
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [activeMarket, setActiveMarket] = useState('a')
  const { theme: currentTheme } = useTheme()

  const handleStockClick = useCallback((stock) => {
    setSelectedStock(stock)
    setDrawerVisible(true)
  }, [])

  const handleCloseDrawer = useCallback(() => {
    setDrawerVisible(false)
  }, [])

  const tabItems = [
    { key: 'a', label: 'A股行情', children: <MarketPanel market="a" onStockClick={handleStockClick} /> },
    { key: 'hk', label: '港股行情', children: <MarketPanel market="hk" onStockClick={handleStockClick} /> },
    { key: 'us', label: '美股行情', children: <MarketPanel market="us" onStockClick={handleStockClick} /> },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: currentTheme.custom.bgColorSecondary, overflow: 'hidden' }}>
      <Tabs
        activeKey={activeMarket}
        onChange={setActiveMarket}
        items={tabItems}
        style={{ height: '100%' }}
        tabBarStyle={{ margin: '0 10px', marginBottom: 0 }}
      />

      {/* 股票详情抽屉 */}
      <StockDetailDrawer 
        visible={drawerVisible}
        stock={selectedStock} 
        market={selectedStock?.market || activeMarket}
        onClose={handleCloseDrawer}
        dateRange={[null, null]} 
      />
    </div>
  )
}
