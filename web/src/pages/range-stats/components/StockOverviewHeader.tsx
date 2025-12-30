import { memo, useMemo } from 'react'
import { Tag, Tooltip } from 'antd'
import { 
  ThunderboltOutlined,
  SafetyOutlined,
  LineChartOutlined,
  DollarOutlined
} from '@ant-design/icons'
import { useTheme } from '../../../contexts/ThemeContext'

/**
 * 股票概览头部 - 紧凑单行布局
 * 价格和涨跌幅已移至Drawer title
 */
function StockOverviewHeader({ stock, klineData }) {
  const { isDark } = useTheme()

  // 颜色系统
  const colors = {
    up: '#f5222d',
    down: '#52c41a',
    neutral: isDark ? '#888' : '#666',
    text: isDark ? '#e0e0e0' : '#333',
    subText: isDark ? '#888' : '#999',
    border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
  }

  // 计算综合诊断
  const diagnosis = useMemo(() => {
    if (!klineData?.values?.length) return null
    
    const values = klineData.values
    const closes = values.map(v => v[1])
    const len = closes.length
    
    // RSI
    let rsi = 50
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
    let histogram = 0
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

    // 波动率
    let volatility = 20
    if (len >= 20) {
      const returns = []
      for (let i = 1; i < len; i++) {
        returns.push((closes[i] - closes[i - 1]) / closes[i - 1])
      }
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
      volatility = Math.sqrt(variance) * Math.sqrt(252) * 100
    }

    // 趋势判断
    let trendLabel = '震荡'
    let trendColor = colors.neutral
    
    if (rsi > 60 && histogram > 0) {
      trendLabel = rsi > 70 ? '强势' : '偏多'
      trendColor = colors.up
    } else if (rsi < 40 && histogram < 0) {
      trendLabel = rsi < 30 ? '弱势' : '偏空'
      trendColor = colors.down
    }

    // 风险等级
    let riskLevel = '中'
    if (volatility > 40) {
      riskLevel = '高'
    } else if (volatility < 20) {
      riskLevel = '低'
    }

    return {
      rsi: rsi.toFixed(1),
      macd: histogram > 0 ? '多头' : histogram < 0 ? '空头' : '震荡',
      trendLabel,
      trendColor,
      volatility: volatility.toFixed(1),
      riskLevel,
    }
  }, [klineData, colors])

  // 格式化数字
  const formatNumber = (num, precision = 2) => {
    if (num == null || isNaN(num)) return '-'
    if (Math.abs(num) >= 100000000) return (num / 100000000).toFixed(precision) + '亿'
    if (Math.abs(num) >= 10000) return (num / 10000).toFixed(precision) + '万'
    return num.toFixed(precision)
  }

  // 模拟资金流向
  const mainFlow = useMemo(() => (Math.random() - 0.5) * 2, [])

  if (!stock) return null

  return (
    <div style={{ 
      background: isDark ? '#1a1a1a' : '#fff',
      borderRadius: 4,
      padding: '8px 12px',
      marginBottom: 8,
      border: `1px solid ${colors.border}`,
    }}>
      {/* 单行紧凑布局：行情指标 | 四大信号 | 基本面 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* 行情指标：今开/最高/最低/成交额/换手 */}
        <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
          {[
            { label: '今开', value: stock.open?.toFixed(2), color: colors.text },
            { label: '最高', value: stock.high?.toFixed(2), color: colors.up },
            { label: '最低', value: stock.low?.toFixed(2), color: colors.down },
            { label: '成交额', value: formatNumber(stock.amount || stock.turnover), color: colors.text },
            { label: '换手', value: stock.turnoverRate ? stock.turnoverRate.toFixed(2) + '%' : '-', color: colors.text },
          ].map((item, idx) => (
            <div key={idx} style={{ textAlign: 'center', minWidth: 40 }}>
              <div style={{ fontSize: 10, color: colors.subText, lineHeight: 1.2 }}>{item.label}</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: item.color, lineHeight: 1.4 }}>{item.value || '-'}</div>
            </div>
          ))}
        </div>

        {/* 分隔线 */}
        <div style={{ width: 1, height: 24, background: colors.border }} />

        {/* 四大信号（紧凑Tag形式） */}
        <div style={{ display: 'flex', gap: 6, flex: 1 }}>
          <Tooltip title={`RSI: ${diagnosis?.rsi || '-'}, MACD: ${diagnosis?.macd || '-'}`}>
            <Tag 
              icon={<LineChartOutlined style={{ fontSize: 10 }} />}
              color={diagnosis?.trendColor === colors.up ? 'red' : diagnosis?.trendColor === colors.down ? 'green' : 'default'}
              style={{ margin: 0, fontSize: 11, padding: '0 5px', cursor: 'help', lineHeight: '18px' }}
            >
              {diagnosis?.trendLabel || '震荡'}
            </Tag>
          </Tooltip>
          <Tooltip title={`年化波动率: ${diagnosis?.volatility || '-'}%`}>
            <Tag 
              icon={<SafetyOutlined style={{ fontSize: 10 }} />}
              color={diagnosis?.riskLevel === '高' ? 'red' : diagnosis?.riskLevel === '低' ? 'green' : 'orange'}
              style={{ margin: 0, fontSize: 11, padding: '0 5px', cursor: 'help', lineHeight: '18px' }}
            >
              {diagnosis?.riskLevel || '中'}风险
            </Tag>
          </Tooltip>
          <Tooltip title={`动态PE(TTM): ${stock.peRatio?.toFixed(1) || '-'}, 静态PE(LYR): ${stock.peRatioStatic?.toFixed(1) || '-'}`}>
            <Tag 
              icon={<ThunderboltOutlined style={{ fontSize: 10 }} />}
              color={(stock.peRatio || stock.peRatioStatic) > 50 ? 'red' : (stock.peRatio || stock.peRatioStatic) < 15 ? 'green' : 'blue'}
              style={{ margin: 0, fontSize: 11, padding: '0 5px', cursor: 'help', lineHeight: '18px' }}
            >
              估值{(stock.peRatio || stock.peRatioStatic) > 50 ? '高' : (stock.peRatio || stock.peRatioStatic) < 15 ? '低' : '中'}
            </Tag>
          </Tooltip>
          <Tooltip title={`主力净流入: ${mainFlow > 0 ? '+' : ''}${mainFlow.toFixed(2)}亿`}>
            <Tag 
              icon={<DollarOutlined style={{ fontSize: 10 }} />}
              color={mainFlow > 0 ? 'red' : 'green'}
              style={{ margin: 0, fontSize: 11, padding: '0 5px', cursor: 'help', lineHeight: '18px' }}
            >
              {mainFlow > 0 ? '流入' : '流出'}
            </Tag>
          </Tooltip>
        </div>

        {/* 分隔线 */}
        <div style={{ width: 1, height: 24, background: colors.border }} />

        {/* 基本面指标 - 动态PE和静态PE */}
        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
          {[
            { label: 'PE(动)', value: stock.peRatio?.toFixed(1), tip: '动态市盈率(TTM)，滚动12个月' },
            { label: 'PE(静)', value: stock.peRatioStatic?.toFixed(1), tip: '静态市盈率(LYR)，上年年报' },
            { label: 'PB', value: stock.pbRatio?.toFixed(2), tip: '市净率' },
            { label: '市值', value: formatNumber(stock.totalMarketCap, 0), tip: '总市值' },
          ].map((item, idx) => (
            <Tooltip key={idx} title={item.tip}>
              <div style={{ textAlign: 'center', minWidth: 36, cursor: 'help' }}>
                <div style={{ fontSize: 10, color: colors.subText, lineHeight: 1.2 }}>{item.label}</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: colors.text, lineHeight: 1.4 }}>{item.value || '-'}</div>
              </div>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  )
}

export default memo(StockOverviewHeader)
