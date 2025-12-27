import { memo, useEffect, useRef, useMemo } from 'react'
import * as echarts from 'echarts'
import { upColor, downColor } from '@/utils/chart'

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

// 计算BBI指标 (3, 6, 12, 24日均线的平均值)
const calculateBBI = (data) => {
  const ma3 = calculateMA(data, 3)
  const ma6 = calculateMA(data, 6)
  const ma12 = calculateMA(data, 12)
  const ma24 = calculateMA(data, 24)
  
  return data.map((_, i) => {
    if (ma3[i] === '-' || ma6[i] === '-' || ma12[i] === '-' || ma24[i] === '-') {
      return '-'
    }
    return ((parseFloat(ma3[i]) + parseFloat(ma6[i]) + parseFloat(ma12[i]) + parseFloat(ma24[i])) / 4).toFixed(2)
  })
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
 * 股票K线图组件
 */
const StockKlineChart = memo(({ data, stockName, isMobile }) => {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)

  // 计算指标数据（仅K线模式）
  const indicators = useMemo(() => {
    if (!data?.values?.length || data.isTrend) return null
    return {
      bbi: calculateBBI(data.values),
      ...calculateMACD(data.values)
    }
  }, [data])

  useEffect(() => {
    if (!chartRef.current || !data?.values?.length) return

    if (chartInstanceRef.current) chartInstanceRef.current.dispose()
    
    const chart = echarts.init(chartRef.current)
    chartInstanceRef.current = chart

    // 分时图配置
    if (data.isTrend) {
      const preClose = data.preClose || 0
      const prices = data.values.map(v => v[0])
      const minPrice = Math.min(...prices)
      const maxPrice = Math.max(...prices)
      const maxDiff = Math.max(Math.abs(maxPrice - preClose), Math.abs(minPrice - preClose))
      const yMin = preClose - maxDiff * 1.1
      const yMax = preClose + maxDiff * 1.1

      chart.setOption({
        animation: false,
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' },
          formatter: (params) => {
            const priceData = params.find(p => p.seriesName === '价格')
            const avgData = params.find(p => p.seriesName === '均价')
            const volData = params.find(p => p.seriesName === '成交量')
            if (!priceData) return ''
            
            const price = priceData.data
            const changePct = preClose ? ((price - preClose) / preClose * 100).toFixed(2) : '-'
            const color = price >= preClose ? upColor : downColor
            
            let html = `<div style="font-size:12px">`
            html += `<div style="font-weight:bold;margin-bottom:4px">${priceData.axisValue}</div>`
            html += `<div>价格: <span style="color:${color}">${price.toFixed(2)}</span></div>`
            html += `<div>涨跌: <span style="color:${color}">${changePct}%</span></div>`
            if (avgData) html += `<div>均价: ${avgData.data.toFixed(2)}</div>`
            if (volData) html += `<div>成交量: ${(volData.data[1] / 10000).toFixed(0)}万</div>`
            html += `</div>`
            return html
          }
        },
        grid: [
          { left: 50, right: 10, top: 20, height: '60%' },
          { left: 50, right: 10, top: '75%', height: '18%' }
        ],
        xAxis: [
          { 
            type: 'category', 
            data: data.categoryData, 
            boundaryGap: false,
            axisLine: { onZero: false },
            axisLabel: { show: true, fontSize: 10 },
            splitLine: { show: false }
          },
          { 
            type: 'category', 
            gridIndex: 1, 
            data: data.categoryData, 
            boundaryGap: false,
            axisLabel: { show: false },
            splitLine: { show: false }
          }
        ],
        yAxis: [
          { 
            scale: true, 
            min: yMin,
            max: yMax,
            splitArea: { show: true },
            axisLabel: {
              formatter: (value) => {
                const pct = preClose ? ((value - preClose) / preClose * 100).toFixed(2) : '0'
                return `${value.toFixed(2)}\n${pct}%`
              }
            }
          },
          { 
            scale: true, 
            gridIndex: 1, 
            axisLabel: { show: false }, 
            axisLine: { show: false }, 
            splitLine: { show: false } 
          }
        ],
        visualMap: {
          show: false,
          seriesIndex: 2,
          dimension: 2,
          pieces: [{ value: 1, color: downColor }, { value: -1, color: upColor }]
        },
        series: [
          {
            name: '价格',
            type: 'line',
            data: data.values.map(v => v[0]),
            symbol: 'none',
            lineStyle: { width: 1, color: '#2196f3' },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(33, 150, 243, 0.3)' },
                { offset: 1, color: 'rgba(33, 150, 243, 0.05)' }
              ])
            },
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { type: 'dashed', color: '#999' },
              data: [{ yAxis: preClose, label: { formatter: `昨收:${preClose.toFixed(2)}` } }]
            }
          },
          {
            name: '均价',
            type: 'line',
            data: data.values.map(v => v[1]),
            symbol: 'none',
            lineStyle: { width: 1, color: '#ff9800' }
          },
          {
            name: '成交量',
            type: 'bar',
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: data.volumes,
            barWidth: '60%'
          }
        ]
      })
    } else {
      // K线图配置
      chart.setOption({
        animation: false,
        tooltip: {
          trigger: 'axis',
          axisPointer: { 
            type: 'cross',
            crossStyle: { color: '#999' }
          },
          formatter: (params) => {
            const kline = params.find(p => p.seriesName === stockName)
            if (!kline) return ''
            const [open, close, low, high] = kline.data
            const volume = params.find(p => p.seriesName === 'Volume')
            const bbi = params.find(p => p.seriesName === 'BBI')
            const dif = params.find(p => p.seriesName === 'DIF')
            const dea = params.find(p => p.seriesName === 'DEA')
            const macdBar = params.find(p => p.seriesName === 'MACD')
            
            let html = `<div style="font-size:12px">`
            html += `<div style="font-weight:bold;margin-bottom:4px">${kline.axisValue}</div>`
            html += `<div>开: <span style="color:${close >= open ? upColor : downColor}">${open}</span></div>`
            html += `<div>收: <span style="color:${close >= open ? upColor : downColor}">${close}</span></div>`
            html += `<div>高: <span style="color:${upColor}">${high}</span></div>`
            html += `<div>低: <span style="color:${downColor}">${low}</span></div>`
            if (volume) html += `<div>成交量: ${(volume.data[1] / 10000).toFixed(0)}万</div>`
            if (bbi && bbi.data !== '-') html += `<div style="color:#ff9800">BBI: ${bbi.data}</div>`
            if (dif && dif.data !== '-') html += `<div style="color:#2196f3">DIF: ${dif.data}</div>`
            if (dea && dea.data !== '-') html += `<div style="color:#ff5722">DEA: ${dea.data}</div>`
            if (macdBar && macdBar.data !== '-') html += `<div>MACD: ${macdBar.data}</div>`
            html += `</div>`
            return html
          }
        },
        axisPointer: {
          link: [{ xAxisIndex: 'all' }],
          label: { backgroundColor: '#777' }
        },
        legend: {
          data: [stockName, 'BBI'],
          top: 0,
          left: 'center',
          itemWidth: 14,
          itemHeight: 10,
          textStyle: { fontSize: 11 }
        },
        grid: [
          { left: 50, right: 10, top: 30, height: '45%' },
          { left: 50, right: 10, top: '58%', height: '12%' },
          { left: 50, right: 10, top: '73%', height: '18%' }
        ],
        xAxis: [
          { 
            type: 'category', 
            data: data.categoryData, 
            boundaryGap: true,
            axisLine: { onZero: false }, 
            splitLine: { show: false },
            axisLabel: { show: false },
            axisPointer: { z: 100 }
          },
          { 
            type: 'category', 
            gridIndex: 1, 
            data: data.categoryData, 
            boundaryGap: true,
            axisLine: { onZero: false }, 
            axisLabel: { show: false },
            splitLine: { show: false },
            axisPointer: { show: true }
          },
          { 
            type: 'category', 
            gridIndex: 2, 
            data: data.categoryData, 
            boundaryGap: true,
            axisLine: { onZero: false },
            splitLine: { show: false },
            axisPointer: { show: true }
          }
        ],
        yAxis: [
          { 
            scale: true, 
            splitArea: { show: true }, 
            splitNumber: 4,
            axisPointer: { show: true }
          },
          { 
            scale: true, 
            gridIndex: 1, 
            axisLabel: { 
              show: true,
              fontSize: 9,
              formatter: (v) => v >= 100000000 ? (v / 100000000).toFixed(0) + '亿' : (v / 10000).toFixed(0) + '万'
            }, 
            axisLine: { show: false }, 
            splitLine: { show: false },
            axisPointer: { show: true, label: { formatter: (p) => (p.value / 10000).toFixed(0) + '万' } }
          },
          { 
            scale: true, 
            gridIndex: 2, 
            splitNumber: 2, 
            axisLabel: { fontSize: 10 }, 
            splitLine: { show: true, lineStyle: { type: 'dashed' } },
            axisPointer: { show: true }
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
        series: [
          {
            name: stockName,
            type: 'candlestick',
            data: data.values,
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
            name: 'BBI',
            type: 'line',
            data: indicators?.bbi || [],
            smooth: true,
            symbol: 'none',
            lineStyle: { width: 1, color: '#ff9800' }
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

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [data, stockName, indicators])

  return <div ref={chartRef} style={{ height: isMobile ? 380 : 450 }} />
})

StockKlineChart.displayName = 'StockKlineChart'

export default StockKlineChart
