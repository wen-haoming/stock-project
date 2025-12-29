import { memo } from 'react'
import { Card, Progress, Tooltip } from 'antd'
import { QuestionCircleOutlined } from '@ant-design/icons'
import { useTheme } from '../../../contexts/ThemeContext'

/**
 * 资金流向卡片 - 主力/大单/中单/小单净流入
 */
function MoneyFlowCard({ stock }) {
  const { theme } = useTheme()
  const isDark = theme.custom?.isDark

  const cardStyle = { background: isDark ? '#1f1f1f' : '#fff' }
  const textColor = isDark ? '#e0e0e0' : '#333'
  const subTextColor = isDark ? '#999' : '#666'

  // 模拟数据（实际应从API获取）
  const moneyFlow = {
    main: (Math.random() - 0.5) * 2, // 主力净流入（亿）
    big: (Math.random() - 0.5) * 1.5,
    medium: (Math.random() - 0.5) * 0.8,
    small: (Math.random() - 0.5) * 0.5,
    northbound: (Math.random() - 0.5) * 0.3, // 北向资金
    institutionHold: (Math.random() * 30 + 10).toFixed(1), // 机构持仓比例
  }

  const total = Math.abs(moneyFlow.main) + Math.abs(moneyFlow.big) + Math.abs(moneyFlow.medium) + Math.abs(moneyFlow.small)

  const formatMoney = (val) => {
    const color = val > 0 ? '#f5222d' : val < 0 ? '#52c41a' : textColor
    return (
      <span style={{ color, fontWeight: 500 }}>
        {val > 0 ? '+' : ''}{val.toFixed(2)}亿
      </span>
    )
  }

  const FlowItem = ({ label, value, percent, tip }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ color: subTextColor, fontSize: 12 }}>
          {label}
          {tip && (
            <Tooltip title={tip}>
              <QuestionCircleOutlined style={{ marginLeft: 4, fontSize: 10 }} />
            </Tooltip>
          )}
        </span>
        {formatMoney(value)}
      </div>
      <Progress 
        percent={percent} 
        showInfo={false} 
        size="small" 
        strokeColor={value > 0 ? '#f5222d' : '#52c41a'}
        trailColor={isDark ? '#333' : '#f0f0f0'}
      />
    </div>
  )

  return (
    <Card 
      title="资金流向" 
      size="small" 
      style={cardStyle}
      headStyle={{ color: textColor, borderBottom: isDark ? '1px solid #333' : undefined }}
    >
      <FlowItem 
        label="主力净流入" 
        value={moneyFlow.main} 
        percent={total > 0 ? (Math.abs(moneyFlow.main) / total) * 100 : 0}
        tip="超大单+大单净买入金额"
      />
      <FlowItem 
        label="大单净流入" 
        value={moneyFlow.big} 
        percent={total > 0 ? (Math.abs(moneyFlow.big) / total) * 100 : 0}
        tip="50-100万元订单净买入"
      />
      <FlowItem 
        label="中单净流入" 
        value={moneyFlow.medium} 
        percent={total > 0 ? (Math.abs(moneyFlow.medium) / total) * 100 : 0}
        tip="10-50万元订单净买入"
      />
      <FlowItem 
        label="小单净流入" 
        value={moneyFlow.small} 
        percent={total > 0 ? (Math.abs(moneyFlow.small) / total) * 100 : 0}
        tip="10万元以下订单净买入"
      />
      
      <div style={{ borderTop: isDark ? '1px solid #333' : '1px solid #f0f0f0', paddingTop: 10, marginTop: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ color: subTextColor, fontSize: 12 }}>
            北向资金
            <Tooltip title="沪深港通北向资金净买入">
              <QuestionCircleOutlined style={{ marginLeft: 4, fontSize: 10 }} />
            </Tooltip>
          </span>
          {formatMoney(moneyFlow.northbound)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: subTextColor, fontSize: 12 }}>
            机构持仓
            <Tooltip title="机构投资者持股比例">
              <QuestionCircleOutlined style={{ marginLeft: 4, fontSize: 10 }} />
            </Tooltip>
          </span>
          <span style={{ color: textColor, fontWeight: 500 }}>{moneyFlow.institutionHold}%</span>
        </div>
      </div>
    </Card>
  )
}

export default memo(MoneyFlowCard)
