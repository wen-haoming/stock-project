import { memo } from 'react'

/**
 * 影响标签组件
 */
const ImpactTag = memo(({ trend }) => {
  const colorMap = {
    '利好': '#389e0d',
    '利空': '#cf1322',
    '分化': '#d48806',
    '中性': '#8c8c8c',
  }
  
  return (
    <span style={{ 
      fontSize: 10, 
      color: colorMap[trend],
      fontWeight: 500,
      padding: '1px 4px',
      borderRadius: 2,
      backgroundColor: colorMap[trend] + '12',
    }}>
      {trend}
    </span>
  )
})

ImpactTag.displayName = 'ImpactTag'

export default ImpactTag
