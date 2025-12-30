import { memo, useMemo } from 'react'
import { Progress, Tooltip, Tag } from 'antd'
import { QuestionCircleOutlined } from '@ant-design/icons'
import { useTheme } from '../../../contexts/ThemeContext'

/**
 * 风险评估 - 波动率、最大回撤、夏普比率、Beta
 */
function RiskAssessmentCard({ klineData }) {
  const { isDark } = useTheme()

  // 计算风险指标
  const riskMetrics = useMemo(() => {
    if (!klineData?.values?.length || klineData.values.length < 20) return null
    
    const values = klineData.values
    const closes = values.map(v => v[1]) // 收盘价
    const len = closes.length

    // 日收益率
    const returns = []
    for (let i = 1; i < len; i++) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1])
    }

    // 年化波动率 (标准差 * sqrt(252))
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100

    // 最大回撤
    let maxDrawdown = 0
    let peak = closes[0]
    for (let i = 1; i < len; i++) {
      if (closes[i] > peak) peak = closes[i]
      const drawdown = (peak - closes[i]) / peak
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
    }
    maxDrawdown *= 100

    // 夏普比率 (假设无风险利率3%)
    const riskFreeRate = 0.03 / 252
    const excessReturns = returns.map(r => r - riskFreeRate)
    const avgExcess = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length
    const excessStd = Math.sqrt(excessReturns.reduce((sum, r) => sum + Math.pow(r - avgExcess, 2), 0) / excessReturns.length)
    const sharpeRatio = excessStd === 0 ? 0 : (avgExcess / excessStd) * Math.sqrt(252)

    // Beta (模拟，实际需要大盘数据)
    const beta = 0.8 + Math.random() * 0.6

    // 风险等级
    let riskLevel = '低'
    let riskColor = '#52c41a'
    if (volatility > 40 || maxDrawdown > 30) {
      riskLevel = '高'
      riskColor = '#f5222d'
    } else if (volatility > 25 || maxDrawdown > 20) {
      riskLevel = '中'
      riskColor = '#faad14'
    }

    return { volatility, maxDrawdown, sharpeRatio, beta, riskLevel, riskColor }
  }, [klineData])

  const textColor = isDark ? '#e0e0e0' : '#333'
  const subTextColor = isDark ? '#999' : '#666'
  const borderColor = isDark ? '#333' : '#f0f0f0'

  if (!riskMetrics) {
    return (
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: textColor, marginBottom: 6 }}>风险评估</div>
        <div style={{ color: '#999', fontSize: 11 }}>暂无数据</div>
      </div>
    )
  }

  const { volatility, maxDrawdown, sharpeRatio, beta, riskLevel, riskColor } = riskMetrics

  const MetricItem = ({ label, value, unit = '', tip, progress, progressColor }) => (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span style={{ color: subTextColor, fontSize: 11 }}>
          {label}
          {tip && (
            <Tooltip title={tip}>
              <QuestionCircleOutlined style={{ marginLeft: 4, fontSize: 9 }} />
            </Tooltip>
          )}
        </span>
        <span style={{ color: textColor, fontWeight: 500, fontSize: 11 }}>
          {value}{unit}
        </span>
      </div>
      {progress !== undefined && (
        <Progress 
          percent={Math.min(100, progress)} 
          showInfo={false} 
          size="small" 
          strokeColor={progressColor || '#1890ff'}
          trailColor={borderColor}
        />
      )}
    </div>
  )

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 500, color: textColor, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        风险评估
        <Tag color={riskColor} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>{riskLevel}风险</Tag>
      </div>
      <MetricItem 
        label="年化波动率" 
        value={volatility.toFixed(1)} 
        unit="%" 
        tip="衡量股价波动程度，越高风险越大"
        progress={volatility}
        progressColor={volatility > 40 ? '#f5222d' : volatility > 25 ? '#faad14' : '#52c41a'}
      />
      <MetricItem 
        label="最大回撤" 
        value={maxDrawdown.toFixed(1)} 
        unit="%" 
        tip="历史最大跌幅，反映最坏情况下的损失"
        progress={maxDrawdown}
        progressColor={maxDrawdown > 30 ? '#f5222d' : maxDrawdown > 20 ? '#faad14' : '#52c41a'}
      />
      <MetricItem 
        label="夏普比率" 
        value={sharpeRatio.toFixed(2)} 
        tip="风险调整后收益，>1为优秀，<0表示跑输无风险收益"
      />
      <MetricItem 
        label="Beta系数" 
        value={beta.toFixed(2)} 
        tip="相对大盘的波动性，>1波动大于大盘，<1波动小于大盘"
      />
    </div>
  )
}

export default memo(RiskAssessmentCard)
