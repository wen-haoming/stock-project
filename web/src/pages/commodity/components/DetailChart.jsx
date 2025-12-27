import { memo, useEffect, useRef } from 'react'
import * as echarts from 'echarts'

/**
 * 详情图表组件 - 支持K线图和折线图
 */
const DetailChart = memo(({ data, color, chartType = 'line' }) => {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)

  useEffect(() => {
    if (!chartRef.current || !data?.prices?.length) return

    if (chartInstanceRef.current) chartInstanceRef.current.dispose()
    
    const chart = echarts.init(chartRef.current)
    chartInstanceRef.current = chart

    const isKline = chartType === 'kline' && data?.klines?.length

    const option = {
      animation: true,
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderColor: '#e8e8e8',
        borderWidth: 1,
        textStyle: { color: '#333', fontSize: 12 },
        axisPointer: isKline ? { type: 'cross' } : { type: 'line' },
        formatter: isKline ? (params) => {
          const p = params[0]
          if (!p || !p.data) return ''
          const [open, close, low, high] = p.data
          const changeColor = close >= open ? '#cf1322' : '#389e0d'
          return `<div style="font-size:12px">
            <div style="color:#8c8c8c;margin-bottom:4px">${p.name}</div>
            <div>开: <span style="color:${changeColor}">${open?.toLocaleString()}</span></div>
            <div>收: <span style="color:${changeColor};font-weight:600">${close?.toLocaleString()}</span></div>
            <div>高: <span style="color:#cf1322">${high?.toLocaleString()}</span></div>
            <div>低: <span style="color:#389e0d">${low?.toLocaleString()}</span></div>
          </div>`
        } : (params) => {
          const p = params[0]
          return `<div style="font-size:12px">
            <div style="color:#8c8c8c">${p.name}</div>
            <div style="font-weight:600;color:${color}">${p.value?.toLocaleString()}</div>
          </div>`
        }
      },
      grid: { left: 60, right: 20, top: 20, bottom: 30 },
      xAxis: { 
        type: 'category', 
        data: data.dates,
        axisLine: { lineStyle: { color: '#e8e8e8' } },
        axisTick: { show: false },
        axisLabel: { color: '#8c8c8c', fontSize: 10 }
      },
      yAxis: { 
        type: 'value', 
        scale: true,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#f5f5f5' } },
        axisLabel: { color: '#8c8c8c', fontSize: 10 }
      },
      series: isKline ? [{
        type: 'candlestick',
        data: data.klines,
        itemStyle: {
          color: '#cf1322',
          color0: '#389e0d',
          borderColor: '#cf1322',
          borderColor0: '#389e0d'
        }
      }] : [{
        type: 'line',
        data: data.prices,
        smooth: true,
        symbol: 'none',
        lineStyle: { color, width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: color + '40' },
            { offset: 1, color: color + '05' }
          ])
        }
      }]
    }

    chart.setOption(option)

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [data, color, chartType])

  return <div ref={chartRef} style={{ height: 280 }} />
})

DetailChart.displayName = 'DetailChart'

export default DetailChart
