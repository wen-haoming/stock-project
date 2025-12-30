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
<<<<<<< HEAD
=======
  // 行情报价
  volume: { label: '成交量', tip: '当日累计成交的股票数量，单位为手（1手=100股）', format: formatVolume },
  high: { label: '最高', tip: '当日最高成交价格', format: (v) => v?.toFixed(2) || '-', priceColor: true },
  open: { label: '今开', tip: '当日开盘价格', format: (v) => v?.toFixed(2) || '-', priceColor: true },
  amount: { label: '成交额', tip: '当日累计成交金额', format: formatAmount },
  low: { label: '最低', tip: '当日最低成交价格', format: (v) => v?.toFixed(2) || '-', priceColor: true },
  preClose: { label: '昨收', tip: '上一交易日收盘价', format: (v) => v?.toFixed(2) || '-' },
  turnoverRate: { label: '换手', tip: '换手率 = 成交量 / 流通股本 × 100%', format: (v) => v != null ? v.toFixed(2) + '%' : '-' },
  limitUp: { label: '涨停', tip: 'A股涨停价格', format: (v) => v?.toFixed(2) || '-', color: upColor },
  amplitude: { label: '振幅', tip: '振幅 = (最高价 - 最低价) / 昨收价 × 100%', format: (v) => v != null ? v.toFixed(2) + '%' : '-' },
  limitDown: { label: '跌停', tip: 'A股跌停价格', format: (v) => v?.toFixed(2) || '-', color: downColor },
  volumeRatio: { label: '量比', tip: '量比 = 当日成交量 / 过去5日平均成交量', format: (v) => v?.toFixed(2) || '-' },
  avgPrice: { label: '均价', tip: '当日成交均价 = 成交额 / 成交量', format: (v) => v?.toFixed(2) || '-' },
  // 基本面
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
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
<<<<<<< HEAD
const InfoItem = ({ label, value, tip, color, isDark }) => {
  const labelColor = isDark ? '#888' : '#666'
  const tipIconColor = isDark ? '#666' : '#bbb'
=======
const InfoItem = ({ label, value, tip, color, stock, isDark }) => {
  // 根据涨跌决定颜色
  let displayColor = color
  if (!displayColor && stock) {
    const changePct = stock.changePct
    if (changePct > 0) displayColor = upColor
    else if (changePct < 0) displayColor = downColor
    else displayColor = isDark ? '#999' : neutralColor
  }
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
  
  const labelColor = isDark ? '#888' : '#666'
  const tipIconColor = isDark ? '#666' : '#bbb'
  
  return (
<<<<<<< HEAD
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
=======
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
      <span style={{ color: labelColor, fontSize: 12, display: 'flex', alignItems: 'center', gap: 2 }}>
        {label}
        {tip && (
          <Tooltip title={tip}>
            <QuestionCircleOutlined style={{ fontSize: 10, color: tipIconColor, cursor: 'help' }} />
          </Tooltip>
        )}
      </span>
      <span style={{ color: displayColor || (isDark ? '#999' : neutralColor), fontSize: 12, fontFamily: 'monospace', fontWeight: 500 }}>
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
        {value}
      </span>
    </div>
  )
}

/**
 * 基础信息卡片 - 只展示基本面数据（放在K线上方）
 */
<<<<<<< HEAD
const BasicInfoCard = memo(({ stock }) => {
=======
const BasicInfoCard = memo(({ stock, isMobile }) => {
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
  const { isDark } = useTheme()
  
  if (!stock) return null
  
<<<<<<< HEAD
  const borderColor = isDark ? '#333' : '#f0f0f0'
  const bgColor = isDark ? '#1f1f1f' : '#fafafa'
  
  const renderRow = (fields, stock, isLast) => (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: 'repeat(4, 1fr)', 
      borderBottom: isLast ? 'none' : `1px solid ${borderColor}` 
    }}>
=======
  const borderColor = isDark ? '#2a2a2a' : '#f5f5f5'
  const separatorBg = isDark ? '#252525' : '#fafafa'
  const industryBg = isDark ? 'rgba(24, 144, 255, 0.15)' : '#e6f7ff'
  const industryColor = isDark ? '#4dabf7' : '#1890ff'
  
  const renderRow = (fields, stock) => (
    <div style={{ display: 'flex', borderBottom: `1px solid ${borderColor}` }}>
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
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
<<<<<<< HEAD
              color={config.color}
=======
              color={color}
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
              isDark={isDark}
            />
          </div>
        )
      })}
    </div>
  )
  
  return (
<<<<<<< HEAD
    <div style={{ 
      background: bgColor, 
      borderRadius: 4, 
      padding: '4px 0',
      marginBottom: 8,
      border: `1px solid ${borderColor}`
    }}>
=======
    <Card 
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13 }}>行情报价</span>
          {stock.industry && (
            <span style={{ fontSize: 11, color: industryColor, background: industryBg, padding: '1px 6px', borderRadius: 4 }}>
              {stock.industry}
            </span>
          )}
        </div>
      }
      size="small" 
      style={{ marginBottom: 12 }}
      styles={{ header: { minHeight: 32, padding: '0 12px' }, body: { padding: '4px 4px' } }}
    >
      {/* 行情报价 */}
      {QUOTE_FIELDS.map((row, idx) => (
        <div key={idx}>{renderRow(row, stock)}</div>
      ))}
      
      {/* 分隔线 */}
      <div style={{ height: 4, background: separatorBg, margin: '4px -4px' }} />
      
      {/* 基本面数据 */}
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
      {FUNDAMENTAL_FIELDS.map((row, idx) => (
        <div key={idx}>{renderRow(row, stock, idx === FUNDAMENTAL_FIELDS.length - 1)}</div>
      ))}
    </div>
  )
})

BasicInfoCard.displayName = 'BasicInfoCard'

export default BasicInfoCard
