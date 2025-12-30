import { memo, useEffect, useRef, useMemo } from 'react'
import * as echarts from 'echarts'
import { useTheme, getEChartsTheme } from '../../../contexts/ThemeContext'

const upColor = '#cf1322'
const downColor = '#389e0d'

// 计算MA均线
const calculateMA = (data, period) => {
  const result = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push('-')
    } else {
      let sum = 0
      for (let j = 0; j < period; j++) {
        sum += data[i - j][1] // 收盘价
      }
      result.push((sum / period).toFixed(2))
    }
  }
  return result
}

// 计算MACD指标
const calculateMACD = (data, short = 12, long = 26, signal = 9) => {
  const closes = data.map(d => d[1]) // 收盘价
  const dif = []
  const dea = []
  const macd = []
  
  let emaShort = closes[0]
  let emaLong = closes[0]
  let emaDea = 0
  
  const shortMultiplier = 2 / (short + 1)
  const longMultiplier = 2 / (long + 1)
  const signalMultiplier = 2 / (signal + 1)
  
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      emaShort = closes[i]
      emaLong = closes[i]
    } else {
      emaShort = (closes[i] - emaShort) * shortMultiplier + emaShort
      emaLong = (closes[i] - emaLong) * longMultiplier + emaLong
    }
    
    const difValue = emaShort - emaLong
    dif.push(difValue.toFixed(2))
    
    if (i === 0) {
      emaDea = difValue
    } else {
      emaDea = (difValue - emaDea) * signalMultiplier + emaDea
    }
    dea.push(emaDea.toFixed(2))
    
    const macdValue = (difValue - emaDea) * 2
    macd.push(macdValue.toFixed(2))
  }
  
  return { dif, dea, macd }
}

/**
 * 大宗商品K线图组件
 */
const CommodityKlineChart = memo(({ data, color, isTrend = false }) => {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)
  const { isDark } = useTheme()
  const echartsTheme = getEChartsTheme(isDark)

  // 计算指标数据
  const indicators = useMemo(() => {
    if (!data?.klines?.length || isTrend) return null
    return {
      ma5: calculateMA(data.klines, 5),
      ma10: calculateMA(data.klines, 10),
      ma20: calculateMA(data.klines, 20),
      ...calculateMACD(data.klines),
    }
  }, [data, isTrend])

  useEffect(() => {
    if (!chartRef.current || !data?.prices?.length) return

    // 延迟初始化，确保 DOM 有宽高
    const timer = setTimeout(() => {
      if (!chartRef.current) return
      
      // 检查 DOM 是否有宽高
      if (chartRef.current.clientWidth === 0 || chartRef.current.clientHeight === 0) return
      
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose()
        chartInstanceRef.current = null
      }
      
      const chart = echarts.init(chartRef.current)
      chartInstanceRef.current = chart

    // 分时图配置
    if (isTrend) {
      const preClose = data.preClose || data.prices[0]
      const prices = data.prices
      const minPrice = Math.min(...prices)
      const maxPrice = Math.max(...prices)
      const maxDiff = Math.max(Math.abs(maxPrice - preClose), Math.abs(minPrice - preClose), preClose * 0.01)
      const yMin = preClose - maxDiff * 1.1
      const yMax = preClose + maxDiff * 1.1
      const pctRange = ((yMax - preClose) / preClose * 100).toFixed(2)

      chart.setOption({
        animation: false,
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' },
          ...echartsTheme.tooltip,
          formatter: (params) => {
            const priceData = params.find(p => p.seriesName === '价格')
            const avgData = params.find(p => p.seriesName === '均价')
            if (!priceData || priceData.data == null) return ''
            
            const price = priceData.data
            const changePct = preClose ? ((price - preClose) / preClose * 100).toFixed(2) : '-'
            const priceColor = price >= preClose ? upColor : downColor
            
            let html = `<div style="font-size:12px">`
            html += `<div style="font-weight:bold;margin-bottom:4px">${priceData.axisValue}</div>`
            html += `<div>价格: <span style="color:${priceColor}">${price.toFixed(2)}</span></div>`
            html += `<div>涨跌: <span style="color:${priceColor}">${changePct}%</span></div>`
            if (avgData && avgData.data != null) html += `<div style="color:#ffb800">均价: ${avgData.data.toFixed(2)}</div>`
            html += `</div>`
            return html
          }
        },
        axisPointer: {
          link: [{ xAxisIndex: 'all' }],
          label: { backgroundColor: isDark ? '#555' : '#777' }
        },
        grid: [
          { left: 60, right: 50, top: 20, height: '65%' },
          { left: 60, right: 50, top: '85%', height: '10%' }
        ],
        xAxis: [
          { 
            type: 'category', 
            data: data.dates, 
            boundaryGap: false,
            axisLine: { lineStyle: { color: echartsTheme.axisLine.lineStyle.color } },
            axisLabel: { show: true, fontSize: 10, color: echartsTheme.axisLabel.color, interval: 'auto' },
            splitLine: { show: false },
            axisTick: { show: false }
          },
          { 
            type: 'category', 
            gridIndex: 1, 
            data: data.dates, 
            boundaryGap: false,
            axisLine: { lineStyle: { color: echartsTheme.axisLine.lineStyle.color } },
            axisLabel: { show: false },
            splitLine: { show: false },
            axisTick: { show: false }
          }
        ],
        yAxis: [
          { 
            type: 'value',
            position: 'left',
            min: yMin,
            max: yMax,
            splitNumber: 4,
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { lineStyle: { color: echartsTheme.splitLine.lineStyle.color, type: 'dashed' } },
            axisLabel: {
              fontSize: 10,
              color: (value) => {
                if (value > preClose) return upColor
                if (value < preClose) return downColor
                return echartsTheme.axisLabel.color
              },
              formatter: (value) => value.toFixed(2)
            }
          },
          {
            type: 'value',
            position: 'right',
            min: -parseFloat(pctRange),
            max: parseFloat(pctRange),
            splitNumber: 4,
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: {
              fontSize: 10,
              color: (value) => {
                if (value > 0) return upColor
                if (value < 0) return downColor
                return echartsTheme.axisLabel.color
              },
              formatter: (value) => `${value.toFixed(2)}%`
            }
          },
          { 
            type: 'value',
            gridIndex: 1,
            min: 0,
            axisLabel: { show: false }, 
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { show: false }
          }
        ],
        visualMap: data.volumes?.length ? {
          show: false,
          seriesIndex: 2,
          dimension: 2,
          pieces: [{ value: 1, color: upColor }, { value: -1, color: downColor }]
        } : undefined,
        series: [
          {
            name: '价格',
            type: 'line',
            data: data.prices,
            symbol: 'none',
            lineStyle: { width: 1, color: '#1890ff' },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(24, 144, 255, 0.2)' },
                { offset: 1, color: 'rgba(24, 144, 255, 0.02)' }
              ])
            },
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { type: 'dashed', color: echartsTheme.axisLabel.color, width: 1 },
              label: { show: false },
              data: [{ yAxis: preClose }]
            }
          },
          data.avgPrices?.length ? {
            name: '均价',
            type: 'line',
            data: data.avgPrices,
            symbol: 'none',
            lineStyle: { width: 1, color: '#ffb800' }
          } : null,
          data.volumes?.length ? {
            name: '成交量',
            type: 'bar',
            xAxisIndex: 1,
            yAxisIndex: 2,
            data: data.volumes,
            barWidth: '80%'
          } : null
        ].filter(Boolean)
      })
    } else {
      // K线图配置
      chart.setOption({
        animation: false,
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' },
          ...echartsTheme.tooltip,
          formatter: (params) => {
            const kline = params.find(p => p.seriesType === 'candlestick')
            if (!kline) return ''
            
            // kline.data 可能是 [open, close, low, high] 或者带 index 的数组
            const klineData = Array.isArray(kline.data) ? kline.data : []
            // 从原始数据中获取 OHLC
            const dataIndex = kline.dataIndex
            const originalData = data.klines[dataIndex] || klineData
            const [open, close, low, high] = originalData
            
            const changeColor = close >= open ? upColor : downColor
            const changePct = open ? ((close - open) / open * 100).toFixed(2) : '-'
            
            let html = `<div style="font-size:12px">`
            html += `<div style="font-weight:bold;margin-bottom:4px">${kline.axisValue}</div>`
            html += `<div>开: ${open?.toLocaleString()}</div>`
            html += `<div>收: <span style="color:${changeColor};font-weight:600">${close?.toLocaleString()}</span></div>`
            html += `<div>高: <span style="color:${upColor}">${high?.toLocaleString()}</span></div>`
            html += `<div>低: <span style="color:${downColor}">${low?.toLocaleString()}</span></div>`
            html += `<div>涨跌: <span style="color:${changeColor}">${changePct}%</span></div>`
            html += `</div>`
            return html
          }
        },
        axisPointer: {
          link: [{ xAxisIndex: 'all' }],
          label: { backgroundColor: isDark ? '#555' : '#777' }
        },
        legend: {
          data: ['K线', 'MA5', 'MA10', 'MA20'],
          top: 0,
          left: 'center',
          itemWidth: 14,
          itemHeight: 10,
          textStyle: { fontSize: 11, color: echartsTheme.textStyle.color }
        },
        grid: [
          { left: 50, right: 10, top: 30, height: '40%' },
          { left: 50, right: 10, top: '54%', height: '12%' },
          { left: 50, right: 10, top: '70%', height: '18%' }
        ],
        xAxis: [
          { 
            type: 'category', 
            data: data.dates, 
            boundaryGap: true,
            axisLine: { onZero: false, lineStyle: { color: echartsTheme.axisLine.lineStyle.color } }, 
            splitLine: { show: false },
            axisLabel: { show: false }
          },
          { 
            type: 'category', 
            gridIndex: 1, 
            data: data.dates, 
            boundaryGap: true,
            axisLine: { onZero: false, lineStyle: { color: echartsTheme.axisLine.lineStyle.color } }, 
            axisLabel: { show: false },
            splitLine: { show: false }
          },
          { 
            type: 'category', 
            gridIndex: 2, 
            data: data.dates, 
            boundaryGap: true,
            axisLine: { onZero: false, lineStyle: { color: echartsTheme.axisLine.lineStyle.color } },
            splitLine: { show: false },
            axisLabel: { fontSize: 10, color: echartsTheme.axisLabel.color }
          }
        ],
        yAxis: [
          { 
            scale: true, 
            splitArea: { show: false }, 
            splitLine: { show: true, lineStyle: { color: echartsTheme.splitLine.lineStyle.color, type: 'dashed' } },
            splitNumber: 4,
            axisLabel: { fontSize: 10, color: echartsTheme.axisLabel.color }
          },
          { 
            scale: true, 
            gridIndex: 1, 
            axisLabel: { 
              show: true,
              fontSize: 9,
              color: echartsTheme.axisLabel.color,
              formatter: (v) => v >= 100000000 ? (v / 100000000).toFixed(0) + '亿' : (v / 10000).toFixed(0) + '万'
            }, 
            axisLine: { show: false }, 
            splitLine: { show: false },
            splitArea: { show: false }
          },
          { 
            scale: true, 
            gridIndex: 2, 
            splitNumber: 2, 
            axisLabel: { fontSize: 9, color: echartsTheme.axisLabel.color }, 
            splitLine: { show: true, lineStyle: { color: echartsTheme.splitLine.lineStyle.color, type: 'dashed' } },
            splitArea: { show: false }
          }
        ],
        dataZoom: [
          {
            type: 'inside',
            xAxisIndex: [0, 1, 2],
            start: 0,
            end: 100,
          }
        ],
        visualMap: {
          show: false,
          seriesIndex: 1,
          dimension: 2,
          pieces: [{ value: 1, color: downColor }, { value: -1, color: upColor }]
        },
        graphic: [
          {
            type: 'text',
            left: 55,
            top: '70%',
            style: {
              text: 'MACD(12,26,9)',
              fontSize: 10,
              fill: echartsTheme.textStyle.color
            },
            z: 100
          }
        ],
        series: [
          {
            name: 'K线',
            type: 'candlestick',
            data: data.klines,
            itemStyle: { 
              color: upColor, 
              color0: downColor, 
              borderColor: upColor, 
              borderColor0: downColor,
              borderWidth: 1
            }
          },
          { 
            name: 'Volume', 
            type: 'bar', 
            xAxisIndex: 1, 
            yAxisIndex: 1, 
            data: data.volumes,
            barWidth: '60%'
          },
          {
            name: 'MA5',
            type: 'line',
            data: indicators?.ma5 || [],
            smooth: true,
            symbol: 'none',
            lineStyle: { width: 1, color: '#ff9800' }
          },
          {
            name: 'MA10',
            type: 'line',
            data: indicators?.ma10 || [],
            smooth: true,
            symbol: 'none',
            lineStyle: { width: 1, color: '#2196f3' }
          },
          {
            name: 'MA20',
            type: 'line',
            data: indicators?.ma20 || [],
            smooth: true,
            symbol: 'none',
            lineStyle: { width: 1, color: '#e91e63' }
          },
          {
            name: 'DIF',
            type: 'line',
            xAxisIndex: 2,
            yAxisIndex: 2,
            data: indicators?.dif || [],
            symbol: 'none',
            lineStyle: { width: 1, color: '#2196f3' }
          },
          {
            name: 'DEA',
            type: 'line',
            xAxisIndex: 2,
            yAxisIndex: 2,
            data: indicators?.dea || [],
            symbol: 'none',
            lineStyle: { width: 1, color: '#ff5722' }
          },
          {
            name: 'MACD',
            type: 'bar',
            xAxisIndex: 2,
            yAxisIndex: 2,
            data: indicators?.macd || [],
            barWidth: '60%',
            itemStyle: {
              color: (params) => parseFloat(params.data) >= 0 ? upColor : downColor
            }
          }
        ]
      })
    }

    const handleResize = () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.resize()
      }
    }
    window.addEventListener('resize', handleResize)
    }, 100) // 延迟 100ms 确保 Drawer 动画完成
    
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', () => {})
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose()
        chartInstanceRef.current = null
      }
    }
  }, [data, color, isTrend, indicators, isDark, echartsTheme])

  return <div ref={chartRef} style={{ height: 400 }} />
})

CommodityKlineChart.displayName = 'CommodityKlineChart'

export default CommodityKlineChart
