import { useCallback, useState } from 'react'
import { Card, Spin, Empty, Button } from 'antd'
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
const isTradeTime = () => {
  const now = new Date()
  const day = now.getDay()
  if (day === 0 || day === 6) return false
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const time = hours * 100 + minutes
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
function MarketPanel({ market, title, onStockClick }) {
  const { theme: currentTheme } = useTheme()

  // 获取指数行情
  const { data: indexData = [], loading: indexLoading, run: fetchIndex } = useRequest(
    async () => {
      const res = await axios.get('/api/v1/market/index', { params: { market } })
      return res.data?.data || []
    }
  )

  // 获取热门板块
  const { data: sectorData = [], loading: sectorLoading, run: fetchSectors } = useRequest(
    async () => {
      const res = await axios.get('/api/v1/market/sectors', { params: { market, limit: 6 } })
      return res.data?.data || []
    }
  )

  // 手动刷新
  const refreshAll = useCallback(() => {
    fetchIndex()
    fetchSectors()
  }, [fetchIndex, fetchSectors])

  // 交易时间轮询（30秒）
  useInterval(() => {
    if (isTradeTime()) {
      refreshAll()
    }
  }, 30000)

  const cardBorderColor = currentTheme.custom.borderColor

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      {/* 标题 + 刷新按钮 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2px' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: currentTheme.custom.textColor }}>{title}</span>
        <Button 
          type="text" 
          size="small" 
          icon={<ReloadOutlined />} 
          onClick={refreshAll}
          loading={indexLoading || sectorLoading}
          style={{ fontSize: 12, padding: '0 4px' }}
        >
          刷新
        </Button>
      </div>

      {/* 指数卡片 */}
      <Spin spinning={indexLoading} size="small">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {indexData.map((idx) => (
            <Card
              key={idx.symbol}
              size="small"
              style={{ flex: '1 1 calc(50% - 3px)', minWidth: 140, border: `1px solid ${cardBorderColor}` }}
              styles={{ body: { padding: '10px 12px' } }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: currentTheme.custom.textColorSecondary, marginBottom: 4 }}>{idx.name}</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: (idx.changePct || 0) >= 0 ? upColor : downColor, fontFamily: 'Consolas, monospace', lineHeight: 1.2 }}>
                    {idx.latestPrice?.toFixed(2) || '-'}
                  </div>
                  <div style={{ fontSize: 11, color: (idx.changePct || 0) >= 0 ? upColor : downColor, marginTop: 4 }}>
                    {idx.changePct != null ? `${idx.changePct >= 0 ? '+' : ''}${idx.changePct.toFixed(2)}%` : '-'}
                    <span style={{ marginLeft: 6 }}>{idx.changeAmt != null ? `${idx.changeAmt >= 0 ? '+' : ''}${idx.changeAmt.toFixed(2)}` : ''}</span>
                  </div>
                </div>
                {/* K线图区域 - 填充整个右侧 */}
                <div style={{ width: 90, height: 50, marginLeft: 8, flexShrink: 0 }}>
                  {idx.trendData && idx.trendData.length > 0 ? (
                    <ReactECharts option={getIndexChartOption(idx)} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'svg' }} />
                  ) : (
                    <div style={{ height: '100%', width: '100%', background: currentTheme.custom.bgColorSecondary, borderRadius: 4 }} />
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Spin>

      {/* 热门板块 */}
      <Card
        title={<span style={{ fontSize: 11, fontWeight: 500 }}>热门板块</span>}
        size="small"
        styles={{ header: { padding: '4px 8px', minHeight: 28 }, body: { padding: 6 } }}
      >
        <Spin spinning={sectorLoading} size="small">
          {sectorData.length > 0 ? (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {sectorData.slice(0, 6).map((sector) => (
                <div
                  key={sector.name}
                  style={{ flex: '1 1 calc(33.33% - 3px)', minWidth: 80, padding: '4px 6px', background: currentTheme.custom.bgColorSecondary, borderRadius: 3, border: `1px solid ${cardBorderColor}` }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 50 }}>{sector.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: sector.changePct >= 0 ? upColor : downColor }}>
                      {sector.changePct >= 0 ? '+' : ''}{sector.changePct?.toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无" style={{ margin: '6px 0' }} />
          )}
        </Spin>
      </Card>

      {/* 涨幅榜 */}
      <div style={{ flex: 1 }}>
        <TopGainersTable 
          market={market} 
          title={`${market === 'a' ? 'A股' : '港股'}涨幅榜`} 
          height={280} 
          onStockClick={onStockClick} 
        />
      </div>
    </div>
  )
}

export default function MarketIndexPage() {
  const [selectedStock, setSelectedStock] = useState(null)
  const [drawerVisible, setDrawerVisible] = useState(false)
  const { theme: currentTheme } = useTheme()

  const handleStockClick = useCallback((stock) => {
    setSelectedStock(stock)
    setDrawerVisible(true)
  }, [])

  const handleCloseDrawer = useCallback(() => {
    setDrawerVisible(false)
  }, [])

  return (
    <div style={{ height: '100%', display: 'flex', gap: 10, padding: 10, background: currentTheme.custom.bgColorSecondary, overflow: 'auto' }}>
      {/* 左侧 A股 */}
      <MarketPanel market="a" title="A股行情" onStockClick={handleStockClick} />
      
      {/* 右侧 港股 */}
      <MarketPanel market="hk" title="港股行情" onStockClick={handleStockClick} />

      {/* 股票详情抽屉 - 使用已有组件 */}
      <StockDetailDrawer 
        visible={drawerVisible}
        stock={selectedStock} 
        market={selectedStock?.market || 'hk'}
        onClose={handleCloseDrawer} 
      />
    </div>
  )
}
