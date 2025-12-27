import { memo, useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import { upColor, downColor } from '@/utils/chart'

/**
 * 股票K线图组件
 */
const StockKlineChart = memo(({ data, stockName, isMobile, dateRange }) => {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)

  useEffect(() => {
    if (!chartRef.current || !data?.values?.length) return

    if (chartInstanceRef.current) chartInstanceRef.current.dispose()
    
    const chart = echarts.init(chartRef.current)
    chartInstanceRef.current = chart

    // 计算 dataZoom 的起止位置
    let startValue, endValue
    if (dateRange?.[0] && dateRange?.[1]) {
      const startDate = dateRange[0].format('YYYY-MM-DD')
      const endDate = dateRange[1].format('YYYY-MM-DD')
      startValue = startDate
      endValue = endDate
    }

    chart.setOption({
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      grid: [
        { left: 50, right: 10, top: 10, bottom: '28%' },
        { left: 50, right: 10, top: '75%', bottom: 50 }
      ],
      xAxis: [
        { type: 'category', data: data.categoryData, boundaryGap: false, axisLine: { onZero: false }, splitLine: { show: false } },
        { type: 'category', gridIndex: 1, data: data.categoryData, boundaryGap: false, axisLine: { onZero: false }, axisLabel: { show: false } }
      ],
      yAxis: [
        { scale: true, splitArea: { show: true } },
        { scale: true, gridIndex: 1, axisLabel: { show: false }, axisLine: { show: false }, splitLine: { show: false } }
      ],
      dataZoom: [
        {
          type: 'slider',
          xAxisIndex: [0, 1],
          startValue,
          endValue,
          bottom: 10,
          height: 30,
          borderColor: 'transparent',
          backgroundColor: '#f5f5f5',
          fillerColor: 'rgba(24, 144, 255, 0.2)',
          handleStyle: { color: '#1890ff' },
          moveHandleSize: 10,
          zoomLock: false,
          brushSelect: true,
        },
        {
          type: 'inside',
          xAxisIndex: [0, 1],
          zoomOnMouseWheel: 'shift',
        }
      ],
      visualMap: {
        show: false,
        seriesIndex: 1,
        dimension: 2,
        pieces: [{ value: 1, color: downColor }, { value: -1, color: upColor }]
      },
      series: [
        {
          name: stockName,
          type: 'candlestick',
          data: data.values,
          itemStyle: { color: upColor, color0: downColor, borderColor: 'transparent', borderColor0: 'transparent', borderWidth: 0 }
        },
        { name: 'Volume', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: data.volumes }
      ]
    })

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [data, stockName, dateRange])

  return <div ref={chartRef} style={{ height: isMobile ? 250 : 350 }} />
})

StockKlineChart.displayName = 'StockKlineChart'

export default StockKlineChart
