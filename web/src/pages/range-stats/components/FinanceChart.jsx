import { memo, useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import { financeMetrics } from '@/constants/finance'

/**
 * 财务图表组件
 */
const FinanceChart = memo(({ data, metric, isMobile }) => {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)

  useEffect(() => {
    if (!chartRef.current || !data?.length) return

    if (chartInstanceRef.current) chartInstanceRef.current.dispose()
    
    const chart = echarts.init(chartRef.current)
    chartInstanceRef.current = chart

    const metricConfig = financeMetrics.find(m => m.key === metric)
    const categories = data.map(d => d.period)
    const values = data.map(d => d[metric])
    const yoyKey = metricConfig?.yoyKey
    const yoyValues = yoyKey ? data.map(d => d[yoyKey]) : null
    const hasYoy = yoyValues?.some(v => v !== null)

    chart.setOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params) => {
          let html = `<div style="font-weight:bold;margin-bottom:4px">${params[0].axisValue}</div>`
          params.forEach(p => {
            if (p.seriesName === metricConfig.label) {
              html += `<div>${p.marker}${p.seriesName}: ${p.value?.toFixed(2)}${metricConfig.unit}</div>`
            } else if (p.seriesName === '同比' && p.value !== null) {
              const color = p.value >= 0 ? '#ec5a5a' : '#47b262'
              html += `<div>${p.marker}<span style="color:${color}">同比: ${p.value >= 0 ? '+' : ''}${p.value?.toFixed(2)}%</span></div>`
            }
          })
          return html
        }
      },
      legend: { data: hasYoy ? [metricConfig.label, '同比'] : [metricConfig.label], top: 0, right: 0, textStyle: { fontSize: 11 } },
      grid: { left: 50, right: hasYoy ? 50 : 20, top: 35, bottom: 50 },
      dataZoom: [{ type: 'slider', show: true, xAxisIndex: [0], start: Math.max(0, 100 - (10 / data.length * 100)), end: 100, height: 20, bottom: 5 }],
      xAxis: { type: 'category', data: categories, axisLabel: { fontSize: 10, rotate: 45 } },
      yAxis: [
        { type: 'value', name: metricConfig.unit, nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { type: 'dashed' } } },
        hasYoy ? { type: 'value', name: '%', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 }, splitLine: { show: false } } : null
      ].filter(Boolean),
      series: [
        {
          name: metricConfig.label,
          type: 'bar',
          data: values,
          itemStyle: { color: (params) => ['npm', 'gpm', 'roe', 'dar'].includes(metric) ? '#1890ff' : (values[params.dataIndex] >= 0 ? '#1890ff' : '#47b262') }
        },
        hasYoy ? { name: '同比', type: 'line', yAxisIndex: 1, data: yoyValues, symbol: 'circle', symbolSize: 4, lineStyle: { color: '#ff7a45' }, itemStyle: { color: '#ff7a45' } } : null
      ].filter(Boolean)
    })

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [data, metric])

  return <div ref={chartRef} style={{ height: isMobile ? 220 : 280 }} />
})

FinanceChart.displayName = 'FinanceChart'

export default FinanceChart
