/**
 * 图表相关工具函数
 */

// ECharts 颜色配置
export const upColor = '#ec5a5a'
export const downColor = '#47b262'

/**
 * 计算均线
 */
export const calculateMA = (dayCount: number, data: number[][]): (number | string)[] => {
  const result: (number | string)[] = []
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

interface KlineData {
  categoryData: string[]
  values: number[][]
  volumes: number[][]
}

/**
 * 解析 K 线原始数据
 */
export const parseKlineData = (rawData: string[]): KlineData => {
  const categoryData: string[] = []
  const values: number[][] = []
  const volumes: number[][] = []

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
