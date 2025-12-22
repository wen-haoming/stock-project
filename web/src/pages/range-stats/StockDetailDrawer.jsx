import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { Card, Table, Spin, Empty, Radio, Statistic, Row, Col, Drawer, Grid } from 'antd'
import * as echarts from 'echarts'
import axios from 'axios'
import dayjs from 'dayjs'

const { useBreakpoint } = Grid

// ECharts 颜色配置
const upColor = '#ec5a5a'
const downColor = '#47b262'

// 财务指标配置
const financeMetrics = [
  { key: 'netProfit', label: '归母净利润', unit: '亿', yoyKey: 'netProfitYoy' },
  { key: 'revenue', label: '营业收入', unit: '亿', yoyKey: 'revenueYoy' },
  { key: 'eps', label: '每股收益', unit: '元', yoyKey: null },
  { key: 'navps', label: '每股净资产', unit: '元', yoyKey: null },
  { key: 'npm', label: '净利率', unit: '%', yoyKey: null },
  { key: 'gpm', label: '毛利率', unit: '%', yoyKey: null },
  { key: 'roe', label: 'ROE', unit: '%', yoyKey: null },
  { key: 'dar', label: '资产负债率', unit: '%', yoyKey: null },
]

// 获取个股 K 线数据
const fetchStockKline = async (symbol) => {
  try {
    const start = dayjs().subtract(1, 'year').format('YYYYMMDD')
    const end = dayjs().format('YYYYMMDD')
    const secid = `116.${symbol}`
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=${start}&end=${end}`

    const response = await axios.get(url)
    const rawData = response.data?.data?.klines || []

    const categoryData = []
    const values = []
    const volumes = []

    rawData.forEach((item) => {
      const fields = item.split(',')
      categoryData.push(fields[0])
      const open = parseFloat(fields[1])
      const close = parseFloat(fields[2])
      values.push([open, close, parseFloat(fields[4]), parseFloat(fields[3])])
      volumes.push([categoryData.length - 1, parseInt(fields[5]), open > close ? 1 : -1])
    })

    return { categoryData, values, volumes }
  } catch (error) {
    console.error('获取个股K线失败:', error)
    return { categoryData: [], values: [], volumes: [] }
  }
}

// 获取个股新闻
const fetchStockNews = async (name) => {
  try {
    const url = `https://search-api-web.eastmoney.com/search/jsonp?cb=jQuery&param={"uid":"","keyword":"${encodeURIComponent(name)}","type":["cmsArticleWebOld"],"client":"web","clientType":"web","clientVersion":"curr","param":{"cmsArticleWebOld":{"searchScope":"default","sort":"default","pageIndex":1,"pageSize":10,"preTag":"<em>","postTag":"</em>"}}}`
    const response = await axios.get(url)
    const jsonStr = response.data.replace(/^jQuery\(/, '').replace(/\)$/, '')
    const data = JSON.parse(jsonStr)
    return (data?.result?.cmsArticleWebOld?.list || []).map(item => ({
      title: item.title?.replace(/<\/?em>/g, ''),
      url: item.url,
      date: item.date,
      source: item.mediaName,
    }))
  } catch (error) {
    console.error('获取新闻失败:', error)
    return []
  }
}

// 获取财务数据 (模拟)
const fetchFinanceData = async () => {
  const years = []
  const currentYear = new Date().getFullYear()
  for (let year = 2015; year <= currentYear; year++) {
    years.push(`${year}中报`)
    if (year < currentYear || new Date().getMonth() >= 3) years.push(`${year}年报`)
  }
  
  const baseNetProfit = Math.random() * 20 + 5
  const baseRevenue = baseNetProfit * (3 + Math.random() * 2)
  
  return years.map((period, idx) => {
    const growth = 1 + (Math.random() - 0.4) * 0.25
    const netProfit = baseNetProfit * Math.pow(growth, idx * 0.5)
    const revenue = baseRevenue * Math.pow(growth, idx * 0.5)
    const prevNetProfit = idx >= 2 ? baseNetProfit * Math.pow(growth, (idx - 2) * 0.5) : null
    const prevRevenue = idx >= 2 ? baseRevenue * Math.pow(growth, (idx - 2) * 0.5) : null
    
    return {
      period,
      netProfit,
      netProfitYoy: prevNetProfit ? ((netProfit / prevNetProfit) - 1) * 100 : null,
      revenue,
      revenueYoy: prevRevenue ? ((revenue / prevRevenue) - 1) * 100 : null,
      eps: netProfit / 10,
      navps: 5 + Math.random() * 10,
      npm: 8 + Math.random() * 15,
      gpm: 20 + Math.random() * 30,
      roe: 5 + Math.random() * 20,
      dar: 30 + Math.random() * 40,
    }
  })
}

// K线图表组件
const KlineChart = memo(({ data, stockName, isMobile }) => {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)

  useEffect(() => {
    if (!chartRef.current || !data?.values?.length) return

    if (chartInstanceRef.current) chartInstanceRef.current.dispose()
    
    const chart = echarts.init(chartRef.current)
    chartInstanceRef.current = chart

    chart.setOption({
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      grid: [
        { left: 50, right: 10, top: 10, bottom: '28%' },
        { left: 50, right: 10, top: '75%', bottom: 30 }
      ],
      xAxis: [
        { type: 'category', data: data.categoryData, boundaryGap: false, axisLine: { onZero: false }, splitLine: { show: false } },
        { type: 'category', gridIndex: 1, data: data.categoryData, boundaryGap: false, axisLine: { onZero: false }, axisLabel: { show: false } }
      ],
      yAxis: [
        { scale: true, splitArea: { show: true } },
        { scale: true, gridIndex: 1, axisLabel: { show: false }, axisLine: { show: false }, splitLine: { show: false } }
      ],
      visualMap: {
        show: false,
        seriesIndex: 1,
        dimension: 2,
        pieces: [{ value: 1, color: downColor }, { value: -1, color: upColor }]
      },
      series: [
        {
          name: stockName,
          type: 'candlestick',
          data: data.values,
          itemStyle: { color: upColor, color0: downColor, borderColor: 'transparent', borderColor0: 'transparent', borderWidth: 0 }
        },
        { name: 'Volume', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: data.volumes }
      ]
    })

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [data, stockName])

  return <div ref={chartRef} style={{ height: isMobile ? 200 : 350 }} />
})

// 财务图表组件
const FinanceChart = memo(({ data, metric, isMobile }) => {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)

  useEffect(() => {
    if (!chartRef.current || !data?.length) return

    if (chartInstanceRef.current) chartInstanceRef.current.dispose()
    
    const chart = echarts.init(chartRef.current)
    chartInstanceRef.current = chart

    const metricConfig = financeMetrics.find(m => m.key === metric)
    const categories = data.map(d => d.period)
    const values = data.map(d => d[metric])
    const yoyKey = metricConfig?.yoyKey
    const yoyValues = yoyKey ? data.map(d => d[yoyKey]) : null
    const hasYoy = yoyValues?.some(v => v !== null)

    chart.setOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params) => {
          let html = `<div style="font-weight:bold;margin-bottom:4px">${params[0].axisValue}</div>`
          params.forEach(p => {
            if (p.seriesName === metricConfig.label) {
              html += `<div>${p.marker}${p.seriesName}: ${p.value?.toFixed(2)}${metricConfig.unit}</div>`
            } else if (p.seriesName === '同比' && p.value !== null) {
              const color = p.value >= 0 ? '#ec5a5a' : '#47b262'
              html += `<div>${p.marker}<span style="color:${color}">同比: ${p.value >= 0 ? '+' : ''}${p.value?.toFixed(2)}%</span></div>`
            }
          })
          return html
        }
      },
      legend: { data: hasYoy ? [metricConfig.label, '同比'] : [metricConfig.label], top: 0, right: 0, textStyle: { fontSize: 11 } },
      grid: { left: 50, right: hasYoy ? 50 : 20, top: 35, bottom: 50 },
      dataZoom: [{ type: 'slider', show: true, xAxisIndex: [0], start: Math.max(0, 100 - (10 / data.length * 100)), end: 100, height: 20, bottom: 5 }],
      xAxis: { type: 'category', data: categories, axisLabel: { fontSize: 10, rotate: 45 } },
      yAxis: [
        { type: 'value', name: metricConfig.unit, nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { type: 'dashed' } } },
        hasYoy ? { type: 'value', name: '%', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 }, splitLine: { show: false } } : null
      ].filter(Boolean),
      series: [
        {
          name: metricConfig.label,
          type: 'bar',
          data: values,
          itemStyle: { color: (params) => ['npm', 'gpm', 'roe', 'dar'].includes(metric) ? '#1890ff' : (values[params.dataIndex] >= 0 ? '#1890ff' : '#47b262') }
        },
        hasYoy ? { name: '同比', type: 'line', yAxisIndex: 1, data: yoyValues, symbol: 'circle', symbolSize: 4, lineStyle: { color: '#ff7a45' }, itemStyle: { color: '#ff7a45' } } : null
      ].filter(Boolean)
    })

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [data, metric])

  return <div ref={chartRef} style={{ height: isMobile ? 220 : 300 }} />
})

// 基础信息卡片
const BasicInfoCard = memo(({ stock, isMobile }) => (
  <Card title="基础信息" size="small" style={{ marginBottom: 16 }}>
    <Row gutter={[16, 16]}>
      <Col xs={12} sm={8} md={6} lg={4}>
        <Statistic title="最新价" value={stock.latestPrice} precision={2} valueStyle={{ color: stock.changePct >= 0 ? '#ec5a5a' : '#47b262', fontSize: isMobile ? 18 : 24 }} />
      </Col>
      <Col xs={12} sm={8} md={6} lg={4}>
        <Statistic title="起始价" value={stock.startPrice} precision={2} valueStyle={{ fontSize: isMobile ? 16 : 20 }} />
      </Col>
      <Col xs={12} sm={8} md={6} lg={4}>
        <Statistic title="结束价" value={stock.endPrice} precision={2} valueStyle={{ fontSize: isMobile ? 16 : 20 }} />
      </Col>
      <Col xs={12} sm={8} md={6} lg={4}>
        <Statistic title="市值(亿)" value={stock.totalMarketCap ? (stock.totalMarketCap / 100000000).toFixed(0) : '-'} valueStyle={{ fontSize: isMobile ? 16 : 20 }} />
      </Col>
      <Col xs={12} sm={8} md={6} lg={4}>
        <Statistic title="行业" value={stock.industry || '-'} valueStyle={{ fontSize: isMobile ? 14 : 16 }} />
      </Col>
      <Col xs={12} sm={8} md={6} lg={4}>
        <Statistic title="市盈率" value={stock.peRatio?.toFixed(2) || '-'} valueStyle={{ fontSize: isMobile ? 16 : 20 }} />
      </Col>
      <Col xs={12} sm={8} md={6} lg={4}>
        <Statistic title="市净率" value={stock.pbRatio?.toFixed(2) || '-'} valueStyle={{ fontSize: isMobile ? 16 : 20 }} />
      </Col>
      <Col xs={12} sm={8} md={6} lg={4}>
        <Statistic title="换手率" value={stock.turnoverRate ? stock.turnoverRate.toFixed(2) + '%' : '-'} valueStyle={{ fontSize: isMobile ? 16 : 20 }} />
      </Col>
      <Col xs={24} sm={8} md={6} lg={4}>
        <Statistic title="区间涨幅" value={stock.changePct} precision={2} suffix="%" prefix={stock.changePct >= 0 ? '+' : ''} valueStyle={{ color: stock.changePct >= 0 ? '#ec5a5a' : '#47b262', fontSize: isMobile ? 16 : 24, whiteSpace: 'nowrap' }} />
      </Col>
    </Row>
  </Card>
))

// 新闻列表组件
const NewsList = memo(({ news }) => (
  <Card title="相关资讯" size="small">
    {news.length > 0 ? (
      <div>
        {news.map((item, index) => (
          <div key={index} style={{ padding: '12px 0', borderBottom: index < news.length - 1 ? '1px solid #f0f0f0' : 'none', cursor: 'pointer' }} onClick={() => window.open(item.url, '_blank')}>
            <div style={{ fontSize: 14, color: '#333', lineHeight: 1.5, marginBottom: 6 }}>{item.title}</div>
            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#999' }}>
              <span>{item.source}</span>
              <span>{item.date}</span>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <Empty description="暂无相关资讯" image={Empty.PRESENTED_IMAGE_SIMPLE} />
    )}
  </Card>
))

// 财务表格列定义
const financeTableColumns = [
  { title: '报告期', dataIndex: 'period', width: 90, fixed: 'left' },
  { title: '归母净利润(亿)', dataIndex: 'netProfit', width: 110, render: (v) => <span style={{ color: v >= 0 ? '#1890ff' : '#47b262' }}>{v?.toFixed(2)}</span> },
  { title: '同比', dataIndex: 'netProfitYoy', width: 80, render: (v) => v !== null ? <span style={{ color: v >= 0 ? '#ec5a5a' : '#47b262' }}>{v >= 0 ? '+' : ''}{v?.toFixed(1)}%</span> : '-' },
  { title: '营业收入(亿)', dataIndex: 'revenue', width: 100, render: (v) => v?.toFixed(2) },
  { title: '收入同比', dataIndex: 'revenueYoy', width: 80, render: (v) => v !== null ? <span style={{ color: v >= 0 ? '#ec5a5a' : '#47b262' }}>{v >= 0 ? '+' : ''}{v?.toFixed(1)}%</span> : '-' },
  { title: '每股收益', dataIndex: 'eps', width: 80, render: (v) => v?.toFixed(3) },
  { title: 'ROE', dataIndex: 'roe', width: 70, render: (v) => v?.toFixed(1) + '%' },
]

// 主组件
function StockDetailDrawer({ visible, stock, onClose }) {
  const screens = useBreakpoint()
  const isMobile = !screens.md

  const [loading, setLoading] = useState(false)
  const [klineData, setKlineData] = useState(null)
  const [financeData, setFinanceData] = useState(null)
  const [financeMetric, setFinanceMetric] = useState('netProfit')
  const [stockNews, setStockNews] = useState([])

  // 加载数据
  const loadData = useCallback(async () => {
    if (!stock) return
    
    setLoading(true)
    setKlineData(null)
    setFinanceData(null)
    setStockNews([])
    setFinanceMetric('netProfit')

    try {
      const [kline, news, finance] = await Promise.all([
        fetchStockKline(stock.symbol),
        fetchStockNews(stock.name),
        fetchFinanceData(stock.symbol),
      ])
      setKlineData(kline)
      setStockNews(news)
      setFinanceData(finance)
    } catch (error) {
      console.error('加载数据失败:', error)
    } finally {
      setLoading(false)
    }
  }, [stock])

  // 打开时加载数据
  useEffect(() => {
    if (visible && stock) {
      loadData()
    }
  }, [visible, stock, loadData])

  return (
    <Drawer
      title={stock ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 'bold' }}>{stock.name}</span>
          <span style={{ color: '#999', fontSize: 12 }}>{stock.symbol}</span>
          <span style={{ color: stock.changePct >= 0 ? '#ec5a5a' : '#47b262', fontWeight: 'bold', fontSize: 14 }}>
            {stock.latestPrice?.toFixed(2)} {stock.changePct >= 0 ? '+' : ''}{stock.changePct?.toFixed(2)}%
          </span>
        </div>
      ) : '股票详情'}
      placement={isMobile ? 'bottom' : 'right'}
      width={isMobile ? '100%' : 800}
      height={isMobile ? '100%' : undefined}
      onClose={onClose}
      open={visible}
      destroyOnClose
      styles={{ body: { padding: 0, overflow: 'auto' } }}
    >
      <Spin spinning={loading}>
        {stock && (
          <div style={{ padding: isMobile ? 12 : 20, maxWidth: 1200, margin: '0 auto' }}>
            <BasicInfoCard stock={stock} isMobile={isMobile} />

            <Card title="K线走势" size="small" style={{ marginBottom: 16 }}>
              {klineData?.values?.length > 0 ? (
                <KlineChart data={klineData} stockName={stock.name} isMobile={isMobile} />
              ) : (
                <div style={{ height: isMobile ? 200 : 350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Empty description="暂无K线数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
              )}
            </Card>

            <Card 
              title="财务数据" 
              size="small" 
              style={{ marginBottom: 16 }}
              extra={financeData?.length > 0 && <span style={{ fontSize: 12, color: '#999' }}>共 {financeData.length} 期数据</span>}
            >
              <div style={{ marginBottom: 12 }}>
                <Radio.Group value={financeMetric} onChange={(e) => setFinanceMetric(e.target.value)} size="small" buttonStyle="solid">
                  {financeMetrics.map(m => (
                    <Radio.Button key={m.key} value={m.key} style={{ marginBottom: 4 }}>{m.label}</Radio.Button>
                  ))}
                </Radio.Group>
              </div>
              {financeData?.length > 0 ? (
                <FinanceChart data={financeData} metric={financeMetric} isMobile={isMobile} />
              ) : (
                <div style={{ height: isMobile ? 220 : 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Empty description="暂无财务数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
              )}
            </Card>

            {financeData?.length > 0 && (
              <Card title="财务报表明细" size="small" style={{ marginBottom: 16 }}>
                <Table
                  size="small"
                  pagination={{ pageSize: 10, showSizeChanger: true, showQuickJumper: true }}
                  scroll={{ x: 600 }}
                  dataSource={financeData.slice().reverse()}
                  rowKey="period"
                  columns={financeTableColumns}
                />
              </Card>
            )}

            <NewsList news={stockNews} />
          </div>
        )}
      </Spin>
    </Drawer>
  )
}

export default memo(StockDetailDrawer)
