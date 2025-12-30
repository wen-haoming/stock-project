import { memo, useEffect, useRef } from 'react'
import * as echarts from 'echarts'

/**
 * 详情图表组件 - 支持K线图、折线图和分时图
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
    const isTrend = chartType === 'trend' || data?.isTrend

    let option

    if (isTrend) {
      // 分时图配置
      const preClose = data.preClose || data.prices[0]
      const series = [
        {
          type: 'line',
          data: data.prices,
          smooth: false,
          symbol: 'none',
          lineStyle: { color, width: 1.5 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: color + '30' },
              { offset: 1, color: color + '05' }
            ])
          }
        }
      ]
      
      // 均价线
      if (data.avgPrices?.length) {
        series.push({
          type: 'line',
          data: data.avgPrices,
          smooth: false,
          symbol: 'none',
          lineStyle: { color: '#ffb800', width: 1 }
        })
      }

      option = {
        animation: true,
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(255,255,255,0.95)',
          borderColor: '#e8e8e8',
          borderWidth: 1,
          textStyle: { color: '#333', fontSize: 12 },
          formatter: (params) => {
            const p = params[0]
            const avgParam = params[1]
            const price = p?.value
            const changePct = preClose ? ((price - preClose) / preClose * 100) : 0
            const changeColor = changePct >= 0 ? '#cf1322' : '#389e0d'
            let html = `<div style="font-size:12px">
              <div style="color:#8c8c8c;margin-bottom:4px">${p?.name}</div>
              <div>价格: <span style="color:${changeColor};font-weight:600">${price?.toLocaleString()}</span></div>
              <div>涨跌: <span style="color:${changeColor}">${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%</span></div>`
            if (avgParam?.value) {
              html += `<div>均价: <span style="color:#ffb800">${avgParam.value?.toLocaleString()}</span></div>`
            }
            html += `</div>`
            return html
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
        series
      }

      // 添加昨收参考线
      if (preClose) {
        option.series[0].markLine = {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', color: '#999', width: 1 },
          label: { 
            show: true, 
            position: 'insideEndTop',
            formatter: `昨收: ${preClose}`,
            fontSize: 10,
            color: '#999'
          },
          data: [{ yAxis: preClose }]
        }
      }
    } else if (isKline) {
      // K线图配置
      option = {
        animation: true,
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(255,255,255,0.95)',
          borderColor: '#e8e8e8',
          borderWidth: 1,
          textStyle: { color: '#333', fontSize: 12 },
          axisPointer: { type: 'cross' },
          formatter: (params) => {
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
        series: [{
          type: 'candlestick',
          data: data.klines,
          itemStyle: {
            color: '#cf1322',
            color0: '#389e0d',
            borderColor: '#cf1322',
            borderColor0: '#389e0d'
          }
        }]
      }
    } else {
      // 折线图配置
      option = {
        animation: true,
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(255,255,255,0.95)',
          borderColor: '#e8e8e8',
          borderWidth: 1,
          textStyle: { color: '#333', fontSize: 12 },
          axisPointer: { type: 'line' },
          formatter: (params) => {
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
        series: [{
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
