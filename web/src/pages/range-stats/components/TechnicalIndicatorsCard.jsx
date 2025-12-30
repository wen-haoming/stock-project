import { memo, useMemo } from 'react'
import { Card, Tooltip, Progress } from 'antd'
import { QuestionCircleOutlined } from '@ant-design/icons'
import { useTheme } from '../../../contexts/ThemeContext'

/**
 * 技术指标卡片 - RSI、MACD、布林带、量比
 */
function TechnicalIndicatorsCard({ klineData }) {
<<<<<<< HEAD
  const { isDark } = useTheme()
=======
  const { theme } = useTheme()
  const isDark = theme.custom?.isDark
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c

  // 计算技术指标
  const indicators = useMemo(() => {
    if (!klineData?.values?.length) return null
    
    const values = klineData.values
<<<<<<< HEAD
    const closes = values.map(v => v[1]) // 收盘价
=======
    const closes = values.map(v => v[2]) // 收盘价
    const volumes = values.map(v => v[5]) // 成交量
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
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

    // MACD (12, 26, 9)
    let macd = null, signal = null, histogram = null
    if (len >= 35) {
      const ema12 = calcEMA(closes, 12)
      const ema26 = calcEMA(closes, 26)
      const dif = ema12[len - 1] - ema26[len - 1]
      const difArr = ema12.map((v, i) => v - ema26[i]).slice(26)
      const dea = calcEMA(difArr, 9)
      signal = dea[dea.length - 1]
      macd = dif
      histogram = (dif - signal) * 2
    }

    // 布林带位置 (20日)
    let bollingerPos = null
    if (len >= 20) {
      const recent20 = closes.slice(-20)
      const ma20 = recent20.reduce((a, b) => a + b, 0) / 20
      const std = Math.sqrt(recent20.reduce((sum, v) => sum + Math.pow(v - ma20, 2), 0) / 20)
      const upper = ma20 + 2 * std
      const lower = ma20 - 2 * std
      const current = closes[len - 1]
      bollingerPos = std === 0 ? 50 : ((current - lower) / (upper - lower)) * 100
    }

<<<<<<< HEAD
    // 量比 (5日平均) - 从volumes获取
    let volumeRatio = null
    const volumes = klineData.volumes
    if (volumes?.length >= 6) {
      const avgVol5 = volumes.slice(-6, -1).reduce((a, b) => a + (b?.[1] || 0), 0) / 5
      const lastVol = volumes[volumes.length - 1]?.[1] || 0
      volumeRatio = avgVol5 === 0 ? 0 : lastVol / avgVol5
=======
    // 量比 (5日平均)
    let volumeRatio = null
    if (len >= 6) {
      const avgVol5 = volumes.slice(-6, -1).reduce((a, b) => a + b, 0) / 5
      volumeRatio = avgVol5 === 0 ? 0 : volumes[len - 1] / avgVol5
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
    }

    return { rsi, macd, signal, histogram, bollingerPos, volumeRatio }
  }, [klineData])

  // EMA计算辅助函数
  function calcEMA(data, period) {
    const k = 2 / (period + 1)
    const ema = [data[0]]
    for (let i = 1; i < data.length; i++) {
      ema.push(data[i] * k + ema[i - 1] * (1 - k))
    }
    return ema
  }

<<<<<<< HEAD
  const cardStyle = { background: isDark ? '#1f1f1f' : '#fff' }
  const textColor = isDark ? '#e0e0e0' : '#333'
  const subTextColor = isDark ? '#999' : '#666'

  if (!indicators) {
    return (
      <Card title="技术指标" size="small" style={cardStyle} styles={{ header: { color: textColor, borderBottom: isDark ? '1px solid #333' : undefined }, body: { padding: '8px 12px' } }}>
        <div style={{ color: '#999', textAlign: 'center', padding: 12 }}>暂无数据</div>
=======
  if (!indicators) {
    return (
      <Card title="技术指标" size="small" style={{ background: isDark ? '#1f1f1f' : '#fff' }}>
        <div style={{ color: '#999', textAlign: 'center', padding: 20 }}>暂无数据</div>
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
      </Card>
    )
  }

<<<<<<< HEAD
  const { rsi, histogram, bollingerPos, volumeRatio } = indicators
=======
  const { rsi, macd, histogram, bollingerPos, volumeRatio } = indicators
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c

  // RSI 状态
  const getRsiStatus = (val) => {
    if (val >= 70) return { text: '超买', color: '#f5222d' }
    if (val <= 30) return { text: '超卖', color: '#52c41a' }
    return { text: '中性', color: '#faad14' }
  }

  // MACD 状态
  const getMacdStatus = (hist) => {
    if (hist > 0.02) return { text: '多头', color: '#f5222d' }
    if (hist < -0.02) return { text: '空头', color: '#52c41a' }
    return { text: '震荡', color: '#faad14' }
  }

  // 量比状态
  const getVolumeStatus = (val) => {
    if (val >= 2) return { text: '放量', color: '#f5222d' }
    if (val <= 0.5) return { text: '缩量', color: '#52c41a' }
<<<<<<< HEAD
    return { text: '正常', color: isDark ? '#999' : '#666' }
  }

  const IndicatorItem = ({ label, value, unit = '', status, tip, progress }) => (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span style={{ color: subTextColor, fontSize: 11 }}>
          {label}
          {tip && (
            <Tooltip title={tip}>
              <QuestionCircleOutlined style={{ marginLeft: 4, fontSize: 9 }} />
            </Tooltip>
          )}
        </span>
        <span style={{ color: status?.color || textColor, fontWeight: 500, fontSize: 12 }}>
          {value !== null ? `${value}${unit}` : '-'}
          {status && <span style={{ marginLeft: 4, fontSize: 10 }}>({status.text})</span>}
=======
    return { text: '正常', color: '#666' }
  }

  const cardStyle = { background: isDark ? '#1f1f1f' : '#fff' }
  const textColor = isDark ? '#e0e0e0' : '#333'
  const subTextColor = isDark ? '#999' : '#666'

  const IndicatorItem = ({ label, value, unit = '', status, tip, progress }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ color: subTextColor, fontSize: 12 }}>
          {label}
          {tip && (
            <Tooltip title={tip}>
              <QuestionCircleOutlined style={{ marginLeft: 4, fontSize: 10 }} />
            </Tooltip>
          )}
        </span>
        <span style={{ color: status?.color || textColor, fontWeight: 500, fontSize: 13 }}>
          {value !== null ? `${value}${unit}` : '-'}
          {status && <span style={{ marginLeft: 4, fontSize: 11 }}>({status.text})</span>}
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
        </span>
      </div>
      {progress !== undefined && (
        <Progress 
          percent={Math.min(100, Math.max(0, progress))} 
          showInfo={false} 
          size="small" 
          strokeColor={status?.color || '#1890ff'}
          trailColor={isDark ? '#333' : '#f0f0f0'}
        />
      )}
    </div>
  )

  return (
    <Card 
      title="技术指标" 
      size="small" 
      style={cardStyle}
<<<<<<< HEAD
      styles={{ header: { color: textColor, borderBottom: isDark ? '1px solid #333' : undefined, minHeight: 32, padding: '0 12px' }, body: { padding: '8px 12px' } }}
=======
      headStyle={{ color: textColor, borderBottom: isDark ? '1px solid #333' : undefined }}
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
    >
      <IndicatorItem 
        label="RSI(14)" 
        value={rsi?.toFixed(1)} 
        status={rsi !== null ? getRsiStatus(rsi) : null}
        tip="相对强弱指数，>70超买，<30超卖"
        progress={rsi}
      />
      <IndicatorItem 
        label="MACD柱" 
        value={histogram?.toFixed(3)} 
        status={histogram !== null ? getMacdStatus(histogram) : null}
        tip="MACD柱状图，正值多头，负值空头"
      />
      <IndicatorItem 
        label="布林带位置" 
        value={bollingerPos?.toFixed(0)} 
        unit="%" 
        tip="当前价格在布林带中的位置，0%为下轨，100%为上轨"
        progress={bollingerPos}
      />
      <IndicatorItem 
        label="量比" 
        value={volumeRatio?.toFixed(2)} 
        status={volumeRatio !== null ? getVolumeStatus(volumeRatio) : null}
        tip="当日成交量与5日平均成交量的比值"
      />
    </Card>
  )
}

export default memo(TechnicalIndicatorsCard)
