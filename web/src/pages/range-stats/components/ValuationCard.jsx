import { memo } from 'react'
import { Card, Progress, Tooltip } from 'antd'
import { QuestionCircleOutlined } from '@ant-design/icons'
import { useTheme } from '../../../contexts/ThemeContext'

/**
 * 估值分析卡片 - PE/PB/PS及历史分位
 */
function ValuationCard({ stock }) {
  const { theme } = useTheme()
  const isDark = theme.custom?.isDark

  const cardStyle = { background: isDark ? '#1f1f1f' : '#fff' }
  const textColor = isDark ? '#e0e0e0' : '#333'
  const subTextColor = isDark ? '#999' : '#666'

  // 从stock获取或模拟数据
  const valuation = {
    pe: stock?.pe || (Math.random() * 30 + 5).toFixed(2),
    pePercentile: Math.random() * 100,
    peIndustryAvg: (Math.random() * 25 + 10).toFixed(2),
    pb: stock?.pb || (Math.random() * 5 + 0.5).toFixed(2),
    pbPercentile: Math.random() * 100,
    pbIndustryAvg: (Math.random() * 3 + 1).toFixed(2),
    ps: (Math.random() * 10 + 1).toFixed(2),
    psPercentile: Math.random() * 100,
    psIndustryAvg: (Math.random() * 8 + 2).toFixed(2),
    dcfValue: stock?.price ? (parseFloat(stock.price) * (0.8 + Math.random() * 0.4)).toFixed(2) : '-',
  }

  const getPercentileColor = (val) => {
    if (val > 80) return '#f5222d'
    if (val > 60) return '#faad14'
    if (val > 40) return '#1890ff'
    if (val > 20) return '#52c41a'
    return '#52c41a'
  }

  const getPercentileText = (val) => {
    if (val > 80) return '偏高'
    if (val > 60) return '中高'
    if (val > 40) return '适中'
    if (val > 20) return '中低'
    return '偏低'
  }

  const ValuationItem = ({ label, value, percentile, industryAvg, tip }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ color: subTextColor, fontSize: 12 }}>
          {label}
          {tip && (
            <Tooltip title={tip}>
              <QuestionCircleOutlined style={{ marginLeft: 4, fontSize: 10 }} />
            </Tooltip>
          )}
        </span>
        <span style={{ color: textColor, fontWeight: 500, fontSize: 14 }}>{value}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Progress 
          percent={percentile} 
          showInfo={false} 
          size="small" 
          style={{ flex: 1 }}
          strokeColor={getPercentileColor(percentile)}
          trailColor={isDark ? '#333' : '#f0f0f0'}
        />
        <span style={{ 
          color: getPercentileColor(percentile), 
          fontSize: 11, 
          minWidth: 32 
        }}>
          {getPercentileText(percentile)}
        </span>
      </div>
      <div style={{ fontSize: 11, color: subTextColor, marginTop: 2 }}>
        历史分位 {percentile.toFixed(0)}% | 行业均值 {industryAvg}
      </div>
    </div>
  )

  return (
    <Card 
      title="估值分析" 
      size="small" 
      style={cardStyle}
      headStyle={{ color: textColor, borderBottom: isDark ? '1px solid #333' : undefined }}
    >
      <ValuationItem 
        label="市盈率 PE(TTM)" 
        value={valuation.pe} 
        percentile={valuation.pePercentile}
        industryAvg={valuation.peIndustryAvg}
        tip="股价/每股收益，反映投资回收期"
      />
      <ValuationItem 
        label="市净率 PB" 
        value={valuation.pb} 
        percentile={valuation.pbPercentile}
        industryAvg={valuation.pbIndustryAvg}
        tip="股价/每股净资产，反映资产溢价"
      />
      <ValuationItem 
        label="市销率 PS" 
        value={valuation.ps} 
        percentile={valuation.psPercentile}
        industryAvg={valuation.psIndustryAvg}
        tip="股价/每股销售额，适用于亏损公司"
      />
      
      <div style={{ 
        borderTop: isDark ? '1px solid #333' : '1px solid #f0f0f0', 
        paddingTop: 10, 
        marginTop: 4,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span style={{ color: subTextColor, fontSize: 12 }}>
          DCF估值
          <Tooltip title="基于现金流折现模型的内在价值估算">
            <QuestionCircleOutlined style={{ marginLeft: 4, fontSize: 10 }} />
          </Tooltip>
        </span>
        <span style={{ color: textColor, fontWeight: 500, fontSize: 14 }}>
          ¥{valuation.dcfValue}
        </span>
      </div>
    </Card>
  )
}

export default memo(ValuationCard)
