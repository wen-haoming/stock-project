import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { NavBar, Card as MobileCard, Tabs as MobileTabs, Tag as MobileTag, SpinLoading, Empty as MobileEmpty, Selector, Grid as MobileGrid, List, Toast } from 'antd-mobile'
import { Card, Tabs, Tag, Empty, Spin, Button, Space, Tooltip } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import * as echarts from 'echarts'
import { fetchStockNews, fetchFinanceData, fetchStockInfo } from '@/api/stock'
import { fetchKlineData } from '@/utils/dataSourceAdapter'
import { upColor, downColor } from '@/utils/chart'
import { financeMetricsSimple, reportTypeOptions } from '@/constants/finance'

// K线图组件
const KlineChart = memo(({ data, stockName, dateRange, height = 280 }) => {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)

  const brushRange = useMemo(() => {
    if (!data?.categoryData?.length || !dateRange?.start || !dateRange?.end) return null
    
    const startIdx = data.categoryData.findIndex(d => d >= dateRange.start)
    const endIdx = data.categoryData.findIndex(d => d > dateRange.end)
    
    const start = startIdx >= 0 ? (startIdx / data.categoryData.length) * 100 : 80
    const end = endIdx >= 0 ? (endIdx / data.categoryData.length) * 100 : 100
    
    return { start: Math.max(0, start), end: Math.min(100, end) }
  }, [data, dateRange])

  useEffect(() => {
    if (!chartRef.current || !data?.values?.length) return

    if (chartInstanceRef.current) chartInstanceRef.current.dispose()
    
    const chart = echarts.init(chartRef.current)
    chartInstanceRef.current = chart

    let rangeInfo = ''
    if (brushRange && data.values.length > 0) {
      const startIdx = Math.floor((brushRange.start / 100) * data.categoryData.length)
      const endIdx = Math.min(Math.floor((brushRange.end / 100) * data.categoryData.length), data.categoryData.length - 1)
      if (startIdx >= 0 && endIdx >= startIdx && data.values[startIdx] && data.values[endIdx]) {
        const startPrice = data.values[startIdx][0]
        const endPrice = data.values[endIdx][1]
        const changePct = ((endPrice - startPrice) / startPrice * 100).toFixed(2)
        rangeInfo = `区间涨幅: ${changePct >= 0 ? '+' : ''}${changePct}%`
      }
    }

    chart.setOption({
      animation: false,
      title: rangeInfo ? { text: rangeInfo, left: 'center', top: 5, textStyle: { fontSize: 12, fontWeight: 'normal', color: '#666' } } : undefined,
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'cross' },
        formatter: (params) => {
          if (!params || !params.length) return ''
          const date = params[0].axisValue
          const kline = params.find(p => p.seriesName === stockName)
          if (!kline || !kline.data) return date
          const [open, close, low, high] = kline.data
          const change = ((close - open) / open * 100).toFixed(2)
          return `<div style="font-size:12px"><div style="font-weight:bold;margin-bottom:4px">${date}</div><div>开: ${open.toFixed(2)}</div><div>收: ${close.toFixed(2)}</div><div>高: ${high.toFixed(2)}</div><div>低: ${low.toFixed(2)}</div><div style="color:${change >= 0 ? upColor : downColor}">涨跌: ${change >= 0 ? '+' : ''}${change}%</div></div>`
        }
      },
      grid: [
        { left: 45, right: 10, top: 30, bottom: '28%' },
        { left: 45, right: 10, top: '75%', bottom: 45 }
      ],
      xAxis: [
        { type: 'category', data: data.categoryData, boundaryGap: false, axisLine: { onZero: false }, splitLine: { show: false }, axisLabel: { fontSize: 10 } },
        { type: 'category', gridIndex: 1, data: data.categoryData, boundaryGap: false, axisLine: { onZero: false }, axisLabel: { show: false } }
      ],
      yAxis: [
        { scale: true, splitArea: { show: true }, axisLabel: { fontSize: 10 } },
        { scale: true, gridIndex: 1, axisLabel: { show: false }, axisLine: { show: false }, splitLine: { show: false } }
      ],
      dataZoom: [{ type: 'slider', xAxisIndex: [0, 1], start: brushRange?.start ?? 80, end: brushRange?.end ?? 100, height: 20, bottom: 10, borderColor: 'transparent', backgroundColor: '#f5f5f5', fillerColor: 'rgba(24, 144, 255, 0.2)', handleStyle: { color: '#1890ff' }, textStyle: { fontSize: 10 } }],
      visualMap: { show: false, seriesIndex: 1, dimension: 2, pieces: [{ value: 1, color: downColor }, { value: -1, color: upColor }] },
      series: [
        { name: stockName, type: 'candlestick', data: data.values, itemStyle: { color: upColor, color0: downColor, borderColor: 'transparent', borderColor0: 'transparent', borderWidth: 0 } },
        { name: 'Volume', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: data.volumes }
      ]
    })

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    return () => { window.removeEventListener('resize', handleResize); chart.dispose() }
  }, [data, stockName, brushRange])

  return <div ref={chartRef} style={{ height }} />
})

// 财务图表组件
const FinanceChart = memo(({ data, metric, height = 220 }) => {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)

  useEffect(() => {
    if (!chartRef.current || !data?.length) return

    if (chartInstanceRef.current) chartInstanceRef.current.dispose()
    
    const chart = echarts.init(chartRef.current)
    chartInstanceRef.current = chart

    const metricConfig = financeMetricsSimple.find(m => m.key === metric)
    const chartData = data.slice(-12)
    const categories = chartData.map(d => d.period)
    const values = chartData.map(d => d[metric] ?? 0)

    chart.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 50, right: 15, top: 20, bottom: 50 },
      xAxis: { type: 'category', data: categories, axisLabel: { fontSize: 9, rotate: 45 } },
      yAxis: { type: 'value', name: metricConfig?.unit, nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
      series: [{ type: 'bar', data: values, itemStyle: { color: (params) => values[params.dataIndex] >= 0 ? '#1890ff' : downColor } }]
    })

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    return () => { window.removeEventListener('resize', handleResize); chart.dispose() }
  }, [data, metric])

  return <div ref={chartRef} style={{ height }} />
})

// 基础信息组件
const BasicInfoMobile = memo(({ stock }) => {
  if (!stock) return null
  const items = [
    { label: '最新价', value: stock.latestPrice?.toFixed(2) || '-', color: (stock.changePct || 0) >= 0 ? upColor : downColor },
    { label: '涨幅', value: stock.changePct ? `${stock.changePct >= 0 ? '+' : ''}${stock.changePct?.toFixed(2)}%` : '-', color: (stock.changePct || 0) >= 0 ? upColor : downColor },
    { label: '市值', value: stock.totalMarketCap ? `${(stock.totalMarketCap / 100000000).toFixed(0)}亿` : '-' },
    { label: '市盈率', value: stock.peRatio?.toFixed(2) || '-' },
    { label: '市净率', value: stock.pbRatio?.toFixed(2) || '-' },
    { label: '换手率', value: stock.turnoverRate ? `${stock.turnoverRate.toFixed(2)}%` : '-' },
  ]
  return (
    <MobileGrid columns={3} gap={8} style={{ padding: '12px 0' }}>
      {items.map((item, idx) => (
        <MobileGrid.Item key={idx} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>{item.label}</div>
          <div style={{ fontSize: 14, fontWeight: 'bold', color: item.color || '#333' }}>{item.value}</div>
        </MobileGrid.Item>
      ))}
    </MobileGrid>
  )
})

// 桌面端基础信息
const BasicInfoDesktop = memo(({ stock }) => {
  if (!stock) return null
  const items = [
    { label: '最新价', value: stock.latestPrice?.toFixed(2) || '-', color: (stock.changePct || 0) >= 0 ? upColor : downColor },
    { label: '涨幅', value: stock.changePct ? `${stock.changePct >= 0 ? '+' : ''}${stock.changePct?.toFixed(2)}%` : '-', color: (stock.changePct || 0) >= 0 ? upColor : downColor },
    { label: '市值', value: stock.totalMarketCap ? `${(stock.totalMarketCap / 100000000).toFixed(0)}亿` : '-' },
    { label: '市盈率', value: stock.peRatio?.toFixed(2) || '-' },
    { label: '市净率', value: stock.pbRatio?.toFixed(2) || '-' },
    { label: '换手率', value: stock.turnoverRate ? `${stock.turnoverRate.toFixed(2)}%` : '-' },
    { label: '振幅', value: stock.amplitude ? `${stock.amplitude.toFixed(2)}%` : '-' },
    { label: '量比', value: stock.volumeRatio?.toFixed(2) || '-' },
  ]
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, padding: '16px 0' }}>
      {items.map((item, idx) => (
        <div key={idx} style={{ minWidth: 80 }}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>{item.label}</div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: item.color || '#333' }}>{item.value}</div>
        </div>
      ))}
    </div>
  )
})

// 财务数据组件 - 移动端
const FinanceSectionMobile = memo(({ data, reportType, onReportTypeChange }) => {
  const [metric, setMetric] = useState('netProfit')
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Selector options={reportTypeOptions} value={[reportType]} onChange={(v) => onReportTypeChange(v[0] || '')} style={{ '--border-radius': '8px', '--checked-color': '#1677ff', '--checked-text-color': '#fff' }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {financeMetricsSimple.map(m => (
          <MobileTag key={m.key} color={metric === m.key ? 'primary' : 'default'} fill={metric === m.key ? 'solid' : 'outline'} onClick={() => setMetric(m.key)} style={{ fontSize: 12, padding: '4px 8px' }}>{m.label}</MobileTag>
        ))}
      </div>
      {data?.length > 0 ? <FinanceChart data={data} metric={metric} /> : <MobileEmpty description="暂无财务数据" style={{ padding: 40 }} />}
      {data?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8 }}>近期数据</div>
          {data.slice(-5).reverse().map((item, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ fontSize: 12, color: '#666' }}>{item.period}</span>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 13, fontWeight: 'bold', color: item.netProfit >= 0 ? '#1890ff' : downColor }}>{item.netProfit?.toFixed(2)}亿</span>
                {item.netProfitYoy !== null && <span style={{ fontSize: 11, marginLeft: 8, color: item.netProfitYoy >= 0 ? upColor : downColor }}>{item.netProfitYoy >= 0 ? '+' : ''}{item.netProfitYoy?.toFixed(1)}%</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

// 财务数据组件 - 桌面端
const FinanceSectionDesktop = memo(({ data, reportType, onReportTypeChange }) => {
  const [metric, setMetric] = useState('netProfit')
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <span style={{ color: '#666' }}>报告类型:</span>
        <Space>{reportTypeOptions.map(opt => <Tag key={opt.value} color={reportType === opt.value ? 'blue' : 'default'} style={{ cursor: 'pointer' }} onClick={() => onReportTypeChange(opt.value)}>{opt.label}</Tag>)}</Space>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ color: '#666' }}>指标:</span>
        {financeMetricsSimple.map(m => <Tag key={m.key} color={metric === m.key ? 'blue' : 'default'} style={{ cursor: 'pointer' }} onClick={() => setMetric(m.key)}>{m.label}</Tag>)}
      </div>
      {data?.length > 0 ? <FinanceChart data={data} metric={metric} height={300} /> : <Empty description="暂无财务数据" style={{ padding: 60 }} />}
      {data?.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 12 }}>近期数据</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {data.slice(-6).reverse().map((item, idx) => (
              <div key={idx} style={{ padding: 12, background: '#fafafa', borderRadius: 8 }}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>{item.period}</div>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: item.netProfit >= 0 ? '#1890ff' : downColor }}>{item.netProfit?.toFixed(2)}亿</div>
                {item.netProfitYoy !== null && <div style={{ fontSize: 12, marginTop: 4, color: item.netProfitYoy >= 0 ? upColor : downColor }}>同比: {item.netProfitYoy >= 0 ? '+' : ''}{item.netProfitYoy?.toFixed(1)}%</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

// 新闻列表 - 移动端
const NewsSectionMobile = memo(({ news }) => (
  <List>
    {news.length > 0 ? news.map((item, idx) => (
      <List.Item key={idx} onClick={() => window.open(item.url, '_blank')} description={<div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#999', marginTop: 4 }}><span>{item.source}</span><span>{item.date}</span></div>}>
        <div style={{ fontSize: 14, lineHeight: 1.4 }}>{item.title}</div>
      </List.Item>
    )) : <MobileEmpty description="暂无相关资讯" style={{ padding: 40 }} />}
  </List>
))

// 新闻列表 - 桌面端
const NewsSectionDesktop = memo(({ news }) => (
  <div>
    {news.length > 0 ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {news.map((item, idx) => (
          <div key={idx} onClick={() => window.open(item.url, '_blank')} style={{ padding: 16, background: '#fafafa', borderRadius: 8, cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'} onMouseLeave={(e) => e.currentTarget.style.background = '#fafafa'}>
            <div style={{ fontSize: 15, lineHeight: 1.5, marginBottom: 8 }}>{item.title}</div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#999' }}><span>{item.source}</span><span>{item.date}</span></div>
          </div>
        ))}
      </div>
    ) : <Empty description="暂无相关资讯" style={{ padding: 60 }} />}
  </div>
))

// 生成外部链接
const getEastMoneyUrl = (symbol, market = 'hk') => market === 'a' ? `https://quote.eastmoney.com/${symbol.startsWith('6') ? 'sh' : 'sz'}${symbol}.html` : `https://quote.eastmoney.com/hk/${symbol}.html`
const getXueqiuUrl = (symbol, market = 'hk') => market === 'a' ? `https://xueqiu.com/S/${symbol.startsWith('6') ? 'SH' : 'SZ'}${symbol}` : `https://xueqiu.com/S/${symbol}`

// 判断是否为移动端
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  return isMobile
}

// 主组件
export default function DetailMobilePage() {
  const { symbol } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  
  const [loading, setLoading] = useState(true)
  const [stock, setStock] = useState(null)
  const [klineData, setKlineData] = useState(null)
  const [financeData, setFinanceData] = useState([])
  const [stockNews, setStockNews] = useState([])
  const [reportType, setReportType] = useState('')
  const [activeTab, setActiveTab] = useState('kline')

  const stockName = searchParams.get('name') || ''
  const market = searchParams.get('market') || 'hk'
  const dateRange = useMemo(() => ({ start: searchParams.get('start') || '', end: searchParams.get('end') || '' }), [searchParams])

  const loadFinanceData = useCallback(async (sym, type) => {
    const finance = await fetchFinanceData(sym, type, market as 'a' | 'hk' | 'us')
    setFinanceData(finance)
  }, [market])

  const handleReportTypeChange = useCallback((value) => {
    setReportType(value)
    if (symbol) loadFinanceData(symbol, value)
  }, [symbol, loadFinanceData])

  const handleBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/range-stats')
  }, [navigate])

  useEffect(() => {
    if (!symbol) return
    const loadData = async () => {
      setLoading(true)
      try {
        const [stockInfo, kline, finance] = await Promise.all([
          fetchStockInfo(symbol, stockName, market as 'a' | 'hk' | 'us'),
          fetchKlineData(symbol, market, 'day', 100),
          fetchFinanceData(symbol, '', market as 'a' | 'hk' | 'us'),
        ])
        setStock(stockInfo)
        setKlineData(kline)
        setFinanceData(finance)
        const newsName = stockInfo?.name || stockName
        if (newsName) {
          const news = await fetchStockNews(newsName)
          setStockNews(news)
        }
      } catch (error) {
        console.error('加载数据失败:', error)
        if (isMobile) Toast.show({ content: '加载数据失败', icon: 'fail' })
      } finally {
        setLoading(false)
      }
    }
    loadData()
    setReportType('')
  }, [symbol, stockName, market, isMobile])

  if (loading) {
    return isMobile 
      ? <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}><SpinLoading color="primary" /></div>
      : <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}><Spin size="large" /></div>
  }

  if (!stock) {
    return isMobile ? (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>
        <NavBar onBack={handleBack} style={{ background: '#fff', borderBottom: '1px solid #eee' }}>股票详情</NavBar>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MobileEmpty description={`未找到股票 ${symbol}`} /></div>
      </div>
    ) : (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>
        <div style={{ padding: 16, background: '#fff', borderBottom: '1px solid #eee' }}><Button icon={<ArrowLeftOutlined />} onClick={handleBack}>返回</Button></div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Empty description={`未找到股票 ${symbol}`} /></div>
      </div>
    )
  }

  // 桌面端布局
  if (!isMobile) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        <div style={{ padding: '12px 24px', background: '#fff', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>返回</Button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20, fontWeight: 'bold' }}>{stock.name}</span>
              <span style={{ fontSize: 14, color: '#999' }}>{stock.symbol}</span>
              <span style={{ fontSize: 24, fontWeight: 'bold', color: (stock.changePct || 0) >= 0 ? upColor : downColor }}>{stock.latestPrice?.toFixed(2) || '-'}</span>
              {stock.changePct !== undefined && <Tag color={(stock.changePct || 0) >= 0 ? 'red' : 'green'}>{stock.changePct >= 0 ? '+' : ''}{stock.changePct?.toFixed(2)}%</Tag>}
            </div>
          </div>
          <Space>
            <Tooltip title="在东方财富查看"><Button size="small" onClick={() => window.open(getEastMoneyUrl(stock.symbol, market), '_blank')}>东财</Button></Tooltip>
            <Tooltip title="在雪球查看"><Button size="small" onClick={() => window.open(getXueqiuUrl(stock.symbol, market), '_blank')}>雪球</Button></Tooltip>
          </Space>
        </div>
        <div style={{ padding: '0 24px' }}><Card style={{ marginTop: 16 }}><BasicInfoDesktop stock={stock} /></Card></div>
        <div style={{ padding: '16px 24px' }}>
          <Card>
            <Tabs activeKey={activeTab} onChange={setActiveTab}>
              <Tabs.TabPane tab="K线走势" key="kline">
                <div style={{ padding: '16px 0' }}>
                  {dateRange.start && dateRange.end && <div style={{ fontSize: 13, color: '#999', marginBottom: 12 }}>查询区间: {dateRange.start} ~ {dateRange.end}</div>}
                  {klineData?.values?.length > 0 ? <KlineChart data={klineData} stockName={stock.name} dateRange={dateRange} height={400} /> : <Empty description="暂无K线数据" style={{ padding: 60 }} />}
                </div>
              </Tabs.TabPane>
              <Tabs.TabPane tab="财务数据" key="finance"><div style={{ padding: '16px 0' }}><FinanceSectionDesktop data={financeData} reportType={reportType} onReportTypeChange={handleReportTypeChange} /></div></Tabs.TabPane>
              <Tabs.TabPane tab="相关资讯" key="news"><div style={{ padding: '16px 0' }}><NewsSectionDesktop news={stockNews} /></div></Tabs.TabPane>
            </Tabs>
          </Card>
        </div>
      </div>
    )
  }

  // 移动端布局
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>
      <NavBar onBack={handleBack} style={{ background: '#fff', borderBottom: '1px solid #eee' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontWeight: 'bold' }}>{stock.name}</span><span style={{ fontSize: 12, color: '#999' }}>{stock.symbol}</span></div>
      </NavBar>
      <MobileCard style={{ margin: 0, borderRadius: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 28, fontWeight: 'bold', color: (stock.changePct || 0) >= 0 ? upColor : downColor }}>{stock.latestPrice?.toFixed(2) || '-'}</span>
          {stock.changePct !== undefined && <span style={{ fontSize: 16, color: stock.changePct >= 0 ? upColor : downColor }}>{stock.changePct >= 0 ? '+' : ''}{stock.changePct?.toFixed(2)}%</span>}
        </div>
        <BasicInfoMobile stock={stock} />
      </MobileCard>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MobileTabs activeKey={activeTab} onChange={setActiveTab} style={{ '--title-font-size': '14px' }}>
          <MobileTabs.Tab title="走势" key="kline">
            <MobileCard style={{ margin: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>K线走势{dateRange.start && dateRange.end && <span style={{ fontSize: 11, color: '#999', fontWeight: 'normal', marginLeft: 8 }}>(首页区间: {dateRange.start} ~ {dateRange.end})</span>}</div>
              {klineData?.values?.length > 0 ? <KlineChart data={klineData} stockName={stock.name} dateRange={dateRange} /> : <MobileEmpty description="暂无K线数据" style={{ padding: 40 }} />}
            </MobileCard>
          </MobileTabs.Tab>
          <MobileTabs.Tab title="财务" key="finance"><MobileCard style={{ margin: 12, borderRadius: 8 }}><FinanceSectionMobile data={financeData} reportType={reportType} onReportTypeChange={handleReportTypeChange} /></MobileCard></MobileTabs.Tab>
          <MobileTabs.Tab title="资讯" key="news"><MobileCard style={{ margin: 12, borderRadius: 8, padding: 0 }}><NewsSectionMobile news={stockNews} /></MobileCard></MobileTabs.Tab>
        </MobileTabs>
      </div>
    </div>
  )
}
