import { useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react'
import * as echarts from 'echarts'

// ECharts 颜色配置
const upColor = '#ec5a5a'
const downColor = '#47b262'

// 计算均线
export const calculateMA = (dayCount, data) => {
  const result = []
  for (let i = 0; i < data.length; i++) {
    if (i < dayCount) {
      result.push('-')
      continue
    }
    let sum = 0
    for (let j = 0; j < dayCount; j++) {
      sum += data[i - j][1]
    }
    result.push(+(sum / dayCount).toFixed(2))
  }
  return result
}

// 解析 K 线原始数据
export const parseKlineData = (rawData) => {
  const categoryData = []
  const values = []
  const volumes = []

  rawData.forEach((item, idx) => {
    const fields = item.split(',')
    categoryData.push(fields[0])
    const open = parseFloat(fields[1])
    const close = parseFloat(fields[2])
    values.push([open, close, parseFloat(fields[4]), parseFloat(fields[3])])
    volumes.push([idx, parseInt(fields[5]), open > close ? 1 : -1])
  })

  return { categoryData, values, volumes }
}

/**
 * 通用 K 线图组件
 * 
 * @param {Object} props
 * @param {Object} props.data - K线数据 { categoryData, values, volumes }
 * @param {string} props.title - 图表标题
 * @param {number} props.height - 图表高度
 * @param {boolean} props.showVolume - 是否显示成交量
 * @param {boolean} props.showMA - 是否显示均线
 * @param {boolean} props.enableBrush - 是否启用框选
 * @param {Function} props.onBrushSelected - 框选回调
 * @param {Array} props.overlayLines - 叠加线数据 [{ name, data, color, yAxisIndex }]
 * @param {Array} props.extraYAxis - 额外Y轴配置
 */
const KlineChart = forwardRef(({
  data = { categoryData: [], values: [], volumes: [] },
  title = '',
  height = 400,
  showVolume = true,
  showMA = true,
  enableBrush = false,
  onBrushSelected,
  overlayLines = [],
  extraYAxis = [],
  style = {},
}, ref) => {
  const containerRef = useRef(null)
  const chartRef = useRef(null)

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    getChart: () => chartRef.current,
    resize: () => chartRef.current?.resize(),
    setBrushArea: (startIdx, endIdx) => {
      if (chartRef.current) {
        chartRef.current.dispatchAction({
          type: 'brush',
          areas: [{
            brushType: 'lineX',
            coordRange: [startIdx, endIdx],
            xAxisIndex: 0
          }]
        })
      }
    },
    clearBrush: () => {
      if (chartRef.current) {
        chartRef.current.dispatchAction({ type: 'brush', command: 'clear', areas: [] })
      }
    }
  }))

  // 生成图表配置
  const getOption = useCallback(() => {
    const { categoryData, values, volumes } = data
    if (!categoryData.length) return null

    // 基础 grid 配置
    const grids = [
      { left: '8%', right: extraYAxis.length ? '12%' : '3%', top: 60, height: showVolume ? '50%' : '70%' },
    ]
    if (showVolume) {
      grids.push({ left: '8%', right: extraYAxis.length ? '12%' : '3%', top: '75%', height: '15%' })
    }

    // X轴配置
    const xAxes = [
      {
        type: 'category',
        data: categoryData,
        boundaryGap: false,
        axisLine: { onZero: false },
        splitLine: { show: false },
        min: 'dataMin',
        max: 'dataMax',
        axisLabel: { fontSize: 10 }
      }
    ]
    if (showVolume) {
      xAxes.push({
        type: 'category',
        gridIndex: 1,
        data: categoryData,
        boundaryGap: false,
        axisLine: { onZero: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        min: 'dataMin',
        max: 'dataMax'
      })
    }

    // Y轴配置
    const yAxes = [
      {
        scale: true,
        splitArea: { show: true },
        axisLabel: { fontSize: 10 },
        position: 'left'
      }
    ]
    if (showVolume) {
      yAxes.push({
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false }
      })
    }
    // 添加额外Y轴
    extraYAxis.forEach((axis, idx) => {
      yAxes.push({
        type: 'value',
        name: axis.name,
        position: 'right',
        offset: idx * 60,
        axisLine: { show: true, lineStyle: { color: axis.color || '#999' } },
        axisLabel: { fontSize: 10, color: axis.color || '#999' },
        splitLine: { show: false },
        scale: true,
      })
    })

    // 系列配置
    const series = [
      {
        name: 'K线',
        type: 'candlestick',
        data: values,
        itemStyle: {
          color: upColor,
          color0: downColor,
          borderColor: upColor,
          borderColor0: downColor
        }
      }
    ]

    // 均线
    if (showMA && values.length > 0) {
      const maConfigs = [
        { day: 5, color: '#f5a623' },
        { day: 10, color: '#7ed321' },
        { day: 20, color: '#4a90e2' },
        { day: 60, color: '#9013fe' }
      ]
      maConfigs.forEach(({ day, color }) => {
        series.push({
          name: `MA${day}`,
          type: 'line',
          data: calculateMA(day, values),
          smooth: true,
          lineStyle: { width: 1, opacity: 0.8 },
          itemStyle: { color },
          symbol: 'none'
        })
      })
    }

    // 成交量
    if (showVolume) {
      series.push({
        name: '成交量',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: volumes
      })
    }

    // 叠加线
    overlayLines.forEach((line) => {
      series.push({
        name: line.name,
        type: 'line',
        data: line.data,
        yAxisIndex: line.yAxisIndex ?? 0,
        smooth: true,
        lineStyle: { width: 2, color: line.color },
        itemStyle: { color: line.color },
        symbol: 'none'
      })
    })

    const option = {
      animation: false,
      title: title ? { text: title, left: 'center', textStyle: { fontSize: 14 } } : undefined,
      legend: {
        top: 10,
        left: 'center',
        data: ['K线', ...(showMA ? ['MA5', 'MA10', 'MA20', 'MA60'] : []), ...overlayLines.map(l => l.name)],
        textStyle: { fontSize: 10 },
        itemWidth: 14,
        itemHeight: 8
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#ccc',
        borderWidth: 1,
        textStyle: { color: '#333', fontSize: 11 },
        formatter: (params) => {
          if (!params || !params.length) return ''
          const date = params[0].axisValue
          let html = `<div style="font-weight:bold;margin-bottom:4px">${date}</div>`
          params.forEach(p => {
            if (p.seriesType === 'candlestick') {
              const [open, close, low, high] = p.data
              const color = close >= open ? upColor : downColor
              html += `<div style="color:${color}">开: ${open} 高: ${high} 低: ${low} 收: ${close}</div>`
            } else if (p.seriesName !== '成交量') {
              html += `<div><span style="color:${p.color}">●</span> ${p.seriesName}: ${typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</div>`
            }
          })
          return html
        }
      },
      axisPointer: {
        link: [{ xAxisIndex: 'all' }],
        label: { backgroundColor: '#777' }
      },
      toolbox: {
        feature: {
          dataZoom: { yAxisIndex: false },
          ...(enableBrush ? { brush: { type: ['lineX', 'clear'] } } : {})
        },
        right: 20,
        top: 5
      },
      grid: grids,
      xAxis: xAxes,
      yAxis: yAxes,
      dataZoom: [
        { type: 'inside', xAxisIndex: showVolume ? [0, 1] : [0], start: 0, end: 100 },
        { show: true, xAxisIndex: showVolume ? [0, 1] : [0], type: 'slider', top: '93%', start: 0, end: 100, height: 15 }
      ],
      series,
      visualMap: showVolume ? {
        show: false,
        seriesIndex: showMA ? 5 : 1,
        dimension: 2,
        pieces: [
          { value: 1, color: downColor },
          { value: -1, color: upColor }
        ]
      } : undefined
    }

    // 框选配置
    if (enableBrush) {
      option.brush = {
        xAxisIndex: 'all',
        brushLink: 'all',
        outOfBrush: { colorAlpha: 0.3 },
        brushStyle: { borderWidth: 1, color: 'rgba(24,144,255,0.2)', borderColor: '#1890ff' }
      }
    }

    return option
  }, [data, title, showVolume, showMA, enableBrush, overlayLines, extraYAxis])

  // 初始化图表
  useEffect(() => {
    if (!containerRef.current) return

    const chart = echarts.init(containerRef.current)
    chartRef.current = chart

    // 框选事件
    if (enableBrush && onBrushSelected) {
      chart.on('brushEnd', (params) => {
        if (params.areas && params.areas.length > 0) {
          const area = params.areas[0]
          if (area.coordRange) {
            const [startIdx, endIdx] = area.coordRange
            const { categoryData } = data
            if (categoryData[startIdx] && categoryData[endIdx]) {
              onBrushSelected({
                startDate: categoryData[startIdx],
                endDate: categoryData[endIdx],
                startIdx,
                endIdx
              })
            }
          }
        }
      })
    }

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [enableBrush])

  // 更新图表
  useEffect(() => {
    if (!chartRef.current) return
    const option = getOption()
    if (option) {
      chartRef.current.setOption(option, true)
    }
  }, [getOption])

  return (
    <div 
      ref={containerRef} 
      style={{ width: '100%', height, ...style }} 
    />
  )
})

KlineChart.displayName = 'KlineChart'

export default KlineChart
