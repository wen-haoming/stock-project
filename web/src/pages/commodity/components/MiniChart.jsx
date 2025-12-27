import { memo, useEffect, useRef } from 'react'
import * as echarts from 'echarts'

/**
 * 迷你图表组件
 */
const MiniChart = memo(({ data, color, height = 40 }) => {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)

  useEffect(() => {
    if (!chartRef.current || !data?.prices?.length) return

    if (chartInstanceRef.current) chartInstanceRef.current.dispose()
    
    const chart = echarts.init(chartRef.current)
    chartInstanceRef.current = chart

    chart.setOption({
      animation: false,
      grid: { left: 0, right: 0, top: 2, bottom: 2 },
      xAxis: { type: 'category', data: data.dates, show: false },
      yAxis: { type: 'value', show: false, scale: true },
      series: [{
        type: 'line',
        data: data.prices,
        smooth: true,
        symbol: 'none',
        lineStyle: { color, width: 1.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: color + '30' },
            { offset: 1, color: color + '05' }
          ])
        }
      }]
    })

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [data, color])

  return <div ref={chartRef} style={{ height }} />
})

MiniChart.displayName = 'MiniChart'

export default MiniChart
