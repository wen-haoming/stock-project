import { useState, useCallback, useMemo } from 'react'
import { Input, Button, Table, Tag, Tooltip, Spin, Empty, Select, Radio, Collapse, Typography, message } from 'antd'
import { SearchOutlined, QuestionCircleOutlined, ThunderboltOutlined, BookOutlined } from '@ant-design/icons'
import { useRequest } from 'ahooks'
import dayjs from 'dayjs'
import { useTheme } from '../../contexts/ThemeContext'

const { Text } = Typography
const upColor = '#ec5a5a'
const downColor = '#47b262'

// 美股期权数据接口
interface USOption {
  symbol: string
  underlyingSymbol: string
  type: 'call' | 'put'
  strikePrice: number
  expiryDate: string
  expiryLabel: string
  lastPrice: number
  change: number
  bid: number
  ask: number
  volume: number
  openInterest: number
  inTheMoney: boolean
  score: number
}

// 到期日选项
interface ExpiryOption {
  label: string
  value: string
}

// 计算期权评分（基于真实数据可用的字段）
const calcOptionScore = (opt: USOption, stockPrice: number): number => {
  let score = 50
  
  // 1. 价内/价外程度（15分）- 接近平值最佳
  const moneyness = Math.abs(opt.strikePrice - stockPrice) / stockPrice
  if (moneyness < 0.03) score += 15  // 3%以内，接近平值
  else if (moneyness < 0.05) score += 12
  else if (moneyness < 0.1) score += 8
  else if (moneyness < 0.15) score += 4
  else if (moneyness > 0.3) score -= 10  // 太深价外/价内
  
  // 2. 买卖价差（15分）- 流动性指标
  const spread = opt.ask - opt.bid
  const spreadPct = opt.lastPrice > 0 ? (spread / opt.lastPrice) * 100 : 100
  if (spreadPct < 3) score += 15
  else if (spreadPct < 5) score += 12
  else if (spreadPct < 10) score += 6
  else if (spreadPct > 20) score -= 10
  
  // 3. 未平仓量（12分）- 市场关注度
  if (opt.openInterest > 10000) score += 12
  else if (opt.openInterest > 5000) score += 9
  else if (opt.openInterest > 1000) score += 5
  else if (opt.openInterest < 100) score -= 8
  
  // 4. 成交量（10分）- 当日活跃度
  if (opt.volume > 5000) score += 10
  else if (opt.volume > 1000) score += 7
  else if (opt.volume > 100) score += 3
  else if (opt.volume < 10) score -= 5
  
  // 5. 到期时间（10分）
  const daysToExpiry = dayjs(opt.expiryDate).diff(dayjs(), 'day')
  if (daysToExpiry >= 30 && daysToExpiry <= 60) score += 10
  else if (daysToExpiry > 60 && daysToExpiry <= 90) score += 7
  else if (daysToExpiry > 14 && daysToExpiry < 30) score += 4
  else if (daysToExpiry < 7) score -= 12
  else if (daysToExpiry < 14) score -= 5
  
  // 6. 价格合理性（8分）- 不是太便宜的"彩票"期权
  if (opt.lastPrice >= 1 && opt.lastPrice <= 20) score += 8
  else if (opt.lastPrice >= 0.5 && opt.lastPrice < 1) score += 4
  else if (opt.lastPrice < 0.1) score -= 8  // 太便宜，可能是垃圾
  
  return Math.max(0, Math.min(100, score))
}

// 美股期权评分说明组件
function USOptionGuide({ isDark }: { isDark: boolean }) {
  const bgColor = isDark ? '#1f1f1f' : '#fafafa'
  return (
    <Collapse 
      size="small" 
      ghost
      items={[{
        key: '1',
        label: <span style={{ fontSize: 12 }}><BookOutlined /> 美股期权入门指南与评分说明</span>,
        children: (
          <div style={{ fontSize: 12, lineHeight: 1.8, background: bgColor, padding: 12, borderRadius: 6 }}>
            <div style={{ marginBottom: 12 }}>
              <Text strong>什么是期权？</Text>
              <p style={{ margin: '4px 0', color: '#888' }}>
                期权是一种合约，给你在未来某个时间以特定价格买卖股票的权利。
                <br/>• <Text type="success">Call（看涨期权）</Text>：认为股价会涨时买入
                <br/>• <Text type="danger">Put（看跌期权）</Text>：认为股价会跌时买入
              </p>
            </div>
            
            <div style={{ marginBottom: 12, padding: 10, background: isDark ? '#2a2a2a' : '#fff7e6', borderRadius: 4, border: '1px solid #faad14' }}>
              <Text strong style={{ color: '#faad14' }}>💡 核心理念：期权买的是波动率，不只是方向！</Text>
              <p style={{ margin: '4px 0', color: '#888' }}>
                很多人以为买Call就是赌股票涨，其实期权价格由两部分组成：
                <br/>• <b>内在价值</b>：股价与行权价的差额
                <br/>• <b>时间价值</b>：由<Text type="warning">隐含波动率(IV)</Text>决定
                <br/><br/>
                <Text type="danger">重要：</Text>即使股票方向对了，如果IV下降（波动率收缩），期权也可能亏钱！
              </p>
            </div>
            
            <div style={{ marginBottom: 12 }}>
              <Text strong>评分指标详解（满分100分）</Text>
              <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: isDark ? '#333' : '#f0f0f0' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #444' }}>指标</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #444' }}>含义</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #444' }}>最佳范围</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #444' }}>权重</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td style={{ padding: '4px 8px' }}>价内/外程度</td><td>行权价与股价的距离</td><td style={{ color: downColor }}>接近平值(&lt;5%)</td><td>15分</td></tr>
                  <tr><td style={{ padding: '4px 8px' }}>买卖价差</td><td>Bid/Ask差距，越小流动性越好</td><td style={{ color: downColor }}>&lt;5%</td><td>15分</td></tr>
                  <tr><td style={{ padding: '4px 8px' }}>未平仓量</td><td>市场持仓量，越高流动性越好</td><td style={{ color: downColor }}>&gt;5000</td><td>12分</td></tr>
                  <tr><td style={{ padding: '4px 8px' }}>成交量</td><td>当日交易量，流动性指标</td><td style={{ color: downColor }}>&gt;1000</td><td>10分</td></tr>
                  <tr><td style={{ padding: '4px 8px' }}>到期时间</td><td>剩余天数，太短时间损耗快</td><td style={{ color: downColor }}>30-60天</td><td>10分</td></tr>
                  <tr><td style={{ padding: '4px 8px' }}>价格合理性</td><td>避免太便宜的"彩票"期权</td><td style={{ color: downColor }}>$1-$20</td><td>8分</td></tr>
                </tbody>
              </table>
            </div>
            
            <div style={{ marginBottom: 12 }}>
              <Text strong>如何买入？</Text>
              <p style={{ margin: '4px 0', color: '#888' }}>
                1. 开通美股期权账户（盈透、老虎、富途等，需申请期权权限）
                <br/>2. 选择标的股票 → 选择到期日 → 选择行权价 → 买入
                <br/>3. 1张期权合约 = 100股正股
                <br/>4. <Text type="warning">注意：美股期权每周五到期，注意时间！</Text>
              </p>
            </div>
            
            <div>
              <Text strong>风险提示</Text>
              <p style={{ margin: '4px 0', color: upColor }}>
                ⚠️ 期权是高风险产品，可能亏损全部本金。建议：
                <br/>• 单笔不超过总资金5%
                <br/>• 永远设止损，亏50%就走
                <br/>• 不要买末日期权（&lt;7天到期）
                <br/>• 财报后IV会大幅下降（IV Crush），慎重持有过财报
              </p>
            </div>
          </div>
        )
      }]}
    />
  )
}

// 解析数字，处理 "--" 等情况
const parseNum = (val: string | null | undefined): number => {
  if (!val || val === '--' || val === '') return 0
  const num = parseFloat(val.replace(/,/g, ''))
  return isNaN(num) ? 0 : num
}

// 解析到期日字符串为标准格式
const parseExpiryDate = (expiryStr: string, year: number): string => {
  // 格式如 "Jan 16" -> "2026-01-16"
  const months: Record<string, string> = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
    'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  }
  const parts = expiryStr.trim().split(' ')
  if (parts.length >= 2) {
    const month = months[parts[0]] || '01'
    const day = parts[1].padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return expiryStr
}

// 美股期权页面
export default function OptionsPage() {
  const { theme: currentTheme, isDark } = useTheme()
  const [searchSymbol, setSearchSymbol] = useState('')
  const [optionType, setOptionType] = useState<'call' | 'put'>('call')
  const [expiryMonth, setExpiryMonth] = useState<string>('')
  
  const { data, loading, run: fetchOptions } = useRequest(
    async (symbol: string) => {
      if (!symbol) return null
      
      // 调用Nasdaq API获取期权数据
      const url = `https://api.nasdaq.com/api/quote/${symbol}/option-chain?assetclass=stocks&limit=200&money=at&type=all${expiryMonth ? `&fromdate=${expiryMonth}` : ''}`
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('获取期权数据失败')
      }
      
      const result = await response.json()
      
      if (!result.data || result.status?.rCode !== 200) {
        throw new Error('未找到该股票的期权数据')
      }
      
      // 解析股票价格
      const lastTradeMatch = result.data.lastTrade?.match(/\$([0-9,.]+)/)
      const stockPrice = lastTradeMatch ? parseFloat(lastTradeMatch[1].replace(/,/g, '')) : 0
      
      // 解析到期日选项
      const expiryOptions: ExpiryOption[] = []
      const filterList = result.data.filterlist?.fromdate?.filter || []
      for (const f of filterList) {
        if (f.value && f.value !== 'all') {
          expiryOptions.push({ label: f.label, value: f.value })
        }
      }
      
      // 解析期权数据
      const options: USOption[] = []
      const rows = result.data.table?.rows || []
      let currentExpiryGroup = ''
      let currentYear = dayjs().year()
      
      for (const row of rows) {
        // 到期日分组行
        if (row.expirygroup && row.expirygroup !== '') {
          currentExpiryGroup = row.expirygroup
          // 从分组名提取年份，如 "January 16, 2026"
          const yearMatch = currentExpiryGroup.match(/(\d{4})/)
          if (yearMatch) {
            currentYear = parseInt(yearMatch[1])
          }
          continue
        }
        
        // 跳过无效行
        if (!row.strike || !row.expiryDate) continue
        
        const strike = parseNum(row.strike)
        const expiryDate = parseExpiryDate(row.expiryDate, currentYear)
        
        // Call期权
        if (row.c_Last !== null || row.c_Bid !== null) {
          const callOpt: USOption = {
            symbol: `${symbol}${expiryDate.replace(/-/g, '')}C${strike}`,
            underlyingSymbol: symbol,
            type: 'call',
            strikePrice: strike,
            expiryDate,
            expiryLabel: row.expiryDate,
            lastPrice: parseNum(row.c_Last),
            change: parseNum(row.c_Change),
            bid: parseNum(row.c_Bid),
            ask: parseNum(row.c_Ask),
            volume: parseNum(row.c_Volume),
            openInterest: parseNum(row.c_Openinterest),
            inTheMoney: row.c_colour === true,
            score: 0
          }
          callOpt.score = calcOptionScore(callOpt, stockPrice)
          options.push(callOpt)
        }
        
        // Put期权
        if (row.p_Last !== null || row.p_Bid !== null) {
          const putOpt: USOption = {
            symbol: `${symbol}${expiryDate.replace(/-/g, '')}P${strike}`,
            underlyingSymbol: symbol,
            type: 'put',
            strikePrice: strike,
            expiryDate,
            expiryLabel: row.expiryDate,
            lastPrice: parseNum(row.p_Last),
            change: parseNum(row.p_Change),
            bid: parseNum(row.p_Bid),
            ask: parseNum(row.p_Ask),
            volume: parseNum(row.p_Volume),
            openInterest: parseNum(row.p_Openinterest),
            inTheMoney: row.p_colour === true,
            score: 0
          }
          putOpt.score = calcOptionScore(putOpt, stockPrice)
          options.push(putOpt)
        }
      }
      
      return { stockPrice, symbol: symbol.toUpperCase(), options, expiryOptions }
    },
    { 
      manual: true,
      onError: (e) => {
        message.error(e.message || '获取数据失败')
      }
    }
  )
  
  const handleSearch = useCallback(() => {
    if (searchSymbol.trim()) {
      fetchOptions(searchSymbol.trim().toUpperCase())
    }
  }, [searchSymbol, fetchOptions])
  
  const columns = useMemo(() => [
    { title: '评分', dataIndex: 'score', width: 50, fixed: 'left' as const, render: (score: number) => <Tag color={score >= 70 ? 'green' : score >= 50 ? 'orange' : 'red'} style={{ margin: 0 }}>{score}</Tag> },
    { title: '行权价', dataIndex: 'strikePrice', width: 75, render: (v: number, r: USOption) => <span style={{ fontSize: 12, fontFamily: 'Consolas', fontWeight: r.inTheMoney ? 600 : 400, color: r.inTheMoney ? downColor : undefined }}>${v.toFixed(2)}</span> },
    { title: '到期日', dataIndex: 'expiryDate', width: 85, render: (v: string, r: USOption) => { const days = dayjs(v).diff(dayjs(), 'day'); return <div style={{ fontSize: 11 }}><div>{r.expiryLabel}</div><div style={{ color: days < 14 ? upColor : currentTheme.custom.textColorSecondary }}>{days}天</div></div> } },
    { title: '最新价', dataIndex: 'lastPrice', width: 65, render: (v: number, r: USOption) => <span style={{ color: r.change >= 0 ? upColor : downColor, fontFamily: 'Consolas', fontSize: 12 }}>${v.toFixed(2)}</span> },
    { title: '涨跌', dataIndex: 'change', width: 60, render: (v: number) => <span style={{ color: v >= 0 ? upColor : downColor, fontSize: 12 }}>{v >= 0 ? '+' : ''}{v.toFixed(2)}</span> },
    { title: '买价', dataIndex: 'bid', width: 60, render: (v: number) => <span style={{ fontSize: 12, fontFamily: 'Consolas' }}>${v.toFixed(2)}</span> },
    { title: '卖价', dataIndex: 'ask', width: 60, render: (v: number) => <span style={{ fontSize: 12, fontFamily: 'Consolas' }}>${v.toFixed(2)}</span> },
    { title: <Tooltip title="买卖价差百分比，越小流动性越好"><span>价差% <QuestionCircleOutlined style={{ fontSize: 10 }} /></span></Tooltip>, dataIndex: 'bid', width: 60, render: (_: number, r: USOption) => { const spread = r.lastPrice > 0 ? ((r.ask - r.bid) / r.lastPrice * 100) : 0; return <span style={{ fontSize: 12, color: spread < 5 ? downColor : spread > 15 ? upColor : undefined }}>{spread.toFixed(1)}%</span> } },
    { title: '成交量', dataIndex: 'volume', width: 70, render: (v: number) => <span style={{ fontSize: 12, color: v > 1000 ? downColor : v < 10 ? upColor : undefined }}>{v.toLocaleString()}</span> },
    { title: <Tooltip title="未平仓合约数，越高流动性越好"><span>未平仓 <QuestionCircleOutlined style={{ fontSize: 10 }} /></span></Tooltip>, dataIndex: 'openInterest', width: 75, render: (v: number) => <span style={{ fontSize: 12, color: v > 5000 ? downColor : v < 100 ? upColor : undefined }}>{v.toLocaleString()}</span> },
  ], [currentTheme])
  
  const filteredOptions = useMemo(() => {
    if (!data?.options) return []
    return data.options
      .filter(o => o.type === optionType)
      .filter(o => o.lastPrice > 0 || o.bid > 0)  // 过滤无效数据
      .sort((a, b) => b.score - a.score)
  }, [data, optionType])
  
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: currentTheme.custom.bgColorSecondary, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input placeholder="输入美股代码，如 AAPL" value={searchSymbol} onChange={e => setSearchSymbol(e.target.value)} onPressEnter={handleSearch} style={{ width: 150 }} size="small" />
          <Radio.Group value={optionType} onChange={e => setOptionType(e.target.value)} size="small">
            <Radio.Button value="call">看涨 Call</Radio.Button>
            <Radio.Button value="put">看跌 Put</Radio.Button>
          </Radio.Group>
          {data?.expiryOptions && data.expiryOptions.length > 0 && (
            <Select 
              placeholder="到期月份" 
              value={expiryMonth || undefined} 
              onChange={(v) => {
                setExpiryMonth(v || '')
                if (searchSymbol) {
                  setTimeout(() => fetchOptions(searchSymbol.trim().toUpperCase()), 100)
                }
              }} 
              allowClear 
              style={{ width: 130 }} 
              size="small" 
              options={data.expiryOptions} 
            />
          )}
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} size="small" loading={loading}>查询</Button>
          {data && <span style={{ fontSize: 12, color: currentTheme.custom.textColorSecondary }}>正股: <span style={{ color: currentTheme.custom.textColor, fontWeight: 500 }}>{data.symbol}</span> 现价: ${data.stockPrice.toFixed(2)}</span>}
        </div>
        <div style={{ fontSize: 11, color: currentTheme.custom.textColorSecondary, marginBottom: 4, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span><ThunderboltOutlined /> 数据来源：Nasdaq | 评分依据：价内外程度、买卖价差、未平仓量、成交量、到期时间</span>
          <span>• 70+ <Tag color="green" style={{ margin: 0, fontSize: 10, padding: '0 4px' }}>推荐</Tag></span>
          <span>• 50-70 <Tag color="orange" style={{ margin: 0, fontSize: 10, padding: '0 4px' }}>一般</Tag></span>
        </div>
        <USOptionGuide isDark={isDark} />
      </div>
      
      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
        <Spin spinning={loading}>
          {filteredOptions.length ? (
            <Table
              dataSource={filteredOptions}
              columns={columns}
              rowKey="symbol"
              size="small"
              pagination={false}
              scroll={{ x: 750, y: 'calc(100vh - 280px)' }}
              sticky
            />
          ) : (
            <Empty description={searchSymbol ? (loading ? "加载中..." : "暂无数据，请尝试其他股票代码") : "请输入美股代码查询（如 AAPL, TSLA, NVDA）"} style={{ marginTop: 60 }} />
          )}
        </Spin>
      </div>
    </div>
  )
}
