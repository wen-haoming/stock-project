import { memo, useMemo } from 'react'
import { Tooltip, Progress, Tag } from 'antd'
import { QuestionCircleOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import { useTheme } from '../../../contexts/ThemeContext'

/**
 * 股票综合指标面板 - 整合技术指标、市场表现、资金流向、风险评估、估值分析
 */
function StockIndicatorsPanel({ stock, klineData }) {
  const { isDark } = useTheme()

  const textColor = isDark ? '#e0e0e0' : '#333'
  const subTextColor = isDark ? '#999' : '#666'
  const borderColor = isDark ? '#333' : '#e8e8e8'
  const bgColor = isDark ? '#141414' : '#fafafa'

  // 计算技术指标
  const techIndicators = useMemo(() => {
    if (!klineData?.values?.length) return null
    
    const values = klineData.values
    const closes = values.map(v => v[1])
    const len = closes.length

    // RSI(14)
    let rsi = null
    if (len >= 15) {
      let gains = 0, losses = 0
      for (let i = len - 14; i < len; i++) {
        const change = closes[i] - closes[i - 1]
        if (change > 0) gains += change
        else losses -= change
      }
      const avgGain = gains / 14
      const avgLoss = losses / 14
      rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss))
    }

    // MACD柱
    let histogram = null
    if (len >= 35) {
      const calcEMA = (data, period) => {
        const k = 2 / (period + 1)
        const ema = [data[0]]
        for (let i = 1; i < data.length; i++) {
          ema.push(data[i] * k + ema[i - 1] * (1 - k))
        }
        return ema
      }
      const ema12 = calcEMA(closes, 12)
      const ema26 = calcEMA(closes, 26)
      const dif = ema12[len - 1] - ema26[len - 1]
      const difArr = ema12.map((v, i) => v - ema26[i]).slice(26)
      const dea = calcEMA(difArr, 9)
      histogram = (dif - dea[dea.length - 1]) * 2
    }

    // 布林带位置
    let bollingerPos = null
    if (len >= 20) {
      const recent20 = closes.slice(-20)
      const ma20 = recent20.reduce((a, b) => a + b, 0) / 20
      const std = Math.sqrt(recent20.reduce((sum, v) => sum + Math.pow(v - ma20, 2), 0) / 20)
      const upper = ma20 + 2 * std
      const lower = ma20 - 2 * std
      bollingerPos = std === 0 ? 50 : ((closes[len - 1] - lower) / (upper - lower)) * 100
    }

    // 量比
    let volumeRatio = null
    const volumes = klineData.volumes
    if (volumes?.length >= 6) {
      const avgVol5 = volumes.slice(-6, -1).reduce((a, b) => a + (b?.[1] || 0), 0) / 5
      const lastVol = volumes[volumes.length - 1]?.[1] || 0
      volumeRatio = avgVol5 === 0 ? 0 : lastVol / avgVol5
    }

    return { rsi, histogram, bollingerPos, volumeRatio }
  }, [klineData])

  // 计算风险指标
  const riskMetrics = useMemo(() => {
    if (!klineData?.values?.length || klineData.values.length < 20) return null
    
    const closes = klineData.values.map(v => v[1])
    const len = closes.length
    const returns = []
    for (let i = 1; i < len; i++) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1])
    }

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100

    let maxDrawdown = 0
    let peak = closes[0]
    for (let i = 1; i < len; i++) {
      if (closes[i] > peak) peak = closes[i]
      const drawdown = (peak - closes[i]) / peak
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
    }

    return { volatility, maxDrawdown: maxDrawdown * 100 }
  }, [klineData])

  // 模拟市场表现数据
  const performance = useMemo(() => ({
    day1: stock?.changePercent || (Math.random() - 0.5) * 5,
    day5: (Math.random() - 0.5) * 10,
    day20: (Math.random() - 0.5) * 20,
    day60: (Math.random() - 0.5) * 30,
    relativeIndex: (Math.random() - 0.5) * 5,
    industryRank: Math.floor(Math.random() * 50) + 1,
  }), [stock])

  // 模拟资金流向数据
  const moneyFlow = useMemo(() => ({
    main: (Math.random() - 0.5) * 2,
    big: (Math.random() - 0.5) * 1.5,
    medium: (Math.random() - 0.5) * 0.8,
    small: (Math.random() - 0.5) * 0.5,
    northbound: (Math.random() - 0.5) * 0.3,
    institutionHold: (Math.random() * 30 + 10).toFixed(1),
  }), [])

  // 模拟估值数据
  const valuation = useMemo(() => ({
    pe: stock?.peRatio || (Math.random() * 30 + 5).toFixed(2),
    pePercentile: Math.random() * 100,
    pb: stock?.pbRatio || (Math.random() * 5 + 0.5).toFixed(2),
    pbPercentile: Math.random() * 100,
    ps: (Math.random() * 10 + 1).toFixed(2),
    psPercentile: Math.random() * 100,
  }), [stock])

  // 格式化涨跌幅
  const formatPct = (val, showIcon = true) => {
    if (val == null) return '-'
    const color = val > 0 ? '#f5222d' : val < 0 ? '#52c41a' : textColor
    return (
      <span style={{ color, fontWeight: 500, fontSize: 12 }}>
        {showIcon && val !== 0 && (val > 0 ? <ArrowUpOutlined style={{ fontSize: 10 }} /> : <ArrowDownOutlined style={{ fontSize: 10 }} />)}
        {val > 0 ? '+' : ''}{val.toFixed(2)}%
      </span>
    )
  }

  // 格式化资金
  const formatMoney = (val) => {
    const color = val > 0 ? '#f5222d' : val < 0 ? '#52c41a' : textColor
    return <span style={{ color, fontWeight: 500, fontSize: 12 }}>{val > 0 ? '+' : ''}{val.toFixed(2)}亿</span>
  }

  // 获取状态标签
  const getStatusTag = (type, value) => {
    let text, color
    if (type === 'rsi') {
      if (value >= 70) { text = '超买'; color = '#f5222d' }
      else if (value <= 30) { text = '超卖'; color = '#52c41a' }
      else { text = '中性'; color = '#faad14' }
    } else if (type === 'macd') {
      if (value > 0.02) { text = '多头'; color = '#f5222d' }
      else if (value < -0.02) { text = '空头'; color = '#52c41a' }
      else { text = '震荡'; color = '#faad14' }
    } else if (type === 'percentile') {
      if (value > 80) { text = '偏高'; color = '#f5222d' }
      else if (value > 60) { text = '中高'; color = '#faad14' }
      else if (value > 40) { text = '适中'; color = '#1890ff' }
      else { text = '偏低'; color = '#52c41a' }
    }
    return text ? <Tag color={color} style={{ fontSize: 10, lineHeight: '14px', padding: '0 4px', margin: 0 }}>{text}</Tag> : null
  }

  // 单行指标项
  const IndicatorRow = ({ label, value, extra, tip, progress, progressColor }) => (
    <div style={{ display: 'flex', alignItems: 'center', padding: '4px 0', borderBottom: `1px solid ${borderColor}` }}>
      <span style={{ color: subTextColor, fontSize: 11, width: 70, flexShrink: 0 }}>
        {label}
        {tip && <Tooltip title={tip}><QuestionCircleOutlined style={{ marginLeft: 2, fontSize: 9, color: isDark ? '#555' : '#bbb' }} /></Tooltip>}
      </span>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
        {progress !== undefined && (
          <Progress 
            percent={Math.min(100, Math.max(0, progress))} 
            showInfo={false} 
            size="small" 
            style={{ flex: 1, maxWidth: 60 }}
            strokeColor={progressColor || '#1890ff'}
            trailColor={borderColor}
          />
        )}
        <span style={{ color: textColor, fontWeight: 500, fontSize: 12, minWidth: 50, textAlign: 'right' }}>{value}</span>
        {extra}
      </div>
    </div>
  )

  // 风险等级
  const riskLevel = riskMetrics ? (
    riskMetrics.volatility > 40 || riskMetrics.maxDrawdown > 30 ? { text: '高', color: '#f5222d' } :
    riskMetrics.volatility > 25 || riskMetrics.maxDrawdown > 20 ? { text: '中', color: '#faad14' } :
    { text: '低', color: '#52c41a' }
  ) : null

  return (
    <div style={{ background: bgColor, borderRadius: 6, padding: 12, marginTop: 12 }}>
      {/* 三列布局 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {/* 第一列：技术指标 + 风险评估 */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: textColor, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            技术指标
          </div>
          <IndicatorRow 
            label="RSI(14)" 
            value={techIndicators?.rsi?.toFixed(1) || '-'} 
            extra={techIndicators?.rsi != null && getStatusTag('rsi', techIndicators.rsi)}
            tip="相对强弱指数，>70超买，<30超卖"
            progress={techIndicators?.rsi}
            progressColor={techIndicators?.rsi >= 70 ? '#f5222d' : techIndicators?.rsi <= 30 ? '#52c41a' : '#faad14'}
          />
          <IndicatorRow 
            label="MACD柱" 
            value={techIndicators?.histogram?.toFixed(3) || '-'} 
            extra={techIndicators?.histogram != null && getStatusTag('macd', techIndicators.histogram)}
            tip="MACD柱状图，正值多头，负值空头"
          />
          <IndicatorRow 
            label="布林位置" 
            value={techIndicators?.bollingerPos != null ? `${techIndicators.bollingerPos.toFixed(0)}%` : '-'} 
            tip="当前价格在布林带中的位置"
            progress={techIndicators?.bollingerPos}
          />
          <IndicatorRow 
            label="量比" 
            value={techIndicators?.volumeRatio?.toFixed(2) || '-'} 
            tip="当日成交量与5日均量的比值"
          />
          
          <div style={{ fontSize: 12, fontWeight: 600, color: textColor, marginTop: 12, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            风险评估
            {riskLevel && <Tag color={riskLevel.color} style={{ fontSize: 10, lineHeight: '14px', padding: '0 4px', margin: 0 }}>{riskLevel.text}风险</Tag>}
          </div>
          <IndicatorRow 
            label="年化波动" 
            value={riskMetrics?.volatility != null ? `${riskMetrics.volatility.toFixed(1)}%` : '-'} 
            tip="衡量股价波动程度"
            progress={riskMetrics?.volatility}
            progressColor={riskMetrics?.volatility > 40 ? '#f5222d' : riskMetrics?.volatility > 25 ? '#faad14' : '#52c41a'}
          />
          <IndicatorRow 
            label="最大回撤" 
            value={riskMetrics?.maxDrawdown != null ? `${riskMetrics.maxDrawdown.toFixed(1)}%` : '-'} 
            tip="历史最大跌幅"
            progress={riskMetrics?.maxDrawdown}
            progressColor={riskMetrics?.maxDrawdown > 30 ? '#f5222d' : riskMetrics?.maxDrawdown > 20 ? '#faad14' : '#52c41a'}
          />
        </div>

        {/* 第二列：市场表现 + 资金流向 */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: textColor, marginBottom: 6 }}>市场表现</div>
          <IndicatorRow label="今日涨跌" value={formatPct(performance.day1)} />
          <IndicatorRow label="5日涨跌" value={formatPct(performance.day5)} tip="近5个交易日累计涨跌幅" />
          <IndicatorRow label="20日涨跌" value={formatPct(performance.day20)} tip="近20个交易日累计涨跌幅" />
          <IndicatorRow label="60日涨跌" value={formatPct(performance.day60)} tip="近60个交易日累计涨跌幅" />
          <IndicatorRow label="相对大盘" value={formatPct(performance.relativeIndex)} tip="相对于大盘指数的超额收益" />
          <IndicatorRow label="行业排名" value={<span style={{ color: textColor, fontWeight: 500, fontSize: 12 }}>{performance.industryRank}/80</span>} tip="在所属行业中的涨跌幅排名" />
        </div>

        {/* 第三列：资金流向 + 估值分析 */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: textColor, marginBottom: 6 }}>资金流向</div>
          <IndicatorRow label="主力净流入" value={formatMoney(moneyFlow.main)} tip="超大单+大单净买入金额" />
          <IndicatorRow label="大单净流入" value={formatMoney(moneyFlow.big)} tip="50-100万元订单净买入" />
          <IndicatorRow label="中单净流入" value={formatMoney(moneyFlow.medium)} tip="10-50万元订单净买入" />
          <IndicatorRow label="北向资金" value={formatMoney(moneyFlow.northbound)} tip="沪深港通北向资金净买入" />
          <IndicatorRow label="机构持仓" value={<span style={{ color: textColor, fontWeight: 500, fontSize: 12 }}>{moneyFlow.institutionHold}%</span>} tip="机构投资者持股比例" />
          
          <div style={{ fontSize: 12, fontWeight: 600, color: textColor, marginTop: 12, marginBottom: 6 }}>估值分析</div>
          <IndicatorRow 
            label="市盈率PE" 
            value={valuation.pe} 
            extra={getStatusTag('percentile', valuation.pePercentile)}
            tip="股价/每股收益"
          />
          <IndicatorRow 
            label="市净率PB" 
            value={valuation.pb} 
            extra={getStatusTag('percentile', valuation.pbPercentile)}
            tip="股价/每股净资产"
          />
          <IndicatorRow 
            label="市销率PS" 
            value={valuation.ps} 
            extra={getStatusTag('percentile', valuation.psPercentile)}
            tip="股价/每股销售额"
          />
        </div>
      </div>
    </div>
  )
}

export default memo(StockIndicatorsPanel)
