import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { Card, Table, Spin, Empty, Radio, Select, Space, Button, message, Tooltip, Tabs } from 'antd'
import { DownloadOutlined, CopyOutlined, CameraOutlined, QuestionCircleOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import { fetchStockKline, fetchStockTrend, fetchStockNews, fetchFinanceData, fetchAnnouncements, fetchStockInfo } from '@/api/stock'
import { reportTypeOptions, financeMetrics, financeTableColumns } from '@/constants/finance'
import { StockKlineChart, FinanceChart, BasicInfoCard, NewsList, AnnouncementTable } from './components'

// K线周期配置，包含默认时间范围索引
const KLINE_PERIODS = [
  { key: 'trend', label: '分时', defaultRangeIndex: -1 },   // 分时图
  { key: 'day', label: '日K', defaultRangeIndex: 4 },      // 默认1年
  { key: 'week', label: '周K', defaultRangeIndex: 5 },     // 默认2年
  { key: 'month', label: '月K', defaultRangeIndex: 6 },    // 默认3年
  { key: 'quarter', label: '季K', defaultRangeIndex: 7 },  // 默认5年
  { key: 'year', label: '年K', defaultRangeIndex: 8 },     // 默认10年
]

// 时间范围配置（月数）
const TIME_RANGES = [
  { months: 1, label: '1月' },
  { months: 3, label: '3月' },
  { months: 6, label: '6月' },
  { months: 12, label: '1年' },
  { months: 24, label: '2年' },
  { months: 36, label: '3年' },
  { months: 60, label: '5年' },
  { months: 120, label: '10年' },
  { months: 240, label: '20年' },
]

/**
 * 股票详情组件
 */
function StockDetail({ stock, market = 'hk', dateRange }) {
  const [activeTab, setActiveTab] = useState('quote')
  const [loading, setLoading] = useState(false)
  const [stockInfo, setStockInfo] = useState(null)  // 股票基础信息
  const [klineData, setKlineData] = useState(null)
  const [klinePeriod, setKlinePeriod] = useState('day')
  const [klineRangeIndex, setKlineRangeIndex] = useState(4) // 默认1年
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
  
  // 记录已加载的 Tab，避免重复加载
  const loadedTabsRef = useRef(new Set())

  const financeChartCardRef = useRef(null)
  const financeTableCardRef = useRef(null)

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

  // 加载数据 - 只加载当前 Tab 需要的核心数据
  const loadData = useCallback(async () => {
    if (!stock) return
    
    setLoading(true)
    // 重置所有状态
    setStockInfo(null)
    setKlineData(null)
    setKlinePeriod('day')
    setKlineRangeIndex(4)
    setFinanceData(null)
    setStockNews([])
    setFinanceMetric('netProfit')
    setReportType('')
    setAnnouncements([])
    setAnnouncementTotal(0)
    setAnnouncementPagination({ current: 1, pageSize: 10 })
    setAnnouncementCategory('0')
    loadedTabsRef.current = new Set(['quote']) // 重置已加载的 Tab

    try {
      // 只加载行情 Tab 需要的数据：股票信息 + K线
      const [info, kline] = await Promise.all([
        fetchStockInfo(stock.symbol, stock.name, market),
        fetchStockKline(stock.symbol, market, 12, 'day'),
      ])
      setStockInfo(info)
      setKlineData(kline)
    } catch (error) {
      console.error('加载数据失败:', error)
    } finally {
      setLoading(false)
    }
  }, [stock, market])

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
          <span style={{ fontSize: 12, color: '#666', minWidth: 32, textAlign: 'center' }}>
            {TIME_RANGES[klineRangeIndex].label}
          </span>
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

  // Tab 1: K线走势 + 行情报价
  const quoteContent = (
    <div style={{ padding: '12px 16px' }}>
      <Card title="K线走势" size="small" style={{ marginBottom: 12 }} extra={klineExtra}>
        <Spin spinning={klineLoading}>
          {klineData?.values?.length > 0 ? (
            <StockKlineChart 
              data={klineData} 
              stockName={displayStock.name} 
              isMobile={false} 
              dateRange={dateRange}
            />
          ) : (
            <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Empty description="暂无K线数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          )}
        </Spin>
      </Card>
      
      <BasicInfoCard stock={displayStock} isMobile={false} />
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

  return (
    <Spin spinning={loading}>
      <Tabs 
        activeKey={activeTab} 
        onChange={handleTabChange} 
        items={tabItems}
        size="small"
        style={{ height: '100%' }}
        tabBarStyle={{ margin: 0, paddingLeft: 16, background: '#fff' }}
      />
    </Spin>
  )
}

export default memo(StockDetail)
