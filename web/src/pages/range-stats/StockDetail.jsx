import { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react'
import { Card, Table, Spin, Empty, Radio, Select, Space, Button, message, Tooltip, Tabs } from 'antd'
import { DownloadOutlined, CopyOutlined, CameraOutlined, QuestionCircleOutlined, PlusOutlined, MinusOutlined, StarOutlined, StarFilled } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import { fetchStockKline, fetchStockTrend, fetchStockNews, fetchFinanceData, fetchAnnouncements, fetchStockInfo } from '@/api/stock'
import { reportTypeOptions, financeMetrics, financeTableColumns } from '@/constants/finance'
import { 
  StockKlineChart, 
  FinanceChart, 
  BasicInfoCard, 
  NewsList, 
  AnnouncementTable,
  TechnicalIndicatorsCard,
  MarketPerformanceCard,
  MoneyFlowCard,
  RiskAssessmentCard,
  ValuationCard,
<<<<<<< HEAD
=======
  OrderBookCard
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
} from './components'
import { useTheme } from '../../contexts/ThemeContext'

// 自选股存储 key（与 watchlist 页面保持一致）
const WATCHLIST_STORAGE_KEY = 'watchlist_data'

// 添加/移除自选股的工具函数
const getWatchlistData = () => {
  try {
    const data = localStorage.getItem(WATCHLIST_STORAGE_KEY)
    return data ? JSON.parse(data) : { groups: [{ id: 'default', name: '默认分组', stocks: [] }], activeGroupId: 'default' }
  } catch {
    return { groups: [{ id: 'default', name: '默认分组', stocks: [] }], activeGroupId: 'default' }
  }
}

const isInWatchlist = (symbol, market) => {
  const data = getWatchlistData()
  return data.groups.some(g => g.stocks.some(s => s.symbol === symbol && s.market === market))
}

const addToWatchlist = (stock, market) => {
  const data = getWatchlistData()
  const activeGroup = data.groups.find(g => g.id === data.activeGroupId) || data.groups[0]
  
  if (activeGroup.stocks.some(s => s.symbol === stock.symbol && s.market === market)) {
    return false // 已存在
  }
  
  const newStock = { symbol: stock.symbol, name: stock.name, market }
  const newGroups = data.groups.map(g => {
    if (g.id === activeGroup.id) {
      return { ...g, stocks: [...g.stocks, newStock] }
    }
    return g
  })
  
  localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify({ ...data, groups: newGroups }))
  return true
}

const removeFromWatchlist = (symbol, market) => {
  const data = getWatchlistData()
  const newGroups = data.groups.map(g => ({
    ...g,
    stocks: g.stocks.filter(s => !(s.symbol === symbol && s.market === market))
  }))
  
  localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify({ ...data, groups: newGroups }))
  return true
}

// K线周期配置，包含默认时间范围索引
const KLINE_PERIODS = [
  { key: 'trend', label: '分时', defaultRangeIndex: -1 },   // 分时图
  { key: 'day', label: '日K', defaultRangeIndex: 1 },      // 默认3个月
  { key: 'week', label: '周K', defaultRangeIndex: 3 },     // 默认2年
  { key: 'month', label: '月K', defaultRangeIndex: 4 },    // 默认3年
  { key: 'quarter', label: '季K', defaultRangeIndex: 5 },  // 默认5年
  { key: 'year', label: '年K', defaultRangeIndex: 6 },     // 默认10年
]

// 时间范围配置（月数）
const TIME_RANGES = [
  { months: 2, label: '' },
  { months: 3, label: '' },
  { months: 6, label: '' },
  { months: 12, label: '' },
  { months: 24, label: '' },
  { months: 36, label: '' },
  { months: 60, label: '' },
  { months: 120, label: '' },
]

/**
 * 股票详情组件
 */
function StockDetail({ stock, market = 'hk', dateRange }) {
  const { theme: currentTheme } = useTheme()
  const [activeTab, setActiveTab] = useState('quote')
  const [loading, setLoading] = useState(false)
  const [stockInfo, setStockInfo] = useState(null)  // 股票基础信息
  const [klineData, setKlineData] = useState(null)
  const [klinePeriod, setKlinePeriod] = useState('day')
  const [klineRangeIndex, setKlineRangeIndex] = useState(1) // 默认3个月
  const [klineLoading, setKlineLoading] = useState(false)
  const [financeData, setFinanceData] = useState(null)
  const [financeLoading, setFinanceLoading] = useState(false)
  const [financeMetric, setFinanceMetric] = useState('netProfit')
  const [stockNews, setStockNews] = useState([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [reportType, setReportType] = useState('')
  const [announcements, setAnnouncements] = useState([])
  const [announcementTotal, setAnnouncementTotal] = useState(0)
  const [announcementPagination, setAnnouncementPagination] = useState({ current: 1, pageSize: 10 })
  const [announcementLoading, setAnnouncementLoading] = useState(false)
  const [announcementCategory, setAnnouncementCategory] = useState('0')
  const [isWatchlisted, setIsWatchlisted] = useState(false)
  const [showZhixing, setShowZhixing] = useState(false) // 双线战法开关
  
  // 记录已加载的 Tab，避免重复加载
  const loadedTabsRef = useRef(new Set())

  const financeChartCardRef = useRef(null)
  const financeTableCardRef = useRef(null)
  
  // 检查是否在自选中
  useEffect(() => {
    if (stock) {
      setIsWatchlisted(isInWatchlist(stock.symbol, market))
    }
  }, [stock, market])
  
  // 切换自选状态
  const handleToggleWatchlist = useCallback(() => {
    if (!stock) return
    
    if (isWatchlisted) {
      removeFromWatchlist(stock.symbol, market)
      setIsWatchlisted(false)
      message.success(`已从自选中移除 ${stock.name}`)
    } else {
      const success = addToWatchlist(stock, market)
      if (success) {
        setIsWatchlisted(true)
        message.success(`已添加 ${stock.name} 到自选`)
      } else {
        message.warning('该股票已在自选中')
      }
    }
  }, [stock, market, isWatchlisted])

  // 加载K线数据
  const loadKlineData = useCallback(async (months, period) => {
    if (!stock) return
    setKlineLoading(true)
    try {
      let data
      if (period === 'trend') {
        // 分时图数据
        data = await fetchStockTrend(stock.symbol, market, 1)
        data.isTrend = true
      } else {
        data = await fetchStockKline(stock.symbol, market, months, period)
      }
      setKlineData(data)
    } catch (error) {
      console.error('加载K线数据失败:', error)
    } finally {
      setKlineLoading(false)
    }
  }, [stock, market])

  // 加载财务数据
  const loadFinanceData = useCallback(async (symbol, type) => {
    setFinanceLoading(true)
    try {
      const finance = await fetchFinanceData(symbol, type, market)
      setFinanceData(finance)
    } finally {
      setFinanceLoading(false)
    }
  }, [market])

  // 放大（减少时间范围）
  const handleZoomIn = useCallback(() => {
    if (klineRangeIndex > 0) {
      const newIndex = klineRangeIndex - 1
      setKlineRangeIndex(newIndex)
      loadKlineData(TIME_RANGES[newIndex].months, klinePeriod)
    }
  }, [klineRangeIndex, klinePeriod, loadKlineData])

  // 缩小（增加时间范围）
  const handleZoomOut = useCallback(() => {
    if (klineRangeIndex < TIME_RANGES.length - 1) {
      const newIndex = klineRangeIndex + 1
      setKlineRangeIndex(newIndex)
      loadKlineData(TIME_RANGES[newIndex].months, klinePeriod)
    }
  }, [klineRangeIndex, klinePeriod, loadKlineData])

  // 切换K线周期 - 自动调整时间范围
  const handlePeriodChange = useCallback((period) => {
    const periodConfig = KLINE_PERIODS.find(p => p.key === period)
    const newRangeIndex = periodConfig?.defaultRangeIndex ?? 4
    setKlinePeriod(period)
    setKlineRangeIndex(newRangeIndex)
    if (period === 'trend') {
      loadKlineData(1, period)
    } else {
      loadKlineData(TIME_RANGES[newRangeIndex].months, period)
    }
  }, [loadKlineData])

  // 切换指标类型（BBI/双线）- 双线需要更多数据
  const handleIndicatorChange = useCallback((type) => {
    const isZhixing = type === 'zhixing'
    setShowZhixing(isZhixing)
    
    // 双线战法需要MA114，至少需要8个月数据（约170个交易日）
    // 如果当前数据不足，自动扩大范围
    if (isZhixing && klinePeriod === 'day' && TIME_RANGES[klineRangeIndex].months < 8) {
      const minRangeIndex = TIME_RANGES.findIndex(r => r.months >= 8)
      if (minRangeIndex !== -1 && minRangeIndex !== klineRangeIndex) {
        setKlineRangeIndex(minRangeIndex)
        loadKlineData(TIME_RANGES[minRangeIndex].months, klinePeriod)
      }
    }
  }, [klinePeriod, klineRangeIndex, loadKlineData])

  // 报告类型变化
  const handleReportTypeChange = useCallback((value) => {
    setReportType(value)
    if (stock) {
      loadFinanceData(stock.symbol, value)
    }
  }, [stock, loadFinanceData])

  // 加载公告数据
  const loadAnnouncements = useCallback(async (page, pageSize, category) => {
    if (!stock || market !== 'a') return
    
    setAnnouncementLoading(true)
    try {
      const result = await fetchAnnouncements(stock.symbol, page, pageSize, category)
      setAnnouncements(result.list)
      setAnnouncementTotal(result.total)
    } catch (error) {
      console.error('加载公告失败:', error)
    } finally {
      setAnnouncementLoading(false)
    }
  }, [stock, market])

  // 加载新闻数据
  const loadNewsData = useCallback(async () => {
    if (!stock) return
    setNewsLoading(true)
    try {
      const news = await fetchStockNews(stock.name)
      setStockNews(news)
    } catch (error) {
      console.error('加载新闻失败:', error)
    } finally {
      setNewsLoading(false)
    }
  }, [stock])

  // 公告分类变化
  const handleAnnouncementCategoryChange = useCallback((value) => {
    setAnnouncementCategory(value)
    setAnnouncementPagination({ current: 1, pageSize: announcementPagination.pageSize })
    loadAnnouncements(1, announcementPagination.pageSize, value)
  }, [loadAnnouncements, announcementPagination.pageSize])

  // 公告分页变化
  const handleAnnouncementPaginationChange = useCallback((page, pageSize) => {
    setAnnouncementPagination({ current: page, pageSize })
    loadAnnouncements(page, pageSize, announcementCategory)
  }, [loadAnnouncements, announcementCategory])

  // 加载数据 - 保持当前操作状态，只重置数据
  const loadData = useCallback(async () => {
    if (!stock) return
    
    setLoading(true)
    // 只重置数据，不重置用户的操作状态（如 Tab、K线周期等）
    setStockInfo(null)
    setKlineData(null)
    setFinanceData(null)
    setStockNews([])
    setAnnouncements([])
    setAnnouncementTotal(0)
    // 重置已加载的 Tab 标记，以便重新加载新股票的数据
    loadedTabsRef.current = new Set()

    try {
      // 根据当前 K线周期加载数据
      const currentPeriod = klinePeriod
      const currentRangeIndex = klineRangeIndex
      
      // 加载股票信息
      const info = await fetchStockInfo(stock.symbol, stock.name, market)
      setStockInfo(info)
      
      // 根据当前周期加载 K线数据
      let kline
      if (currentPeriod === 'trend') {
        kline = await fetchStockTrend(stock.symbol, market, 1)
        kline.isTrend = true
      } else {
        const months = TIME_RANGES[currentRangeIndex]?.months || 3
        kline = await fetchStockKline(stock.symbol, market, months, currentPeriod)
      }
      setKlineData(kline)
      
      // 标记当前 Tab 已加载
      loadedTabsRef.current.add(activeTab)
    } catch (error) {
      console.error('加载数据失败:', error)
    } finally {
      setLoading(false)
    }
  }, [stock, market, klinePeriod, klineRangeIndex, activeTab])

  // Tab 切换时懒加载数据
  const handleTabChange = useCallback((key) => {
    setActiveTab(key)
    
    if (!stock || loadedTabsRef.current.has(key)) return
    
    loadedTabsRef.current.add(key)
    
    if (key === 'finance' && !financeData) {
      loadFinanceData(stock.symbol, '')
    } else if (key === 'news') {
      if (!stockNews.length) {
        loadNewsData()
      }
      if (market === 'a' && !announcements.length) {
        loadAnnouncements(1, 10, '0')
      }
    }
  }, [stock, market, financeData, stockNews, announcements, loadFinanceData, loadNewsData, loadAnnouncements])

  useEffect(() => {
    if (stock) {
      loadData()
    }
  }, [stock, loadData])

  // 合并股票信息：优先使用从API获取的stockInfo，没有则使用传入的stock
  const displayStock = stockInfo ? { ...stock, ...stockInfo } : stock

  // 导出财务数据 Excel
  const handleExportFinanceExcel = useCallback(() => {
    if (!financeData?.length) {
      message.warning('没有数据可导出')
      return
    }

    const title = `${displayStock.name}(${displayStock.symbol}) 财务数据`
    const exportData = financeData.slice().reverse().map(item => ({
      '报告期': item.period,
      '归母净利润(亿)': item.netProfit?.toFixed(2),
      '净利润同比(%)': item.netProfitYoy?.toFixed(2),
      '营业收入(亿)': item.revenue?.toFixed(2),
      '收入同比(%)': item.revenueYoy?.toFixed(2),
      '毛利润(亿)': item.grossProfit?.toFixed(2),
      '毛利润同比(%)': item.grossProfitYoy?.toFixed(2),
      '每股收益': item.eps?.toFixed(3),
      '每股净资产': item.navps?.toFixed(2),
      '净利率(%)': item.npm?.toFixed(2),
      '毛利率(%)': item.gpm?.toFixed(2),
      'ROE(%)': item.roe?.toFixed(2),
      '资产负债率(%)': item.dar?.toFixed(2),
    }))

    const ws = XLSX.utils.json_to_sheet([])
    XLSX.utils.sheet_add_aoa(ws, [[title]], { origin: 'A1' })
    XLSX.utils.sheet_add_aoa(ws, [[]], { origin: 'A2' })
    XLSX.utils.sheet_add_json(ws, exportData, { origin: 'A3' })
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 12 } }]
    
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '财务数据')
    XLSX.writeFile(wb, `${displayStock.name}_财务数据.xlsx`)
    message.success('导出成功')
  }, [financeData, displayStock])

  // 复制财务数据
  const handleCopyFinance = useCallback(async () => {
    if (!financeData?.length) {
      message.warning('没有数据可复制')
      return
    }

    const title = `${displayStock.name}(${displayStock.symbol}) 财务数据`
    const header = ['报告期', '归母净利润(亿)', '同比(%)', '营业收入(亿)', '同比(%)', '每股收益', 'ROE(%)'].join('\t')
    const rows = financeData.slice().reverse().map(item => [
      item.period,
      item.netProfit?.toFixed(2) || '-',
      item.netProfitYoy?.toFixed(2) || '-',
      item.revenue?.toFixed(2) || '-',
      item.revenueYoy?.toFixed(2) || '-',
      item.eps?.toFixed(3) || '-',
      item.roe?.toFixed(2) || '-',
    ].join('\t'))

    const text = [title, '', header, ...rows].join('\n')
    
    try {
      await navigator.clipboard.writeText(text)
      message.success(`已复制 ${financeData.length} 期财务数据`)
    } catch {
      message.error('复制失败')
    }
  }, [financeData, displayStock])

  // 截图财务数据图表
  const handleScreenshotFinanceChart = useCallback(async () => {
    if (!financeChartCardRef.current) {
      message.warning('没有数据可截图')
      return
    }

    const hide = message.loading('正在生成截图...', 0)
    try {
      const canvas = await html2canvas(financeChartCardRef.current, {
        backgroundColor: '#fff',
        scale: 2,
        useCORS: true,
        logging: false,
      })
      
      const link = document.createElement('a')
      link.download = `${displayStock.name}_财务数据.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      
      hide()
      message.success('截图已保存')
    } catch (error) {
      hide()
      console.error('截图失败:', error)
      message.error('截图失败')
    }
  }, [displayStock])

  // 截图财务报表明细
  const handleScreenshotFinanceTable = useCallback(async () => {
    if (!financeTableCardRef.current) {
      message.warning('没有数据可截图')
      return
    }

    const hide = message.loading('正在生成截图...', 0)
    try {
      const canvas = await html2canvas(financeTableCardRef.current, {
        backgroundColor: '#fff',
        scale: 2,
        useCORS: true,
        logging: false,
      })
      
      const link = document.createElement('a')
      link.download = `${displayStock.name}_财务报表明细.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      
      hide()
      message.success('截图已保存')
    } catch (error) {
      hide()
      console.error('截图失败:', error)
      message.error('截图失败')
    }
  }, [displayStock])

  if (!stock) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <Empty description="请选择一只股票查看详情" />
      </div>
    )
  }

  // K线控制栏
  const klineExtra = (
    <Space size="small">
      {klinePeriod !== 'trend' && (
        <Radio.Group 
          value={showZhixing ? 'zhixing' : 'bbi'} 
          onChange={(e) => handleIndicatorChange(e.target.value)}
          size="small"
        >
          <Radio.Button value="bbi" style={{ padding: '0 8px', fontSize: 12 }}>BBI</Radio.Button>
          <Radio.Button value="zhixing" style={{ padding: '0 8px', fontSize: 12 }}>双线</Radio.Button>
        </Radio.Group>
      )}
      <Radio.Group 
        value={klinePeriod} 
        onChange={(e) => handlePeriodChange(e.target.value)} 
        size="small"
        buttonStyle="solid"
      >
        {KLINE_PERIODS.map(p => (
          <Radio.Button key={p.key} value={p.key} style={{ padding: '0 6px' }}>{p.label}</Radio.Button>
        ))}
      </Radio.Group>
      {klinePeriod !== 'trend' && (
        <>
          <Button
            type="default"
            shape="circle"
            size="small"
            icon={<PlusOutlined />}
            onClick={handleZoomIn}
            disabled={klineRangeIndex === 0}
            title="放大"
          />
          <Button
            type="default"
            shape="circle"
            size="small"
            icon={<MinusOutlined />}
            onClick={handleZoomOut}
            disabled={klineRangeIndex === TIME_RANGES.length - 1}
            title="缩小"
          />
        </>
      )}
    </Space>
  )

  // Tab 1: K线走势 + 指标卡片
  const quoteContent = (
    <div style={{ padding: '12px 16px' }}>
      {/* 基本面数据放在K线上方 */}
      <BasicInfoCard stock={displayStock} />
      
      <Card title="K线走势" size="small" style={{ marginBottom: 12 }} extra={klineExtra}>
        <Spin spinning={klineLoading}>
          {klineData?.values?.length > 0 ? (
            <StockKlineChart 
              data={klineData} 
              stockName={displayStock.name} 
              isMobile={false} 
              dateRange={dateRange}
              market={market}
              showZhixing={showZhixing}
            />
          ) : (
            <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Empty description="暂无K线数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          )}
        </Spin>
      </Card>
      
      <div style={{ 
        display: 'grid', 
<<<<<<< HEAD
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', 
        gap: 8 
      }}>
=======
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
        gap: 12 
      }}>
        <BasicInfoCard stock={displayStock} isMobile={false} />
        <OrderBookCard stock={displayStock} market={market} />
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
        <TechnicalIndicatorsCard klineData={klineData} />
        <MarketPerformanceCard stock={displayStock} />
        <MoneyFlowCard stock={displayStock} />
        <RiskAssessmentCard klineData={klineData} />
        <ValuationCard stock={displayStock} />
      </div>
    </div>
  )

  // Tab 2: 财务数据 + 财务报表明细
  const financeContent = (
    <Spin spinning={financeLoading}>
      <div style={{ padding: '12px 16px' }}>
        <Card 
          ref={financeChartCardRef}
          title="财务数据" 
          size="small" 
          style={{ marginBottom: 12 }}
          extra={
            <Space size="small" wrap>
              <Select value={reportType} onChange={handleReportTypeChange} options={reportTypeOptions} size="small" style={{ width: 80 }} />
              {financeData?.length > 0 && (
                <>
                  <span style={{ fontSize: 11, color: '#999' }}>共{financeData.length}期</span>
                  <Button size="small" icon={<CopyOutlined />} onClick={handleCopyFinance} />
                  <Button size="small" icon={<DownloadOutlined />} onClick={handleExportFinanceExcel} />
                  <Button size="small" icon={<CameraOutlined />} onClick={handleScreenshotFinanceChart} />
                </>
              )}
            </Space>
          }
        >
          <div style={{ marginBottom: 8 }}>
            <Radio.Group value={financeMetric} onChange={(e) => setFinanceMetric(e.target.value)} size="small" buttonStyle="solid">
              {financeMetrics.map(m => (
                <Radio.Button key={m.key} value={m.key} style={{ marginBottom: 4 }}>
                  {m.label}
                  <Tooltip title={<div style={{ whiteSpace: 'pre-line' }}>{m.tip}</div>}>
                    <QuestionCircleOutlined style={{ marginLeft: 4, fontSize: 11, color: '#999' }} />
                  </Tooltip>
                </Radio.Button>
              ))}
            </Radio.Group>
          </div>
          {financeData?.length > 0 ? (
            <FinanceChart data={financeData} metric={financeMetric} isMobile={false} />
          ) : (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Empty description="暂无财务数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          )}
        </Card>

        {financeData?.length > 0 && (
          <Card 
            ref={financeTableCardRef}
            title="财务报表明细" 
            size="small"
            extra={
              <Space size="small">
                <Button size="small" icon={<CopyOutlined />} onClick={handleCopyFinance} />
                <Button size="small" icon={<DownloadOutlined />} onClick={handleExportFinanceExcel} />
                <Button size="small" icon={<CameraOutlined />} onClick={handleScreenshotFinanceTable} />
              </Space>
            }
          >
            <Table
              size="small"
              pagination={{ pageSize: 10, showSizeChanger: false }}
              scroll={{ x: 600 }}
              dataSource={financeData.slice().reverse()}
              rowKey="period"
              columns={financeTableColumns}
            />
          </Card>
        )}
      </div>
    </Spin>
  )

  // Tab 3: 公司公告 + 相关资讯
  const newsContent = (
    <Spin spinning={newsLoading}>
      <div style={{ padding: '12px 16px' }}>
      <AnnouncementTable 
        stockSymbol={displayStock.symbol} 
        market={market} 
        announcements={announcements}
        total={announcementTotal}
        loading={announcementLoading}
        category={announcementCategory}
        onCategoryChange={handleAnnouncementCategoryChange}
        pagination={announcementPagination}
        onPaginationChange={handleAnnouncementPaginationChange}
      />

      <NewsList news={stockNews} />
      </div>
    </Spin>
  )

  const tabItems = [
    { key: 'quote', label: '行情走势', children: quoteContent },
    { key: 'finance', label: '财务数据', children: financeContent },
    { key: 'news', label: '公告资讯', children: newsContent },
  ]
  
  // Tab 栏右侧的额外内容：股票名称 + 自选按钮
  const tabBarExtraContent = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingRight: 16 }}>
      <span style={{ fontSize: 14, fontWeight: 500 }}>
        {displayStock?.name} ({displayStock?.symbol})
      </span>
      <Tooltip title={isWatchlisted ? '从自选中移除' : '添加到自选'}>
        <Button
          type="text"
          size="small"
          icon={isWatchlisted ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
          onClick={handleToggleWatchlist}
          style={{ padding: '0 4px' }}
        />
      </Tooltip>
    </div>
  )

  return (
    <Spin spinning={loading}>
      <Tabs 
        activeKey={activeTab} 
        onChange={handleTabChange} 
        items={tabItems}
        size="small"
        style={{ height: '100%' }}
        tabBarStyle={{ margin: 0, paddingLeft: 16, background: currentTheme.custom.bgColor }}
        tabBarExtraContent={tabBarExtraContent}
      />
    </Spin>
  )
}

export default memo(StockDetail)
