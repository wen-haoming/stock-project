import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, Tag, SpinLoading, Selector, Toast, Button } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import dayjs from 'dayjs'
import Canvas from '@antv/f2-react'
import { Chart, Line, Axis, Tooltip, Legend } from '@antv/f2'

// 指数配置
const indexConfigs = {
  hsi: { secid: '100.HSI', name: '恒生指数', color: '#1890ff' },
  sh: { secid: '1.000001', name: '上证指数', color: '#52c41a' },
}

// 汇率配置
const exchangeRateConfig = {
  usdcny: { secid: '133.USDCNH', name: 'USD/CNH', color: '#ff4d4f' },
}

// 日期预设
const datePresets = [
  { label: '1月', value: 30 },
  { label: '3月', value: 90 },
  { label: '半年', value: 180 },
  { label: '1年', value: 365 },
  { label: '2年', value: 730 },
  { label: '5年', value: 1825 },
]

// 涨幅预设
const changePctOptions = [
  { label: '≥30%', value: 30 },
  { label: '≥50%', value: 50 },
  { label: '≥80%', value: 80 },
  { label: '≥100%', value: 100 },
]

// 市值预设
const marketCapOptions = [
  { label: '不限', value: '0-0' },
  { label: '20-100亿', value: '20-100' },
  { label: '20-500亿', value: '20-500' },
  { label: '100亿+', value: '100-0' },
]

// 市场选项
const marketOptions = [
  { label: '港股', value: 'hk' },
  { label: 'A股', value: 'a' },
]

export default function IndexMobile() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [tableLoading, setTableLoading] = useState(false)
  
  // 日期范围（默认5年）
  const [datePreset, setDatePreset] = useState([1825])
  const dateRange = useMemo(() => [
    dayjs().subtract(datePreset[0] || 1825, 'day'),
    dayjs().subtract(1, 'day')
  ], [datePreset])

  // 筛选条件
  const [minChangePct, setMinChangePct] = useState([50])
  const [marketCapStr, setMarketCapStr] = useState(['20-500'])
  const [market, setMarket] = useState(['hk'])

  const marketCapRange = useMemo(() => {
    const [min, max] = (marketCapStr[0] || '20-500').split('-').map(Number)
    return { min, max }
  }, [marketCapStr])

  // 图表数据（归一化后）
  const [chartData, setChartData] = useState([])
  const [hsiChange, setHsiChange] = useState(null)
  const [shChange, setShChange] = useState(null)
  const [exchangeChange, setExchangeChange] = useState(null)

  // 股票数据
  const [stockData, setStockData] = useState([])
  const [industryStats, setIndustryStats] = useState([])
  const [selectedIndustry, setSelectedIndustry] = useState('')

  // 获取K线数据
  const fetchKlineData = useCallback(async (secid, startDate, endDate) => {
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&ut=7eea3edcaed734bea9cbfc24409ed989&klt=101&fqt=1&secid=${secid}&beg=${startDate}&end=${endDate}`
    const response = await axios.get(url)
    const klines = response.data?.data?.klines || []
    return klines.map(item => {
      const fields = item.split(',')
      return {
        date: fields[0],
        close: parseFloat(fields[2])
      }
    })
  }, [])

  // 计算涨跌幅
  const calculateChange = useCallback((data) => {
    if (!data || data.length < 2) return null
    const startValue = data[0].close
    const endValue = data[data.length - 1].close
    return ((endValue - startValue) / startValue * 100).toFixed(2)
  }, [])

  // 加载图表数据
  const loadChartData = useCallback(async () => {
    setLoading(true)
    const startDate = dateRange[0].format('YYYYMMDD')
    const endDate = dateRange[1].format('YYYYMMDD')

    try {
      const [hsiRaw, shRaw, exchangeRaw] = await Promise.all([
        fetchKlineData(indexConfigs.hsi.secid, startDate, endDate),
        fetchKlineData(indexConfigs.sh.secid, startDate, endDate),
        fetchKlineData(exchangeRateConfig.usdcny.secid, startDate, endDate),
      ])

      // 计算涨跌幅
      setHsiChange(calculateChange(hsiRaw))
      setShChange(calculateChange(shRaw))
      setExchangeChange(calculateChange(exchangeRaw))

      // 归一化处理（以起始值为100）
      const normalizeData = (data, name) => {
        if (!data.length) return []
        const startValue = data[0].close
        return data.map(d => ({
          date: d.date,
          value: (d.close / startValue) * 100,
          name
        }))
      }

      // 合并数据
      const allData = [
        ...normalizeData(exchangeRaw, exchangeRateConfig.usdcny.name),
        ...normalizeData(hsiRaw, indexConfigs.hsi.name),
        ...normalizeData(shRaw, indexConfigs.sh.name)
      ]

      setChartData(allData)

    } catch (error) {
      console.error('获取图表数据失败:', error)
    } finally {
      setLoading(false)
    }
  }, [dateRange, fetchKlineData, calculateChange])

  // 加载股票数据
  const loadStockData = useCallback(async (industry = '') => {
    setTableLoading(true)
    try {
      const params = {
        start_date: dateRange[0].format('YYYYMMDD'),
        end_date: dateRange[1].format('YYYYMMDD'),
        min_change_pct: minChangePct[0] || 50,
        min_market_cap: marketCapRange.min,
        max_market_cap: marketCapRange.max,
        market: market[0] || 'hk',
      }
      if (industry) params.industry = industry

      const response = await axios.get('/api/v1/stock/range', { params, timeout: 120000 })
      const result = response.data

      if (result.data) {
        setStockData(result.data)
        if (!industry) setIndustryStats(result.industryStats || [])
      }
    } catch (error) {
      console.error('获取股票数据失败:', error)
      Toast.show({ content: '获取数据失败' })
    } finally {
      setTableLoading(false)
    }
  }, [dateRange, minChangePct, marketCapRange, market])

  // 初始加载
  useEffect(() => {
    loadChartData()
  }, [loadChartData])

  // 查询
  const handleSearch = useCallback(() => {
    setSelectedIndustry('')
    loadStockData()
  }, [loadStockData])

  // 行业筛选
  const handleIndustryClick = useCallback((industry) => {
    if (selectedIndustry === industry) {
      setSelectedIndustry('')
      loadStockData()
    } else {
      setSelectedIndustry(industry)
      loadStockData(industry)
    }
  }, [selectedIndustry, loadStockData])

  // 跳转详情
  const goToDetail = useCallback((stock) => {
    navigate(`/stock/${stock.symbol}?market=${market[0] || 'hk'}&start=${dateRange[0].format('YYYY-MM-DD')}&end=${dateRange[1].format('YYYY-MM-DD')}`)
  }, [navigate, market, dateRange])

  // 渲染涨跌幅
  const renderChange = (label, change) => {
    if (change === null) return null
    const isUp = parseFloat(change) >= 0
    return (
      <span style={{ fontSize: 11, color: isUp ? '#ec5a5a' : '#47b262', marginLeft: 4 }}>
        {label}: {isUp ? '+' : ''}{change}%
      </span>
    )
  }

  return (
    <div style={{ padding: 8, background: '#f5f5f5', minHeight: '100vh' }}>
      {/* 图表区域 */}
      <Card style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontWeight: 'bold', fontSize: 14 }}>市场概览</span>
        </div>
        <Selector
          options={datePresets}
          value={datePreset}
          onChange={setDatePreset}
          style={{ '--border-radius': '4px', '--padding': '4px 8px', fontSize: 11, marginBottom: 8 }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {renderChange('USD/CNH', exchangeChange)}
          {renderChange('恒指', hsiChange)}
          {renderChange('上证', shChange)}
        </div>
        <div style={{ height: 220, position: 'relative' }}>
          {loading && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.8)', zIndex: 10 }}>
              <SpinLoading />
            </div>
          )}
          {chartData.length > 0 && (
            <Canvas pixelRatio={window.devicePixelRatio}>
              <Chart data={chartData}>
                <Axis field="date" tickCount={4} style={{ label: { fontSize: 10 } }} />
                <Axis field="value" tickCount={5} style={{ label: { fontSize: 10 } }} />
                <Line x="date" y="value" color="name" />
                <Legend position="top" style={{ fontSize: 10 }} />
                <Tooltip showCrosshairs />
              </Chart>
            </Canvas>
          )}
        </div>
      </Card>

      {/* 筛选条件 */}
      <Card style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>市场</div>
            <Selector options={marketOptions} value={market} onChange={setMarket} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>涨幅</div>
            <Selector options={changePctOptions} value={minChangePct} onChange={setMinChangePct} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>市值</div>
            <Selector options={marketCapOptions} value={marketCapStr} onChange={setMarketCapStr} />
          </div>
          <Button color="primary" size="small" onClick={handleSearch} loading={tableLoading}>
            查询
          </Button>
        </div>
      </Card>

      {/* 行业分布 */}
      {industryStats.length > 0 && (
        <Card style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 8 }}>行业分布</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {industryStats.map((item) => (
              <Tag
                key={item.name}
                color={selectedIndustry === item.name ? 'danger' : 'primary'}
                fill={selectedIndustry === item.name ? 'solid' : 'outline'}
                style={{ fontSize: 10, padding: '2px 6px' }}
                onClick={() => handleIndustryClick(item.name)}
              >
                {item.name}: {item.count}
              </Tag>
            ))}
          </div>
        </Card>
      )}

      {/* 股票列表 */}
      <Card>
        <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 8 }}>
          涨幅榜 {stockData.length > 0 && <span style={{ color: '#1890ff', fontWeight: 'normal' }}>共{stockData.length}只</span>}
        </div>
        {tableLoading ? (
          <div style={{ textAlign: 'center', padding: 20 }}><SpinLoading /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stockData.slice(0, 50).map((stock, index) => (
              <div
                key={stock.symbol}
                onClick={() => goToDetail(stock)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid #f0f0f0',
                  cursor: 'pointer'
                }}
              >
                <span style={{
                  width: 24,
                  height: 24,
                  borderRadius: 4,
                  background: index < 3 ? '#ff4d4f' : index < 10 ? '#faad14' : '#d9d9d9',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  marginRight: 8
                }}>
                  {index + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{stock.name}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>{stock.symbol}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: 14,
                    fontWeight: 'bold',
                    color: stock.changePct >= 0 ? '#ec5a5a' : '#47b262'
                  }}>
                    {stock.changePct >= 0 ? '+' : ''}{stock.changePct?.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 11, color: '#999' }}>
                    {stock.totalMarketCap ? (stock.totalMarketCap / 100000000).toFixed(0) + '亿' : '-'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
