import { memo } from 'react'
import { Card, Tooltip } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { useTheme } from '../../../contexts/ThemeContext'

/**
 * 市场表现卡片 - 多周期涨跌幅、相对表现
 */
function MarketPerformanceCard({ stock }) {
  const { isDark } = useTheme()

  const cardStyle = { background: isDark ? '#1f1f1f' : '#fff' }
  const textColor = isDark ? '#e0e0e0' : '#333'
  const subTextColor = isDark ? '#999' : '#666'

  // 模拟数据（实际应从API获取）
  const performance = {
    day1: stock?.changePercent || 0,
    day5: (Math.random() - 0.5) * 10,
    day20: (Math.random() - 0.5) * 20,
    day60: (Math.random() - 0.5) * 30,
    relativeIndex: (Math.random() - 0.5) * 5,
    turnoverRate: stock?.turnoverRate || (Math.random() * 5).toFixed(2),
    industryRank: Math.floor(Math.random() * 50) + 1,
    industryTotal: 80,
  }

  const formatPercent = (val) => {
    if (val === null || val === undefined) return '-'
    const num = parseFloat(val)
    const color = num > 0 ? '#f5222d' : num < 0 ? '#52c41a' : textColor
    const icon = num > 0 ? <ArrowUpOutlined /> : num < 0 ? <ArrowDownOutlined /> : null
    return (
      <span style={{ color, fontWeight: 500 }}>
        {icon} {num > 0 ? '+' : ''}{num.toFixed(2)}%
      </span>
    )
  }

  const PerformanceRow = ({ label, value, tip }) => (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center',
      padding: '4px 0',
      borderBottom: isDark ? '1px solid #333' : '1px solid #f0f0f0'
    }}>
      <span style={{ color: subTextColor, fontSize: 11 }}>
        {label}
        {tip && (
          <Tooltip title={tip}>
            <QuestionCircleOutlined style={{ marginLeft: 4, fontSize: 9 }} />
          </Tooltip>
        )}
      </span>
      <span style={{ fontSize: 12 }}>{value}</span>
    </div>
  )

  return (
    <Card 
      title="市场表现" 
      size="small" 
      style={cardStyle}
      styles={{ header: { color: textColor, borderBottom: isDark ? '1px solid #333' : undefined, minHeight: 32, padding: '0 12px' }, body: { padding: '4px 12px' } }}
    >
      <PerformanceRow label="今日涨跌" value={formatPercent(performance.day1)} />
      <PerformanceRow label="5日涨跌" value={formatPercent(performance.day5)} tip="近5个交易日累计涨跌幅" />
      <PerformanceRow label="20日涨跌" value={formatPercent(performance.day20)} tip="近20个交易日累计涨跌幅" />
      <PerformanceRow label="60日涨跌" value={formatPercent(performance.day60)} tip="近60个交易日累计涨跌幅" />
      <PerformanceRow 
        label="相对大盘" 
        value={formatPercent(performance.relativeIndex)} 
        tip="相对于大盘指数的超额收益" 
      />
      <PerformanceRow 
        label="换手率" 
        value={<span style={{ color: textColor }}>{performance.turnoverRate}%</span>} 
        tip="当日成交量/流通股本" 
      />
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '4px 0'
      }}>
        <span style={{ color: subTextColor, fontSize: 11 }}>
          行业排名
          <Tooltip title="在所属行业中的涨跌幅排名">
            <QuestionCircleOutlined style={{ marginLeft: 4, fontSize: 9 }} />
          </Tooltip>
        </span>
        <span style={{ color: textColor, fontSize: 12, fontWeight: 500 }}>
          {performance.industryRank}/{performance.industryTotal}
        </span>
      </div>
    </Card>
  )
}

export default memo(MarketPerformanceCard)
