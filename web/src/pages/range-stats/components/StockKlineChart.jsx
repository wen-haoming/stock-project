import { memo, useEffect, useRef, useMemo } from 'react'
import * as echarts from 'echarts'
import { upColor, downColor } from '@/utils/chart'
import { useTheme, getEChartsTheme } from '../../../contexts/ThemeContext'

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

// 计算EMA指数移动平均（通达信标准算法）
// EMA(X, N) = 2/(N+1) * X + (N-1)/(N+1) * EMA'
const calculateEMA = (prices, period) => {
  const result = []
  const k = 2 / (period + 1)
  
  // 找到第一个有效价格
  let firstValidIdx = -1
  for (let i = 0; i < prices.length; i++) {
    const price = typeof prices[i] === 'number' ? prices[i] : parseFloat(prices[i])
    if (!isNaN(price)) {
      firstValidIdx = i
      break
    }
  }
  
  if (firstValidIdx === -1) {
    return prices.map(() => '-')
  }
  
  for (let i = 0; i < prices.length; i++) {
    const price = typeof prices[i] === 'number' ? prices[i] : parseFloat(prices[i])
    
    if (i < firstValidIdx || isNaN(price)) {
      result.push('-')
      continue
    }
    
    if (i === firstValidIdx) {
      // 第一个有效值作为初始EMA
      result.push(price)
    } else {
      const prevEma = result[i - 1]
      if (prevEma === '-' || isNaN(prevEma)) {
        result.push(price)
      } else {
        // EMA = 2/(N+1) * Price + (N-1)/(N+1) * PrevEMA
        result.push(price * k + prevEma * (1 - k))
      }
    }
  }
  return result
}

// 计算双线战法指标
// 知行短期趋势线: EMA(EMA(C,10),10) - 双重EMA平滑
// 知行多空线: (MA(M1)+MA(M2)+MA(M3)+MA(M4))/4
const calculateZhixing = (data, m1 = 14, m2 = 28, m3 = 57, m4 = 114) => {
  const closes = data.map(d => d[1]) // 收盘价
  
  // 知行短期趋势线: EMA(EMA(C,10),10)
  const ema10 = calculateEMA(closes, 10)
  const shortTrend = calculateEMA(ema10, 10).map(v => 
    typeof v === 'number' ? v.toFixed(2) : '-'
  )
  
  // 知行多空线: (MA(M1)+MA(M2)+MA(M3)+MA(M4))/4
  const ma1 = calculateMA(data, m1)
  const ma2 = calculateMA(data, m2)
  const ma3 = calculateMA(data, m3)
  const ma4 = calculateMA(data, m4)
  
  const longShort = data.map((_, i) => {
    if (ma1[i] === '-' || ma2[i] === '-' || ma3[i] === '-' || ma4[i] === '-') {
      return '-'
    }
    return ((parseFloat(ma1[i]) + parseFloat(ma2[i]) + parseFloat(ma3[i]) + parseFloat(ma4[i])) / 4).toFixed(2)
  })
  
  return { shortTrend, longShort }
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

// 计算KDJ指标 (9,3,3)
const calculateKDJ = (data, n = 9, m1 = 3, m2 = 3) => {
  const k = []
  const d = []
  const j = []
  
  for (let i = 0; i < data.length; i++) {
    // 获取最近n天的最高价和最低价
    const start = Math.max(0, i - n + 1)
    let highestHigh = -Infinity
    let lowestLow = Infinity
    
    for (let idx = start; idx <= i; idx++) {
      const [, , low, high] = data[idx] // [open, close, low, high]
      if (high > highestHigh) highestHigh = high
      if (low < lowestLow) lowestLow = low
    }
    
    const close = data[i][1]
    
    // RSV = (收盘价 - 最低价) / (最高价 - 最低价) * 100
    const rsv = highestHigh === lowestLow ? 50 : ((close - lowestLow) / (highestHigh - lowestLow)) * 100
    
    // K = 2/3 * 前一日K + 1/3 * RSV
    // D = 2/3 * 前一日D + 1/3 * K
    // J = 3 * K - 2 * D
    const prevK = i > 0 ? k[i - 1] : 50
    const prevD = i > 0 ? d[i - 1] : 50
    
    const kValue = (2 / m1) * prevK + (1 / m1) * rsv
    const dValue = (2 / m2) * prevD + (1 / m2) * kValue
    const jValue = 3 * kValue - 2 * dValue
    
    k.push(parseFloat(kValue.toFixed(2)))
    d.push(parseFloat(dValue.toFixed(2)))
    j.push(parseFloat(jValue.toFixed(2)))
  }
  
  return { k, d, j }
}

// 计算知行洗盘短线指标
// 短期: 100*(C-LLV(L,N1))/(HHV(C,N1)-LLV(L,N1)) N1=3
// 中期: 100*(C-LLV(L,10))/(HHV(C,10)-LLV(L,10))
// 中长期: 100*(C-LLV(L,20))/(HHV(C,20)-LLV(L,20))
// 长期: 100*(C-LLV(L,N2))/(HHV(C,N2)-LLV(L,N2)) N2=21
const calculateXipan = (data, n1 = 3, n2 = 21) => {
  const len = data.length
  const shortLine = []  // 短期 - 白色
  const midLine = []    // 中期 - 黄色 (隐藏，仅用于计算)
  const midLongLine = [] // 中长期 - 洋红 (隐藏，仅用于计算)
  const longLine = []   // 长期 - 红色
  
  // 买入信号
  const fourZeroBuy = []   // 四线归零买 - 蓝色柱
  const whiteLow20Buy = [] // 白线下20买 - 青色柱
  const whiteCrossRedBuy = [] // 白穿红线买 - 绿色柱
  const whiteCrossYellowBuy = [] // 白穿黄线买 - 橙色柱
  
  // 辅助函数: LLV(L, N) - N周期内最低价的最小值
  const llv = (idx, period) => {
    let min = Infinity
    const start = Math.max(0, idx - period + 1)
    for (let i = start; i <= idx; i++) {
      const low = data[i][2] // low
      if (low < min) min = low
    }
    return min
  }
  
  // 辅助函数: HHV(C, N) - N周期内收盘价的最大值
  const hhvClose = (idx, period) => {
    let max = -Infinity
    const start = Math.max(0, idx - period + 1)
    for (let i = start; i <= idx; i++) {
      const close = data[i][1] // close
      if (close > max) max = close
    }
    return max
  }
  
  // 计算指标值
  const calcValue = (idx, period) => {
    const close = data[idx][1]
    const llvVal = llv(idx, period)
    const hhvVal = hhvClose(idx, period)
    const range = hhvVal - llvVal
    if (range === 0) return 50
    return 100 * (close - llvVal) / range
  }
  
  for (let i = 0; i < len; i++) {
    const shortVal = calcValue(i, n1)
    const midVal = calcValue(i, 10)
    const midLongVal = calcValue(i, 20)
    const longVal = calcValue(i, n2)
    
    shortLine.push(parseFloat(shortVal.toFixed(2)))
    midLine.push(parseFloat(midVal.toFixed(2)))
    midLongLine.push(parseFloat(midLongVal.toFixed(2)))
    longLine.push(parseFloat(longVal.toFixed(2)))
    
    // 四线归零买: 短期<=6 AND 中期<=6 AND 中长期<=6 AND 长期<=6
    const isFourZero = shortVal <= 6 && midVal <= 6 && midLongVal <= 6 && longVal <= 6
    fourZeroBuy.push(isFourZero ? -30 : null)
    
    // 白线下20买: 短期<=20 AND 长期>=60
    const isWhiteLow20 = shortVal <= 20 && longVal >= 60
    whiteLow20Buy.push(isWhiteLow20 ? -30 : null)
    
    // 白穿红线买: CROSS(短期,长期) AND 长期<20
    const prevShort = i > 0 ? shortLine[i - 1] : 0
    const prevLong = i > 0 ? longLine[i - 1] : 0
    const isCrossRed = prevShort <= prevLong && shortVal > longVal && longVal < 20
    whiteCrossRedBuy.push(isCrossRed ? -30 : null)
    
    // 白穿黄线买: CROSS(短期,中期) AND 中期<30
    const prevMid = i > 0 ? midLine[i - 1] : 0
    const isCrossYellow = prevShort <= prevMid && shortVal > midVal && midVal < 30
    whiteCrossYellowBuy.push(isCrossYellow ? -30 : null)
  }
  
  return {
    shortLine,
    longLine,
    fourZeroBuy,
    whiteLow20Buy,
    whiteCrossRedBuy,
    whiteCrossYellowBuy
  }
}

// 生成完整的交易时间轴
const generateFullTimeAxis = (market = 'a') => {
  const times = []
  if (market === 'hk') {
    // 港股: 09:30-12:00, 13:00-16:00
    for (let h = 9; h <= 11; h++) {
      for (let m = (h === 9 ? 30 : 0); m < 60; m++) {
        times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      }
    }
    times.push('12:00')
    for (let h = 13; h <= 15; h++) {
      for (let m = 0; m < 60; m++) {
        times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      }
    }
    times.push('16:00')
  } else {
    // A股: 09:30-11:30, 13:00-15:00
    for (let h = 9; h <= 11; h++) {
      for (let m = (h === 9 ? 30 : 0); m < 60; m++) {
        if (h === 11 && m > 30) break
        times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      }
    }
    for (let h = 13; h <= 14; h++) {
      for (let m = 0; m < 60; m++) {
        times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      }
    }
    times.push('15:00')
  }
  return times
}

/**
 * 股票K线图组件
 * @param {boolean} showZhixing - 是否显示双线战法指标
 */
const StockKlineChart = memo(({ data, stockName, isMobile, market = 'a', showZhixing = false }) => {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)
  const { isDark } = useTheme()
  const echartsTheme = getEChartsTheme(isDark)
  
  // 用 ref 保存最新值，避免 useEffect 依赖变化导致重建图表
  const showZhixingRef = useRef(showZhixing)
  showZhixingRef.current = showZhixing

  // 计算所有指标数据（始终计算，避免切换时重新计算）
  const indicators = useMemo(() => {
    if (!data?.values?.length || data.isTrend) return null
    const zhixing = calculateZhixing(data.values)
<<<<<<< HEAD
    const kdj = calculateKDJ(data.values)
    const xipan = calculateXipan(data.values)
=======
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
    return {
      bbi: calculateBBI(data.values),
      zhixingShort: zhixing.shortTrend,
      zhixingLong: zhixing.longShort,
<<<<<<< HEAD
      ...calculateMACD(data.values),
      kdjK: kdj.k,
      kdjD: kdj.d,
      kdjJ: kdj.j,
      // 知行洗盘短线
      xipanShort: xipan.shortLine,
      xipanLong: xipan.longLine,
      xipanFourZero: xipan.fourZeroBuy,
      xipanWhiteLow20: xipan.whiteLow20Buy,
      xipanCrossRed: xipan.whiteCrossRedBuy,
      xipanCrossYellow: xipan.whiteCrossYellowBuy,
=======
      ...calculateMACD(data.values)
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
    }
  }, [data])
  
  const indicatorsRef = useRef(indicators)
  indicatorsRef.current = indicators

  // 仅切换指标时更新 series（不重建图表）
  useEffect(() => {
    if (!chartInstanceRef.current || !indicators || data?.isTrend) return
    
<<<<<<< HEAD
    // 获取当前 dataZoom 状态（注意 getOption 可能返回 null 或空数组）
    const option = chartInstanceRef.current.getOption()
    if (!option) return
    const dataZoomArr = option.dataZoom
    const currentZoom = (dataZoomArr && dataZoomArr.length > 0) ? dataZoomArr[0] : { start: 0, end: 100 }
=======
    // 获取当前 dataZoom 状态
    const option = chartInstanceRef.current.getOption()
    const currentZoom = option.dataZoom?.[0] || { start: 0, end: 100 }
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c

    // 构建指标 series
    const indicatorSeries = showZhixing ? [
      {
        name: '短期趋势',
        type: 'line',
        data: indicators.zhixingShort,
        smooth: false,
        symbol: 'none',
<<<<<<< HEAD
        lineStyle: { width: 1.5, color: '#00e676' }  // 绿色
=======
        lineStyle: { width: 1, color: '#ffffff' }
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
      },
      {
        name: '多空线',
        type: 'line',
        data: indicators.zhixingLong,
        smooth: false,
        symbol: 'none',
<<<<<<< HEAD
        lineStyle: { width: 1.5, color: '#ff9800' }  // 橙色
=======
        lineStyle: { width: 1, color: '#ffff00' }
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
      }
    ] : [
      {
        name: 'BBI',
        type: 'line',
        data: indicators.bbi,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1, color: '#ff9800' }
      }
    ]

    chartInstanceRef.current.setOption({
      legend: {
        data: showZhixing ? [stockName, '短期趋势', '多空线'] : [stockName, 'BBI'],
      },
      dataZoom: [{ start: currentZoom.start, end: currentZoom.end }],
      series: [
        { name: stockName, type: 'candlestick', data: data.values },
<<<<<<< HEAD
        { name: 'Volume', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: data.volumes },
        // KDJ 指标
        { name: 'K', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: indicators.kdjK },
        { name: 'D', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: indicators.kdjD },
        { name: 'J', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: indicators.kdjJ },
        ...indicatorSeries,
        { name: 'DIF', type: 'line', xAxisIndex: 3, yAxisIndex: 3, data: indicators.dif },
        { name: 'DEA', type: 'line', xAxisIndex: 3, yAxisIndex: 3, data: indicators.dea },
        { name: 'MACD', type: 'bar', xAxisIndex: 3, yAxisIndex: 3, data: indicators.macd },
        // 知行洗盘短线
        { name: '短期', type: 'line', xAxisIndex: 4, yAxisIndex: 4, data: indicators.xipanShort },
        { name: '长期', type: 'line', xAxisIndex: 4, yAxisIndex: 4, data: indicators.xipanLong },
        { name: '80线', type: 'line', xAxisIndex: 4, yAxisIndex: 4, data: indicators.xipanShort.map(() => 80) },
        { name: '20线', type: 'line', xAxisIndex: 4, yAxisIndex: 4, data: indicators.xipanShort.map(() => 20) },
        { name: '四线归零', type: 'bar', xAxisIndex: 4, yAxisIndex: 4, data: indicators.xipanFourZero },
        { name: '白线下20', type: 'bar', xAxisIndex: 4, yAxisIndex: 4, data: indicators.xipanWhiteLow20 },
        { name: '白穿红', type: 'bar', xAxisIndex: 4, yAxisIndex: 4, data: indicators.xipanCrossRed },
        { name: '白穿黄', type: 'bar', xAxisIndex: 4, yAxisIndex: 4, data: indicators.xipanCrossYellow }
=======
        { name: 'Volume', type: 'bar', data: data.volumes },
        ...indicatorSeries,
        { name: 'DIF', type: 'line', data: indicators.dif },
        { name: 'DEA', type: 'line', data: indicators.dea },
        { name: 'MACD', type: 'bar', data: indicators.macd }
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
      ]
    }, { replaceMerge: ['series'] })
  }, [showZhixing, indicators, data, stockName])

  // 初始化图表（仅数据变化时）
  useEffect(() => {
    if (!chartRef.current || !data?.values?.length) return

    if (chartInstanceRef.current) chartInstanceRef.current.dispose()
    
    const chart = echarts.init(chartRef.current)
    chartInstanceRef.current = chart
    
    // 使用 ref 获取当前值
    const currentShowZhixing = showZhixingRef.current
    const currentIndicators = indicatorsRef.current

    // 分时图配置
    if (data.isTrend) {
      const preClose = data.preClose || 0
      const prices = data.values.map(v => v[0])
      const minPrice = Math.min(...prices)
      const maxPrice = Math.max(...prices)
      // 以昨收为中心，取最大偏差的对称范围
      const maxDiff = Math.max(Math.abs(maxPrice - preClose), Math.abs(minPrice - preClose), preClose * 0.01)
      const yMin = preClose - maxDiff * 1.1
      const yMax = preClose + maxDiff * 1.1
      // 计算涨跌幅范围
      const pctRange = ((yMax - preClose) / preClose * 100).toFixed(2)

      // 生成完整的交易时间轴
      const fullTimeAxis = generateFullTimeAxis(market)
      
      // 创建时间到数据的映射
      const timeDataMap = {}
      data.categoryData.forEach((time, i) => {
        timeDataMap[time] = {
          price: data.values[i]?.[0],
          avg: data.values[i]?.[1],
          volume: data.volumes?.[i]
        }
      })
      
      // 按完整时间轴生成数据，没有数据的时间点填null
      const fullPrices = fullTimeAxis.map(t => timeDataMap[t]?.price ?? null)
      const fullAvgs = fullTimeAxis.map(t => timeDataMap[t]?.avg ?? null)
      const fullVolumes = fullTimeAxis.map((t, i) => {
        const vol = timeDataMap[t]?.volume
        return vol ? [i, vol[1], vol[2]] : [i, 0, 1]
      })

      chart.setOption({
        animation: false,
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' },
          ...echartsTheme.tooltip,
          formatter: (params) => {
            const priceData = params.find(p => p.seriesName === '价格')
            const avgData = params.find(p => p.seriesName === '均价')
            const volData = params.find(p => p.seriesName === '成交量')
            // 如果没有价格数据或价格为null，不显示tooltip
            if (!priceData || priceData.data == null) return ''
            
            const price = priceData.data
            const changePct = preClose ? ((price - preClose) / preClose * 100).toFixed(2) : '-'
            const color = price >= preClose ? upColor : downColor
            
            let html = `<div style="font-size:12px">`
            html += `<div style="font-weight:bold;margin-bottom:4px">${priceData.axisValue}</div>`
            html += `<div>价格: <span style="color:${color}">${price.toFixed(2)}</span></div>`
            html += `<div>涨跌: <span style="color:${color}">${changePct}%</span></div>`
            if (avgData && avgData.data != null) html += `<div style="color:#ffb800">均价: ${avgData.data.toFixed(2)}</div>`
            if (volData && volData.data && volData.data[1]) html += `<div>成交量: ${(volData.data[1] / 10000).toFixed(0)}万</div>`
            html += `</div>`
            return html
          }
        },
        axisPointer: {
          link: [{ xAxisIndex: 'all' }],
          label: { backgroundColor: isDark ? '#555' : '#777' }
        },
        grid: [
          { left: 60, right: 50, top: 20, height: '60%' },
          { left: 60, right: 50, top: '82%', height: '12%' }
        ],
        xAxis: [
          { 
            type: 'category', 
            data: fullTimeAxis, 
            boundaryGap: false,
            axisLine: { lineStyle: { color: echartsTheme.axisLine.lineStyle.color } },
            axisLabel: { 
              show: true, 
              fontSize: 10, 
              color: echartsTheme.axisLabel.color,
              interval: market === 'hk' ? 60 : 30, // 每隔一段时间显示一个标签
            },
            splitLine: { show: false },
            axisTick: { show: false }
          },
          { 
            type: 'category', 
            gridIndex: 1, 
            data: fullTimeAxis, 
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
            },
            axisPointer: { show: true }
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
            },
            axisPointer: { show: true }
          },
          { 
            type: 'value',
            gridIndex: 1,
            min: 0,
            axisLabel: { show: false }, 
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { show: false },
            axisPointer: { 
              show: true, 
              label: { formatter: (p) => (p.value / 10000).toFixed(0) + '万' } 
            }
          }
        ],
        visualMap: {
          show: false,
          seriesIndex: 2,
          dimension: 2,
          pieces: [{ value: 1, color: upColor }, { value: -1, color: downColor }]
        },
        series: [
          // 价格线 - 白色/蓝色
          {
            name: '价格',
            type: 'line',
            data: fullPrices,
            symbol: 'none',
            connectNulls: false,
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
          // 均价线 - 黄色（VWAP成交量加权均价）
          {
            name: '均价',
            type: 'line',
            data: fullAvgs,
            symbol: 'none',
            connectNulls: false,
            lineStyle: { width: 1, color: '#ffb800' }
          },
          // 成交量
          {
            name: '成交量',
            type: 'bar',
            xAxisIndex: 1,
            yAxisIndex: 2,
            data: fullVolumes,
            barWidth: '80%'
          }
        ]
      })
    } else {
      // K线图配置
      // 获取最新的 KDJ 值用于显示在图表右上角
      const lastK = currentIndicators?.kdjK?.slice(-1)[0] || '-'
      const lastD = currentIndicators?.kdjD?.slice(-1)[0] || '-'
      const lastJ = currentIndicators?.kdjJ?.slice(-1)[0] || '-'
      
      chart.setOption({
        animation: false,
        tooltip: {
          trigger: 'axis',
          axisPointer: { 
            type: 'cross',
            crossStyle: { color: echartsTheme.axisLabel.color }
          },
          ...echartsTheme.tooltip,
          formatter: (params) => {
            const kline = params.find(p => p.seriesName === stockName)
            if (!kline) return ''
<<<<<<< HEAD
            const dataIndex = kline.dataIndex
            // 从原始数据获取
            const rawData = data.values[dataIndex]
            const close = rawData?.[1]
            const changePct = rawData?.[4]
            const turnoverRate = rawData?.[5]
            const safeChangePct = (changePct != null && !isNaN(changePct)) ? changePct : 0
            const safeTurnover = (turnoverRate != null && !isNaN(turnoverRate) && turnoverRate > 0) ? turnoverRate : null
            
            // 延迟更新KDJ显示，避免在主进程中调用setOption
            const k = currentIndicators?.kdjK?.[dataIndex] ?? '-'
            const d = currentIndicators?.kdjD?.[dataIndex] ?? '-'
            const j = currentIndicators?.kdjJ?.[dataIndex] ?? '-'
            setTimeout(() => {
              // 检查实例是否仍然有效
              if (chartInstanceRef.current && !chartInstanceRef.current.isDisposed()) {
                chartInstanceRef.current.setOption({
                  graphic: [{ style: { text: `KDJ(9,3,3)  K:${k}  D:${d}  J:${j}` } }]
                })
              }
            }, 0)
            
            let html = `<div style="font-size:12px">`
            html += `<div style="font-weight:bold;margin-bottom:4px">${kline.axisValue}</div>`
            html += `<div>现价: <span style="color:${safeChangePct >= 0 ? upColor : downColor}">${close}</span></div>`
            html += `<div>涨幅: <span style="color:${safeChangePct >= 0 ? upColor : downColor}">${safeChangePct >= 0 ? '+' : ''}${safeChangePct.toFixed(2)}%</span></div>`
            html += `<div>换手: ${safeTurnover ? safeTurnover.toFixed(2) + '%' : '-'}</div>`
            html += `<div>J值: <span style="color:#e91e63">${j}</span></div>`
=======
            const [open, close, low, high] = kline.data
            const volume = params.find(p => p.seriesName === 'Volume')
            const bbi = params.find(p => p.seriesName === 'BBI')
            const zhixingShort = params.find(p => p.seriesName === '短期趋势')
            const zhixingLong = params.find(p => p.seriesName === '多空线')
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
            if (zhixingShort && zhixingShort.data !== '-') html += `<div style="color:#ffffff">短期趋势: ${zhixingShort.data}</div>`
            if (zhixingLong && zhixingLong.data !== '-') html += `<div style="color:#ffff00">多空线: ${zhixingLong.data}</div>`
            if (dif && dif.data !== '-') html += `<div style="color:#2196f3">DIF: ${dif.data}</div>`
            if (dea && dea.data !== '-') html += `<div style="color:#ff5722">DEA: ${dea.data}</div>`
            if (macdBar && macdBar.data !== '-') html += `<div>MACD: ${macdBar.data}</div>`
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
            html += `</div>`
            return html
          }
        },
        axisPointer: {
          link: [{ xAxisIndex: 'all' }],
          label: { backgroundColor: isDark ? '#555' : '#777' }
        },
        legend: {
          data: currentShowZhixing ? [stockName, '短期趋势', '多空线'] : [stockName, 'BBI'],
          top: 0,
          left: 'center',
          itemWidth: 14,
          itemHeight: 10,
          textStyle: { fontSize: 11, color: echartsTheme.textStyle.color }
        },
        grid: [
          { left: 50, right: 10, top: 30, height: '30%' },   // K线
          { left: 50, right: 10, top: '44%', height: '8%' }, // 成交量
          { left: 50, right: 10, top: '54%', height: '10%' }, // KDJ
          { left: 50, right: 10, top: '66%', height: '10%' }, // MACD
          { left: 50, right: 10, top: '78%', height: '14%' }  // 知行洗盘短线
        ],
        xAxis: [
          { 
            type: 'category', 
            data: data.categoryData, 
            boundaryGap: true,
            axisLine: { onZero: false, lineStyle: { color: echartsTheme.axisLine.lineStyle.color } }, 
            splitLine: { show: false },
            axisLabel: { show: false },
            axisPointer: { z: 100, label: { show: false } }
          },
          { 
            type: 'category', 
            gridIndex: 1, 
            data: data.categoryData, 
            boundaryGap: true,
            axisLine: { onZero: false, lineStyle: { color: echartsTheme.axisLine.lineStyle.color } }, 
            axisLabel: { show: false },
            splitLine: { show: false },
            axisPointer: { label: { show: false } }
          },
          { 
            type: 'category', 
            gridIndex: 2, 
            data: data.categoryData, 
            boundaryGap: true,
<<<<<<< HEAD
            axisLine: { onZero: false, lineStyle: { color: echartsTheme.axisLine.lineStyle.color } }, 
            axisLabel: { show: false },
            splitLine: { show: false },
            axisPointer: { label: { show: false } }
          },
          { 
            type: 'category', 
            gridIndex: 3, 
            data: data.categoryData, 
            boundaryGap: true,
            axisLine: { onZero: false, lineStyle: { color: echartsTheme.axisLine.lineStyle.color } },
            splitLine: { show: false },
            axisLabel: { show: false },
            axisPointer: { label: { show: false } }
          },
          { 
            type: 'category', 
            gridIndex: 4, 
            data: data.categoryData, 
            boundaryGap: true,
            axisLine: { onZero: false, lineStyle: { color: echartsTheme.axisLine.lineStyle.color } },
            splitLine: { show: false },
            axisLabel: { fontSize: 10, color: echartsTheme.axisLabel.color },
            axisPointer: { label: { show: false } }
=======
            axisLine: { onZero: false, lineStyle: { color: echartsTheme.axisLine.lineStyle.color } },
            splitLine: { show: false },
            axisLabel: { fontSize: 10, color: echartsTheme.axisLabel.color },
            axisPointer: { show: true }
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
          }
        ],
        yAxis: [
          { 
            scale: true, 
            splitArea: { show: false }, 
            splitLine: { show: true, lineStyle: { color: echartsTheme.splitLine.lineStyle.color, type: 'dashed' } },
            splitNumber: 4,
            axisLabel: { fontSize: 10, color: echartsTheme.axisLabel.color },
            axisPointer: { show: true }
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
            splitArea: { show: false },
            axisPointer: { show: true, label: { formatter: (p) => (p.value / 10000).toFixed(0) + '万' } }
          },
          { 
            scale: true, 
            gridIndex: 2, 
            splitNumber: 2,
            axisLabel: { show: true, fontSize: 9, color: echartsTheme.axisLabel.color }, 
            axisLine: { show: false }, 
            splitLine: { show: true, lineStyle: { color: echartsTheme.splitLine.lineStyle.color, type: 'dashed' } },
            splitArea: { show: false },
            axisPointer: { show: true }
          },
          { 
            scale: true, 
            gridIndex: 3, 
            splitNumber: 2, 
<<<<<<< HEAD
            axisLabel: { fontSize: 9, color: echartsTheme.axisLabel.color }, 
            splitLine: { show: true, lineStyle: { color: echartsTheme.splitLine.lineStyle.color, type: 'dashed' } },
            splitArea: { show: false },
            axisPointer: { show: true }
          },
          { 
            gridIndex: 4, 
            min: -40,
            max: 100,
            splitNumber: 2, 
            axisLabel: { fontSize: 9, color: echartsTheme.axisLabel.color }, 
=======
            axisLabel: { fontSize: 10, color: echartsTheme.axisLabel.color }, 
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
            splitLine: { show: true, lineStyle: { color: echartsTheme.splitLine.lineStyle.color, type: 'dashed' } },
            splitArea: { show: false },
            axisPointer: { show: true }
          }
        ],
        dataZoom: [
          {
            type: 'inside',
            xAxisIndex: [0, 1, 2, 3, 4],
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
            top: '54%',
            style: {
              text: `KDJ(9,3,3)  K:${lastK}  D:${lastD}  J:${lastJ}`,
              fontSize: 10,
              fill: echartsTheme.textStyle.color,
              rich: {
                k: { fill: isDark ? '#ffffff' : '#333333' },
                d: { fill: '#ff9800' },
                j: { fill: '#e91e63' }
              }
            },
            z: 100
          },
          {
            type: 'text',
            left: 55,
            top: '78%',
            style: {
              text: '洗盘(3,21)',
              fontSize: 10,
              fill: echartsTheme.textStyle.color
            },
            z: 100
          }
        ],
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
          // 成交量
          { 
            name: 'Volume', 
            type: 'bar', 
            xAxisIndex: 1, 
            yAxisIndex: 1, 
            data: data.volumes,
            barWidth: '60%'
          },
<<<<<<< HEAD
          // KDJ 指标 - K线黑色，D线橙色，J线粉色
          { 
            name: 'K', 
            type: 'line', 
            xAxisIndex: 2, 
            yAxisIndex: 2, 
            data: currentIndicators?.kdjK || [],
            symbol: 'none',
            lineStyle: { width: 1, color: isDark ? '#ffffff' : '#333333' }
          },
          { 
            name: 'D', 
            type: 'line', 
            xAxisIndex: 2, 
            yAxisIndex: 2, 
            data: currentIndicators?.kdjD || [],
            symbol: 'none',
            lineStyle: { width: 1, color: '#ff9800' }
          },
          { 
            name: 'J', 
            type: 'line', 
            xAxisIndex: 2, 
            yAxisIndex: 2, 
            data: currentIndicators?.kdjJ || [],
            symbol: 'none',
            lineStyle: { width: 1, color: '#e91e63' }
          },
          // 根据开关显示 BBI 或双线战法
          ...(currentShowZhixing ? [
            // 知行短期趋势线: EMA(EMA(C,10),10) - 绿色
=======
          // 根据开关显示 BBI 或双线战法
          ...(currentShowZhixing ? [
            // 知行短期趋势线: EMA(EMA(C,10),10), COLORFFFFFF, LINETHICK1
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
            {
              name: '短期趋势',
              type: 'line',
              data: currentIndicators?.zhixingShort || [],
              smooth: false,
              symbol: 'none',
<<<<<<< HEAD
              lineStyle: { width: 1.5, color: '#00e676' }
            },
            // 知行多空线: (MA14+MA28+MA57+MA114)/4 - 橙色
=======
              lineStyle: { width: 1, color: '#ffffff' }
            },
            // 知行多空线: (MA14+MA28+MA57+MA114)/4 - 黄色
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
            {
              name: '多空线',
              type: 'line',
              data: currentIndicators?.zhixingLong || [],
              smooth: false,
              symbol: 'none',
<<<<<<< HEAD
              lineStyle: { width: 1.5, color: '#ff9800' }
=======
              lineStyle: { width: 1, color: '#ffff00' }
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
            }
          ] : [
            {
              name: 'BBI',
              type: 'line',
              data: currentIndicators?.bbi || [],
              smooth: true,
              symbol: 'none',
              lineStyle: { width: 1, color: '#ff9800' }
            }
          ]),
          {
            name: 'DIF',
            type: 'line',
<<<<<<< HEAD
            xAxisIndex: 3,
            yAxisIndex: 3,
=======
            xAxisIndex: 2,
            yAxisIndex: 2,
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
            data: currentIndicators?.dif || [],
            symbol: 'none',
            lineStyle: { width: 1, color: '#2196f3' }
          },
          {
            name: 'DEA',
            type: 'line',
<<<<<<< HEAD
            xAxisIndex: 3,
            yAxisIndex: 3,
=======
            xAxisIndex: 2,
            yAxisIndex: 2,
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
            data: currentIndicators?.dea || [],
            symbol: 'none',
            lineStyle: { width: 1, color: '#ff5722' }
          },
          {
            name: 'MACD',
            type: 'bar',
<<<<<<< HEAD
            xAxisIndex: 3,
            yAxisIndex: 3,
=======
            xAxisIndex: 2,
            yAxisIndex: 2,
>>>>>>> 9b7d799f0bcdd7afd15e7d57b2a138b1f6af6a1c
            data: currentIndicators?.macd || [],
            barWidth: '60%',
            itemStyle: {
              color: (params) => parseFloat(params.data) >= 0 ? upColor : downColor
            }
          },
          // 知行洗盘短线 - 第5个副图
          {
            name: '短期',
            type: 'line',
            xAxisIndex: 4,
            yAxisIndex: 4,
            data: currentIndicators?.xipanShort || [],
            symbol: 'none',
            lineStyle: { width: 1, color: isDark ? '#ffffff' : '#333333' }
          },
          {
            name: '长期',
            type: 'line',
            xAxisIndex: 4,
            yAxisIndex: 4,
            data: currentIndicators?.xipanLong || [],
            symbol: 'none',
            lineStyle: { width: 2, color: '#ff0000' }
          },
          // 80/20 参考线
          {
            name: '80线',
            type: 'line',
            xAxisIndex: 4,
            yAxisIndex: 4,
            data: (currentIndicators?.xipanShort || []).map(() => 80),
            symbol: 'none',
            lineStyle: { width: 1, color: '#ffeb3b', type: 'dashed' }
          },
          {
            name: '20线',
            type: 'line',
            xAxisIndex: 4,
            yAxisIndex: 4,
            data: (currentIndicators?.xipanShort || []).map(() => 20),
            symbol: 'none',
            lineStyle: { width: 1, color: '#ffeb3b', type: 'dashed' }
          },
          // 买入信号柱
          {
            name: '四线归零',
            type: 'bar',
            xAxisIndex: 4,
            yAxisIndex: 4,
            data: currentIndicators?.xipanFourZero || [],
            barWidth: 3,
            itemStyle: { color: '#0000ff' }
          },
          {
            name: '白线下20',
            type: 'bar',
            xAxisIndex: 4,
            yAxisIndex: 4,
            data: currentIndicators?.xipanWhiteLow20 || [],
            barWidth: 3,
            itemStyle: { color: '#00ffff' }
          },
          {
            name: '白穿红',
            type: 'bar',
            xAxisIndex: 4,
            yAxisIndex: 4,
            data: currentIndicators?.xipanCrossRed || [],
            barWidth: 3,
            itemStyle: { color: '#00ff00' }
          },
          {
            name: '白穿黄',
            type: 'bar',
            xAxisIndex: 4,
            yAxisIndex: 4,
            data: currentIndicators?.xipanCrossYellow || [],
            barWidth: 3,
            itemStyle: { color: '#ff9150' }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, stockName, market, isDark, echartsTheme])

  return <div ref={chartRef} style={{ height: isMobile ? 450 : 520 }} />
})

StockKlineChart.displayName = 'StockKlineChart'

export default StockKlineChart
