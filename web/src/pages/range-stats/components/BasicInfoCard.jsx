import { memo } from 'react'
import { Tooltip } from 'antd'
import { QuestionCircleOutlined } from '@ant-design/icons'
import { useTheme } from '../../../contexts/ThemeContext'

// 格式化数字
const formatNumber = (num, precision = 2) => {
  if (num == null || isNaN(num)) return '-'
  if (Math.abs(num) >= 100000000) return (num / 100000000).toFixed(precision) + '亿'
  if (Math.abs(num) >= 10000) return (num / 10000).toFixed(precision) + '万'
  return num.toFixed(precision)
}

// 涨跌颜色
const neutralColor = '#666'

// 字段配置 - 只保留基本面
const FIELD_CONFIG = {
  eps: { label: '每股收益', tip: '每股收益(EPS) = 净利润 / 总股本', format: (v) => v?.toFixed(3) || '-' },
  peRatio: { label: '市盈率', tip: '市盈率(PE) = 股价 / 每股收益', format: (v) => v?.toFixed(2) || '-' },
  pbRatio: { label: '市净率', tip: '市净率(PB) = 股价 / 每股净资产', format: (v) => v?.toFixed(2) || '-' },
  roe: { label: 'ROE', tip: '净资产收益率 = 净利润 / 净资产 × 100%', format: (v) => v != null ? v.toFixed(2) + '%' : '-' },
  floatShares: { label: '流通股', tip: '可在二级市场流通交易的股份数量', format: (v) => formatNumber(v, 0) },
  floatMarketCap: { label: '流通市值', tip: '流通市值 = 流通股本 × 股价', format: (v) => formatNumber(v, 0) },
  totalShares: { label: '总股本', tip: '公司发行的全部股份数量', format: (v) => formatNumber(v, 0) },
  totalMarketCap: { label: '总市值', tip: '总市值 = 总股本 × 股价', format: (v) => formatNumber(v, 0) },
}

// 基本面字段顺序（4列布局，2行）
const FUNDAMENTAL_FIELDS = [
  ['eps', 'peRatio', 'pbRatio', 'roe'],
  ['floatShares', 'floatMarketCap', 'totalShares', 'totalMarketCap'],
]

// 单个指标项
const InfoItem = ({ label, value, tip, color, isDark }) => {
  const labelColor = isDark ? '#888' : '#666'
  const tipIconColor = isDark ? '#666' : '#bbb'
  
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', gap: 4 }}>
      <span style={{ color: labelColor, fontSize: 11, display: 'flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {label}
        {tip && (
          <Tooltip title={tip}>
            <QuestionCircleOutlined style={{ fontSize: 9, color: tipIconColor, cursor: 'help' }} />
          </Tooltip>
        )}
      </span>
      <span style={{ 
        color: color || (isDark ? '#999' : neutralColor), 
        fontSize: 11, 
        fontFamily: 'Consolas, Monaco, monospace', 
        fontWeight: 500,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        textAlign: 'right',
      }}>
        {value}
      </span>
    </div>
  )
}

/**
 * 基础信息卡片 - 只展示基本面数据（放在K线上方）
 */
const BasicInfoCard = memo(({ stock }) => {
  const { isDark } = useTheme()
  
  if (!stock) return null
  
  const borderColor = isDark ? '#333' : '#f0f0f0'
  const bgColor = isDark ? '#1f1f1f' : '#fafafa'
  
  const renderRow = (fields, stock, isLast) => (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: 'repeat(4, 1fr)', 
      borderBottom: isLast ? 'none' : `1px solid ${borderColor}` 
    }}>
      {fields.map((field, idx) => {
        if (!field) return <div key={idx} style={{ padding: '0 6px' }} />
        const config = FIELD_CONFIG[field]
        if (!config) return <div key={idx} style={{ padding: '0 6px' }} />
        
        return (
          <div key={field} style={{ padding: '0 8px', minWidth: 0 }}>
            <InfoItem 
              label={config.label}
              value={config.format(stock[field])}
              tip={config.tip}
              color={config.color}
              isDark={isDark}
            />
          </div>
        )
      })}
    </div>
  )
  
  return (
    <div style={{ 
      background: bgColor, 
      borderRadius: 4, 
      padding: '4px 0',
      marginBottom: 8,
      border: `1px solid ${borderColor}`
    }}>
      {FUNDAMENTAL_FIELDS.map((row, idx) => (
        <div key={idx}>{renderRow(row, stock, idx === FUNDAMENTAL_FIELDS.length - 1)}</div>
      ))}
    </div>
  )
})

BasicInfoCard.displayName = 'BasicInfoCard'

export default BasicInfoCard
