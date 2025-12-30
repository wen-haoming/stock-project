import { memo } from 'react'
import { Progress, Tooltip } from 'antd'
import { QuestionCircleOutlined } from '@ant-design/icons'
import { useTheme } from '../../../contexts/ThemeContext'

/**
 * 资金流向 - 主力/大单/中单/小单净流入
 */
function MoneyFlowCard({ stock }) {
  const { isDark } = useTheme()

  const textColor = isDark ? '#e0e0e0' : '#333'
  const subTextColor = isDark ? '#999' : '#666'
  const borderColor = isDark ? '#333' : '#f0f0f0'

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
      <span style={{ color, fontWeight: 500, fontSize: 11 }}>
        {val > 0 ? '+' : ''}{val.toFixed(2)}亿
      </span>
    )
  }

  const FlowItem = ({ label, value, percent, tip }) => (
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
        {formatMoney(value)}
      </div>
      <Progress 
        percent={percent} 
        showInfo={false} 
        size="small" 
        strokeColor={value > 0 ? '#f5222d' : '#52c41a'}
        trailColor={borderColor}
      />
    </div>
  )

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 500, color: textColor, marginBottom: 6 }}>资金流向</div>
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
      
      <div style={{ borderTop: `1px solid ${borderColor}`, paddingTop: 4, marginTop: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
          <span style={{ color: subTextColor, fontSize: 11 }}>
            北向资金
            <Tooltip title="沪深港通北向资金净买入">
              <QuestionCircleOutlined style={{ marginLeft: 4, fontSize: 9 }} />
            </Tooltip>
          </span>
          {formatMoney(moneyFlow.northbound)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: subTextColor, fontSize: 11 }}>
            机构持仓
            <Tooltip title="机构投资者持股比例">
              <QuestionCircleOutlined style={{ marginLeft: 4, fontSize: 9 }} />
            </Tooltip>
          </span>
          <span style={{ color: textColor, fontWeight: 500, fontSize: 11 }}>{moneyFlow.institutionHold}%</span>
        </div>
      </div>
    </div>
  )
}

export default memo(MoneyFlowCard)
