/**
 * 图表相关工具函数
 */

// ECharts 颜色配置
export const upColor = '#ec5a5a'
export const downColor = '#47b262'

/**
 * 计算均线
 * @param {number} dayCount - 均线天数
 * @param {Array} data - K线数据
 */
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

/**
 * 解析 K 线原始数据
 * @param {Array} rawData - 原始K线数据
 */
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
