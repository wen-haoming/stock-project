import { memo, useMemo } from 'react'
import { Progress, Tag, Tooltip } from 'antd'
import { 
  QuestionCircleOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  RiseOutlined,
  FallOutlined,
} from '@ant-design/icons'
import { useTheme } from '../../../contexts/ThemeContext'

/**
 * 股票诊断面板 - 强化进度条和状态标签视觉
 * 确保"高风险/机会点"一眼可见
 */
function StockDiagnosisPanel({ stock, klineData }) {
  const { isDark } = useTheme()

  // 颜色系统
  const colors = {
    up: '#f5222d',
    down: '#52c41a',
    warning: '#faad14',
    info: '#1890ff',
    text: isDark ? '#e0e0e0' : '#333',
    subText: isDark ? '#888' : '#999',
    border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    cardBg: isDark ? '#1f1f1f' : '#fafafa',
    progressTrail: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
  }

  // 计算所有诊断指标
  const analysis = useMemo(() => {
    if (!klineData?.values?.length) return null
    
    const values = klineData.values
    const closes = values.map(v => v[1])
    const volumes = klineData.volumes?.map(v => v?.[1] || 0) || []
    const len = closes.length

    // RSI(14)
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

    // MACD
    let macdHistogram = 0
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
      macdHistogram = (dif - dea[dea.length - 1]) * 2
    }

    // 布林带位置
    let bollingerPos = 50
    if (len >= 20) {
      const recent20 = closes.slice(-20)
      const ma20 = recent20.reduce((a, b) => a + b, 0) / 20
      const std = Math.sqrt(recent20.reduce((sum, v) => sum + Math.pow(v - ma20, 2), 0) / 20)
      const upper = ma20 + 2 * std
      const lower = ma20 - 2 * std
      bollingerPos = std === 0 ? 50 : ((closes[len - 1] - lower) / (upper - lower)) * 100
    }

    // 量比
    let volumeRatio = 1
    if (volumes.length >= 6) {
      const avgVol5 = volumes.slice(-6, -1).reduce((a, b) => a + b, 0) / 5
      const lastVol = volumes[volumes.length - 1]
      volumeRatio = avgVol5 === 0 ? 1 : lastVol / avgVol5
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

    // 最大回撤
    let maxDrawdown = 0
    let peak = closes[0]
    for (let i = 1; i < len; i++) {
      if (closes[i] > peak) peak = closes[i]
      const drawdown = (peak - closes[i]) / peak
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
    }

    // 涨跌幅统计
    const changes = {
      day1: len >= 2 ? ((closes[len - 1] - closes[len - 2]) / closes[len - 2]) * 100 : 0,
      day5: len >= 6 ? ((closes[len - 1] - closes[len - 6]) / closes[len - 6]) * 100 : 0,
      day20: len >= 21 ? ((closes[len - 1] - closes[len - 21]) / closes[len - 21]) * 100 : 0,
    }

    return {
      rsi,
      macdHistogram,
      bollingerPos,
      volumeRatio,
      volatility,
      maxDrawdown: maxDrawdown * 100,
      changes,
    }
  }, [klineData])

  // 生成诊断结论
  const conclusions = useMemo(() => {
    if (!analysis) return []
    
    const items = []
    
    // RSI 超买超卖
    if (analysis.rsi >= 70) {
      items.push({
        type: 'warning',
        icon: <WarningOutlined />,
        title: 'RSI超买警告',
        desc: `RSI达到${analysis.rsi.toFixed(1)}，短期可能回调`,
        color: colors.up,
      })
    } else if (analysis.rsi <= 30) {
      items.push({
        type: 'opportunity',
        icon: <CheckCircleOutlined />,
        title: 'RSI超卖机会',
        desc: `RSI仅${analysis.rsi.toFixed(1)}，可能存在反弹机会`,
        color: colors.down,
      })
    }

    // MACD 金叉死叉
    if (analysis.macdHistogram > 0.05) {
      items.push({
        type: 'bullish',
        icon: <RiseOutlined />,
        title: 'MACD多头信号',
        desc: '柱状图为正，多头动能增强',
        color: colors.up,
      })
    } else if (analysis.macdHistogram < -0.05) {
      items.push({
        type: 'bearish',
        icon: <FallOutlined />,
        title: 'MACD空头信号',
        desc: '柱状图为负，空头动能增强',
        color: colors.down,
      })
    }

    // 布林带突破
    if (analysis.bollingerPos >= 95) {
      items.push({
        type: 'warning',
        icon: <ExclamationCircleOutlined />,
        title: '触及布林上轨',
        desc: '价格接近上轨，注意回调风险',
        color: colors.warning,
      })
    } else if (analysis.bollingerPos <= 5) {
      items.push({
        type: 'opportunity',
        icon: <CheckCircleOutlined />,
        title: '触及布林下轨',
        desc: '价格接近下轨，可能存在支撑',
        color: colors.info,
      })
    }

    // 量能异动
    if (analysis.volumeRatio >= 2) {
      items.push({
        type: 'alert',
        icon: <WarningOutlined />,
        title: '成交量放大',
        desc: `量比${analysis.volumeRatio.toFixed(2)}，成交活跃`,
        color: colors.warning,
      })
    }

    // 高波动风险
    if (analysis.volatility > 40) {
      items.push({
        type: 'risk',
        icon: <WarningOutlined />,
        title: '高波动风险',
        desc: `年化波动率${analysis.volatility.toFixed(1)}%，风险较高`,
        color: colors.up,
      })
    }

    return items
  }, [analysis, colors])

  // 进度条组件
  const ProgressBar = ({ label, value, max = 100, tip, dangerZone, warningZone, format }) => {
    let strokeColor = colors.info
    if (dangerZone && value >= dangerZone) {
      strokeColor = colors.up
    } else if (warningZone && value >= warningZone) {
      strokeColor = colors.warning
    }

    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: colors.subText, display: 'flex', alignItems: 'center', gap: 4 }}>
            {label}
            {tip && (
              <Tooltip title={tip}>
                <QuestionCircleOutlined style={{ fontSize: 10, color: isDark ? '#555' : '#bbb' }} />
              </Tooltip>
            )}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: strokeColor }}>
            {format ? format(value) : value?.toFixed(1)}
          </span>
        </div>
        <Progress
          percent={Math.min(100, (value / max) * 100)}
          showInfo={false}
          strokeColor={strokeColor}
          trailColor={colors.progressTrail}
          size="small"
          style={{ marginBottom: 0 }}
        />
      </div>
    )
  }

  // 涨跌幅标签
  const ChangeTag = ({ label, value }) => {
    const color = value > 0 ? colors.up : value < 0 ? colors.down : colors.text
    return (
      <div style={{ 
        background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
        borderRadius: 4,
        padding: '6px 10px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, color: colors.subText, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color }}>
          {value > 0 ? '+' : ''}{value?.toFixed(2) || '-'}%
        </div>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div style={{ 
        background: colors.cardBg,
        borderRadius: 8,
        padding: 16,
        textAlign: 'center',
        color: colors.subText,
      }}>
        暂无诊断数据
      </div>
    )
  }

  return (
    <div style={{ 
      background: colors.cardBg,
      borderRadius: 8,
      padding: 16,
      marginTop: 12,
    }}>
      {/* 诊断结论 - 高亮显示 */}
      {conclusions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ 
            fontSize: 13, 
            fontWeight: 600, 
            color: colors.text, 
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <ExclamationCircleOutlined style={{ color: colors.warning }} />
            诊断结论
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {conclusions.map((item, idx) => (
              <Tag
                key={idx}
                icon={item.icon}
                color={item.color === colors.up ? 'red' : item.color === colors.down ? 'green' : item.color === colors.warning ? 'orange' : 'blue'}
                style={{ 
                  padding: '4px 10px',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Tooltip title={item.desc}>
                  <span style={{ cursor: 'help' }}>{item.title}</span>
                </Tooltip>
              </Tag>
            ))}
          </div>
        </div>
      )}

      {/* 两列布局 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* 左列：技术指标 */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.text, marginBottom: 12 }}>
            技术指标
          </div>
          <ProgressBar
            label="RSI(14)"
            value={analysis.rsi}
            max={100}
            tip="相对强弱指数，>70超买，<30超卖"
            dangerZone={70}
            warningZone={60}
          />
          <ProgressBar
            label="布林位置"
            value={analysis.bollingerPos}
            max={100}
            tip="当前价格在布林带中的位置"
            dangerZone={90}
            warningZone={70}
            format={(v) => `${v.toFixed(0)}%`}
          />
          <ProgressBar
            label="量比"
            value={analysis.volumeRatio}
            max={3}
            tip="当日成交量与5日均量的比值"
            dangerZone={2}
            warningZone={1.5}
            format={(v) => v.toFixed(2)}
          />
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            padding: '8px 0',
            borderTop: `1px solid ${colors.border}`,
          }}>
            <span style={{ fontSize: 12, color: colors.subText }}>MACD信号</span>
            <Tag 
              color={analysis.macdHistogram > 0 ? 'red' : analysis.macdHistogram < 0 ? 'green' : 'default'}
              style={{ margin: 0 }}
            >
              {analysis.macdHistogram > 0 ? '多头' : analysis.macdHistogram < 0 ? '空头' : '震荡'}
            </Tag>
          </div>
        </div>

        {/* 右列：风险与表现 */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.text, marginBottom: 12 }}>
            风险评估
          </div>
          <ProgressBar
            label="年化波动率"
            value={analysis.volatility}
            max={60}
            tip="衡量股价波动程度，越高风险越大"
            dangerZone={40}
            warningZone={25}
            format={(v) => `${v.toFixed(1)}%`}
          />
          <ProgressBar
            label="最大回撤"
            value={analysis.maxDrawdown}
            max={50}
            tip="历史最大跌幅"
            dangerZone={30}
            warningZone={20}
            format={(v) => `${v.toFixed(1)}%`}
          />

          {/* 区间涨跌 */}
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.text, marginTop: 16, marginBottom: 10 }}>
            区间表现
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <ChangeTag label="今日" value={analysis.changes.day1} />
            <ChangeTag label="5日" value={analysis.changes.day5} />
            <ChangeTag label="20日" value={analysis.changes.day20} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(StockDiagnosisPanel)
