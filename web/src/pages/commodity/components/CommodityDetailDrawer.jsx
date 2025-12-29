import { useState, useEffect } from 'react'
import { Drawer, Spin, Empty, Segmented, List, Tag } from 'antd'
import { RiseOutlined, FallOutlined, LinkOutlined } from '@ant-design/icons'
import { fetchCommodityKline, fetchCommodityNews } from '@/api/commodity'
import { getImpactAnalysis } from '@/constants/impactAnalysis'
import DetailChart from './DetailChart'

/**
 * 股票影响区块组件
 */
const StockImpactSection = ({ marketName, impact: marketImpact }) => {
  const trendColor = {
    '利好': '#389e0d',
    '利空': '#cf1322',
    '分化': '#d48806',
    '中性': '#8c8c8c',
  }[marketImpact.trend]
  
  const stocks = marketImpact.stocks?.split('、') || []
  
  return (
    <div style={{ 
      background: '#fafafa', 
      borderRadius: 8, 
      padding: 12,
      marginBottom: 12 
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, color: '#262626' }}>{marketName}</span>
        <Tag color={trendColor} style={{ margin: 0 }}>{marketImpact.trend}</Tag>
      </div>
      <div style={{ color: '#595959', fontSize: 13, marginBottom: 8 }}>
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
  const [news, setNews] = useState([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [klineType, setKlineType] = useState(101)
  const [chartType, setChartType] = useState('kline')
  const [detailData, setDetailData] = useState(null)
  const [chartLoading, setChartLoading] = useState(false)
  
  const data = detailData || initialData
  const isUp = data?.changePct >= 0
  const color = isUp ? '#cf1322' : '#389e0d'
  const Icon = isUp ? RiseOutlined : FallOutlined
  const displayName = commodity?.label || commodity?.name || ''
  const impact = commodity ? getImpactAnalysis(commodity.name, data?.changePct || 0, data?.latestPrice || 0) : null

  // 加载K线数据
  useEffect(() => {
    if (visible && commodity) {
      setChartLoading(true)
      fetchCommodityKline(commodity.code, commodity.market, '1y', klineType).then(result => {
        setDetailData(result)
        setChartLoading(false)
      })
    }
  }, [visible, commodity, klineType])

  // 加载新闻
  useEffect(() => {
    if (visible && commodity) {
      setNewsLoading(true)
      fetchCommodityNews(commodity.name).then(list => {
        setNews(list)
        setNewsLoading(false)
      })
    }
  }, [visible, commodity])

  // 关闭时重置状态
  useEffect(() => {
    if (!visible) {
      setDetailData(null)
      setKlineType(101)
      setChartType('kline')
    }
  }, [visible])

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
            background: commodity.region === 'domestic' ? '#fffbe6' : '#e6f4ff',
          }}>
            {commodity.region === 'domestic' ? '国内' : '国际'}
          </span>
        </div>
      }
      placement="right"
      width={isMobile ? '100%' : 480}
      onClose={onClose}
      open={visible}
      styles={{ body: { padding: 16 } }}
    >
      {/* 价格信息 */}
      <div style={{ 
        background: '#fafafa', 
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
            {data?.latestPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          <span style={{ fontSize: 16, color, fontWeight: 500 }}>
            <Icon style={{ marginRight: 4 }} />
            {isUp ? '+' : ''}{data?.changePct?.toFixed(2)}%
          </span>
        </div>
        <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 4 }}>
          {impact?.desc}
        </div>
      </div>

      {/* 历史走势图 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ 
          fontSize: 14, 
          fontWeight: 600, 
          color: '#262626', 
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 3, height: 14, borderRadius: 2, background: categoryColor }} />
            历史走势
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Segmented
              size="small"
              value={klineType}
              onChange={setKlineType}
              options={[
                { label: '日K', value: 101 },
                { label: '周K', value: 102 },
                { label: '月K', value: 103 },
              ]}
              style={{ background: '#f5f5f5' }}
            />
            <Segmented
              size="small"
              value={chartType}
              onChange={setChartType}
              options={[
                { label: 'K线', value: 'kline' },
                { label: '折线', value: 'line' },
              ]}
              style={{ background: '#f5f5f5' }}
            />
          </div>
        </div>
        <Spin spinning={chartLoading}>
          {data?.prices?.length ? (
            <DetailChart data={data} color={color} chartType={chartType} />
          ) : (
            <Empty description="暂无K线数据" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '40px 0' }} />
          )}
        </Spin>
      </div>

      {/* 市场影响分析 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ 
          fontSize: 14, 
          fontWeight: 600, 
          color: '#262626', 
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <span style={{ width: 3, height: 14, borderRadius: 2, background: categoryColor }} />
          市场影响分析
        </div>
        
        {impact && (
          <>
            <StockImpactSection marketName="A股" impact={impact.aStock} />
            <StockImpactSection marketName="港股" impact={impact.hkStock} />
            <StockImpactSection marketName="美股" impact={impact.usStock} />
          </>
        )}
      </div>

      {/* 相关新闻 */}
      <div>
        <div style={{ 
          fontSize: 14, 
          fontWeight: 600, 
          color: '#262626', 
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <span style={{ width: 3, height: 14, borderRadius: 2, background: categoryColor }} />
          相关新闻
        </div>
        
        <Spin spinning={newsLoading}>
          {news.length > 0 ? (
            <List
              size="small"
              dataSource={news}
              renderItem={(item) => (
                <List.Item style={{ padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <div style={{ width: '100%' }}>
                    <a 
                      href={item.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ 
                        color: '#262626', 
                        fontSize: 13,
                        display: 'block',
                        marginBottom: 4,
                        lineHeight: 1.5
                      }}
                    >
                      {item.title}
                      <LinkOutlined style={{ marginLeft: 4, fontSize: 10, color: '#8c8c8c' }} />
                    </a>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#8c8c8c' }}>
                      <span>{item.source}</span>
                      <span>{item.time}</span>
                    </div>
                  </div>
                </List.Item>
              )}
            />
          ) : (
            <Empty description="暂无相关新闻" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Spin>
      </div>
    </Drawer>
  )
}

export default CommodityDetailDrawer
