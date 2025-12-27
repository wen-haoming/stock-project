import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { Card, Table, Spin, Empty, Radio, Select, Space, Button, message, Tooltip, Grid } from 'antd'
import { DownloadOutlined, CopyOutlined, CameraOutlined, QuestionCircleOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import { fetchStockKline, fetchStockTrend, fetchStockNews, fetchFinanceData, fetchAnnouncements } from '@/api/stock'
import { reportTypeOptions, financeMetrics, financeTableColumns } from '@/constants/finance'
import { StockKlineChart, FinanceChart, BasicInfoCard, NewsList, AnnouncementTable } from './components'

const { useBreakpoint } = Grid

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
  const screens = useBreakpoint()
  const isMobile = !screens.md

  const [loading, setLoading] = useState(false)
  const [klineData, setKlineData] = useState(null)
  const [klinePeriod, setKlinePeriod] = useState('day')
  const [klineRangeIndex, setKlineRangeIndex] = useState(4) // 默认1年
  const [klineLoading, setKlineLoading] = useState(false)
  const [financeData, setFinanceData] = useState(null)
  const [financeMetric, setFinanceMetric] = useState('netProfit')
  const [stockNews, setStockNews] = useState([])
  const [reportType, setReportType] = useState('')
  const [announcements, setAnnouncements] = useState([])
  const [announcementTotal, setAnnouncementTotal] = useState(0)
  const [announcementPagination, setAnnouncementPagination] = useState({ current: 1, pageSize: 10 })
  const [announcementLoading, setAnnouncementLoading] = useState(false)
  const [announcementCategory, setAnnouncementCategory] = useState('0')

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
    const finance = await fetchFinanceData(symbol, type, market)
    setFinanceData(finance)
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

  // 加载数据
  const loadData = useCallback(async () => {
    if (!stock) return
    
    setLoading(true)
    setKlineData(null)
    setKlinePeriod('day')
    setKlineRangeIndex(4) // 默认1年
    setFinanceData(null)
    setStockNews([])
    setFinanceMetric('netProfit')
    setReportType('')
    setAnnouncements([])
    setAnnouncementTotal(0)
    setAnnouncementPagination({ current: 1, pageSize: 10 })
    setAnnouncementCategory('0')

    try {
      const promises = [
        fetchStockKline(stock.symbol, market, 12, 'day'),  // 默认加载1年日K
        fetchStockNews(stock.name),
        fetchFinanceData(stock.symbol, '', market),
      ]
      
      if (market === 'a') {
        promises.push(fetchAnnouncements(stock.symbol, 1, 10, '0'))
      }
      
      const results = await Promise.all(promises)
      setKlineData(results[0])
      setStockNews(results[1])
      setFinanceData(results[2])
      
      if (market === 'a' && results[3]) {
        setAnnouncements(results[3].list)
        setAnnouncementTotal(results[3].total)
      }
    } catch (error) {
      console.error('加载数据失败:', error)
    } finally {
      setLoading(false)
    }
  }, [stock, market])

  useEffect(() => {
    if (stock) {
      loadData()
    }
  }, [stock, loadData])

  // 导出财务数据 Excel
  const handleExportFinanceExcel = useCallback(() => {
    if (!financeData?.length) {
      message.warning('没有数据可导出')
      return
    }

    const title = `${stock.name}(${stock.symbol}) 财务数据`
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
    XLSX.writeFile(wb, `${stock.name}_财务数据.xlsx`)
    message.success('导出成功')
  }, [financeData, stock])

  // 复制财务数据
  const handleCopyFinance = useCallback(async () => {
    if (!financeData?.length) {
      message.warning('没有数据可复制')
      return
    }

    const title = `${stock.name}(${stock.symbol}) 财务数据`
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
  }, [financeData, stock])

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
      link.download = `${stock.name}_财务数据.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      
      hide()
      message.success('截图已保存')
    } catch (error) {
      hide()
      console.error('截图失败:', error)
      message.error('截图失败')
    }
  }, [stock])

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
      link.download = `${stock.name}_财务报表明细.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      
      hide()
      message.success('截图已保存')
    } catch (error) {
      hide()
      console.error('截图失败:', error)
      message.error('截图失败')
    }
  }, [stock])

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

  // 移动端单列布局
  if (isMobile) {
    return (
      <Spin spinning={loading}>
        <div style={{ padding: 12 }}>
          <BasicInfoCard stock={stock} isMobile={isMobile} />
          
          <Card title="K线走势" size="small" style={{ marginBottom: 12 }} extra={klineExtra}>
            <Spin spinning={klineLoading}>
              {klineData?.values?.length > 0 ? (
                <StockKlineChart 
                  data={klineData} 
                  stockName={stock.name} 
                  isMobile={isMobile} 
                  dateRange={dateRange}
                />
              ) : (
                <div style={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Empty description="暂无K线数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
              )}
            </Spin>
          </Card>

          <AnnouncementTable 
            stockSymbol={stock.symbol} 
            market={market} 
            announcements={announcements}
            total={announcementTotal}
            loading={announcementLoading}
            category={announcementCategory}
            onCategoryChange={handleAnnouncementCategoryChange}
            pagination={announcementPagination}
            onPaginationChange={handleAnnouncementPaginationChange}
          />

          <Card 
            ref={financeChartCardRef}
            title="财务数据" 
            size="small" 
            style={{ marginBottom: 12 }}
            extra={
              <Space size="small" wrap>
                <Select value={reportType} onChange={handleReportTypeChange} options={reportTypeOptions} size="small" style={{ width: 80 }} />
              </Space>
            }
          >
            <div style={{ marginBottom: 8 }}>
              <Radio.Group value={financeMetric} onChange={(e) => setFinanceMetric(e.target.value)} size="small" buttonStyle="solid">
                {financeMetrics.slice(0, 4).map(m => (
                  <Radio.Button key={m.key} value={m.key} style={{ marginBottom: 4, fontSize: 12 }}>{m.label}</Radio.Button>
                ))}
              </Radio.Group>
            </div>
            {financeData?.length > 0 ? (
              <FinanceChart data={financeData} metric={financeMetric} isMobile={isMobile} />
            ) : (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty description="暂无财务数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            )}
          </Card>

          {financeData?.length > 0 && (
            <Card ref={financeTableCardRef} title="财务报表明细" size="small" style={{ marginBottom: 12 }}>
              <Table size="small" pagination={{ pageSize: 5 }} scroll={{ x: 600 }} dataSource={financeData.slice().reverse()} rowKey="period" columns={financeTableColumns} />
            </Card>
          )}

          <NewsList news={stockNews} />
        </div>
      </Spin>
    )
  }

  // 桌面端左右布局
  return (
    <Spin spinning={loading}>
      <div style={{ padding: 16, display: 'flex', gap: 16, minHeight: 'calc(100vh - 55px)' }}>
        {/* 左侧 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <BasicInfoCard stock={stock} isMobile={isMobile} />
          
          <Card title="K线走势" size="small" style={{ marginBottom: 12 }} extra={klineExtra}>
            <Spin spinning={klineLoading}>
              {klineData?.values?.length > 0 ? (
                <StockKlineChart 
                  data={klineData} 
                  stockName={stock.name} 
                  isMobile={isMobile} 
                  dateRange={dateRange}
                />
              ) : (
                <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Empty description="暂无K线数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
              )}
            </Spin>
          </Card>

          <AnnouncementTable 
            stockSymbol={stock.symbol} 
            market={market} 
            announcements={announcements}
            total={announcementTotal}
            loading={announcementLoading}
            category={announcementCategory}
            onCategoryChange={handleAnnouncementCategoryChange}
            pagination={announcementPagination}
            onPaginationChange={handleAnnouncementPaginationChange}
          />
        </div>

        {/* 右侧 */}
        <div style={{ flex: 1, minWidth: 0 }}>
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
              <FinanceChart data={financeData} metric={financeMetric} isMobile={isMobile} />
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
              style={{ marginBottom: 12 }}
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
                pagination={{ pageSize: 8, showSizeChanger: false }}
                scroll={{ x: 600 }}
                dataSource={financeData.slice().reverse()}
                rowKey="period"
                columns={financeTableColumns}
              />
            </Card>
          )}

          <NewsList news={stockNews} />
        </div>
      </div>
    </Spin>
  )
}

export default memo(StockDetail)
