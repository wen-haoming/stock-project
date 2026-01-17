/**
 * 数据源状态显示组件
 * 显示当前使用的数据源（LongPort 或东方财富）
 */
import { useState, useEffect } from 'react'
import { Tag, Tooltip } from 'antd'
import { ApiOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { getCurrentDataSource, DATA_SOURCE_NAMES, type DataSource } from '@/utils/dataSourceAdapter'

interface DataSourceBadgeProps {
  style?: React.CSSProperties
  showIcon?: boolean
  showTooltip?: boolean
}

export function DataSourceBadge({ 
  style = {}, 
  showIcon = true, 
  showTooltip = true 
}: DataSourceBadgeProps) {
  const [dataSource, setDataSource] = useState<DataSource>('eastmoney')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCurrentDataSource().then(source => {
      setDataSource(source)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return null
  }

  const badge = (
    <Tag 
      icon={showIcon ? <ApiOutlined /> : undefined}
      color={dataSource === 'longport' ? 'blue' : 'default'}
      style={style}
    >
      {DATA_SOURCE_NAMES[dataSource]}
    </Tag>
  )

  if (!showTooltip) {
    return badge
  }

  const tooltipContent = dataSource === 'longport' 
    ? 'LongPort 提供专业级行情数据，支持港股、美股和A股实时行情'
    : '东方财富提供A股基础行情数据'

  return (
    <Tooltip title={tooltipContent}>
      {badge}
    </Tooltip>
  )
}

/**
 * Hook：获取当前数据源
 */
export function useDataSource() {
  const [dataSource, setDataSource] = useState<DataSource>('eastmoney')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCurrentDataSource().then(source => {
      setDataSource(source)
      setLoading(false)
    })
  }, [])

  return { dataSource, loading }
}
