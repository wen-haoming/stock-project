/**
 * LongPort API 服务
 * 对接后端 LongPort OpenAPI
 */
import axios from 'axios'

const BASE_URL = '/api/v1/lp'

// ============= 类型定义 =============

export interface LPQuoteData {
  symbol: string
  lastDone: number
  prevClose: number
  open: number
  high: number
  low: number
  timestamp: number
  volume: number
  turnover: number
  changePct: number
  changeVal: number
}

export interface LPStaticInfo {
  symbol: string
  name: string
  nameCn: string
  exchange: string
  currency: string
  lotSize: number
  totalShares: number
  circulatingShares: number
  eps: number
  bps: number
  dividendYield: number
  stockDerivatives: number[]
}

export interface LPCandlestick {
  close: number
  open: number
  low: number
  high: number
  volume: number
  turnover: number
  timestamp: number
}

export interface LPDepth {
  ask: Array<{ position: number; price: number; volume: number; orderNum: number }>
  bid: Array<{ position: number; price: number; volume: number; orderNum: number }>
}

export interface LPIntradayLine {
  time: string
  price: number
  volume: number
  turnover: number
  avgPrice: number
}

export interface LPCapitalFlow {
  timestamp: number
  inflow: number
  mainInflow: number
  mediumInflow: number
  smallInflow: number
}

export interface LPCapitalDistribution {
  large: number
  medium: number
  small: number
}

export interface LPTradingSession {
  begin: number
  end: number
}

export interface LPMarketSession {
  market: string
  sessions: LPTradingSession[]
}

export interface LPTradingDay {
  date: string
  tradeType: number
}

export interface LPSubscribeInfo {
  subscribed: string[]
  quotaUsed: number
  quotaTotal: number
}

// ============= API 状态检查 =============

/**
 * 检查 LongPort API 是否可用
 */
export async function checkLongPortStatus(): Promise<boolean> {
  try {
    const response = await axios.get(`${BASE_URL}/status`)
    return response.data?.available === true
  } catch (error) {
    console.warn('LongPort API 不可用:', error)
    return false
  }
}

// ============= 行情数据 =============

/**
 * 获取实时行情
 * @param symbols 股票代码列表，如 ['700.HK', 'AAPL.US', '600000.SH']
 */
export async function fetchLPQuote(symbols: string[]): Promise<LPQuoteData[]> {
  const response = await axios.get(`${BASE_URL}/quote`, {
    params: { symbols: symbols.join(',') }
  })
  return response.data?.quotes || []
}

/**
 * 获取股票基本信息
 * @param symbols 股票代码列表
 */
export async function fetchLPStaticInfo(symbols: string[]): Promise<LPStaticInfo[]> {
  const response = await axios.get(`${BASE_URL}/static`, {
    params: { symbols: symbols.join(',') }
  })
  return response.data?.infos || []
}

// ============= K线数据 =============

/**
 * 获取K线数据
 * @param symbol 股票代码
 * @param period K线周期：1m/5m/15m/30m/60m/day/week/month/year
 * @param count 数量
 */
export async function fetchLPKline(
  symbol: string,
  period: string = 'day',
  count: number = 100
): Promise<LPCandlestick[]> {
  const response = await axios.get(`${BASE_URL}/kline`, {
    params: { symbol, period, count }
  })
  return response.data?.candlesticks || []
}

/**
 * 获取历史K线（按日期范围）
 * @param symbol 股票代码
 * @param start 开始日期 YYYY-MM-DD
 * @param end 结束日期 YYYY-MM-DD
 * @param period K线周期
 */
export async function fetchLPHistoryKline(
  symbol: string,
  start: string,
  end: string,
  period: string = 'day'
): Promise<LPCandlestick[]> {
  const response = await axios.get(`${BASE_URL}/history-kline`, {
    params: { symbol, start, end, period }
  })
  return response.data?.candlesticks || []
}

// ============= 深度行情 =============

/**
 * 获取深度行情（盘口数据）
 * @param symbol 股票代码
 */
export async function fetchLPDepth(symbol: string): Promise<LPDepth | null> {
  const response = await axios.get(`${BASE_URL}/depth`, {
    params: { symbol }
  })
  return response.data?.depth || null
}

// ============= 分时数据 =============

/**
 * 获取分时数据
 * @param symbol 股票代码
 */
export async function fetchLPIntraday(symbol: string): Promise<LPIntradayLine[]> {
  const response = await axios.get(`${BASE_URL}/intraday`, {
    params: { symbol }
  })
  return response.data?.lines || []
}

// ============= 资金流向 =============

/**
 * 获取资金流向
 * @param symbol 股票代码
 */
export async function fetchLPCapitalFlow(symbol: string): Promise<LPCapitalFlow[]> {
  const response = await axios.get(`${BASE_URL}/capital-flow`, {
    params: { symbol }
  })
  return response.data?.flows || []
}

/**
 * 获取资金分布
 * @param symbol 股票代码
 */
export async function fetchLPCapitalDistribution(symbol: string): Promise<LPCapitalDistribution | null> {
  const response = await axios.get(`${BASE_URL}/capital-distribution`, {
    params: { symbol }
  })
  return response.data?.distribution || null
}

// ============= 交易时间 =============

/**
 * 获取市场交易时段
 * @param market 市场代码（cn/hk/us）
 */
export async function fetchLPTradingSession(market: string): Promise<LPMarketSession[]> {
  const response = await axios.get(`${BASE_URL}/trading-session`, {
    params: { market }
  })
  return response.data?.sessions || []
}

/**
 * 获取交易日历
 * @param market 市场代码
 * @param start 开始日期 YYYY-MM-DD
 * @param end 结束日期 YYYY-MM-DD
 */
export async function fetchLPTradingDays(
  market: string,
  start: string,
  end: string
): Promise<LPTradingDay[]> {
  const response = await axios.get(`${BASE_URL}/trading-days`, {
    params: { market, start, end }
  })
  return response.data?.days || []
}

// ============= 订阅信息 =============

/**
 * 获取订阅信息
 */
export async function fetchLPSubscribeInfo(): Promise<LPSubscribeInfo | null> {
  const response = await axios.get(`${BASE_URL}/subscribe-info`)
  return response.data?.info || null
}

// ============= 工具函数 =============

/**
 * 将 LongPort K线数据转换为通用格式
 */
export function convertLPKlineToCommon(candlesticks: LPCandlestick[]) {
  return candlesticks.map(k => ({
    time: k.timestamp * 1000, // 转为毫秒
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: k.volume,
    turnover: k.turnover,
  }))
}

/**
 * 将 LongPort 分时数据转换为通用格式
 */
export function convertLPIntradayToCommon(lines: LPIntradayLine[]) {
  return lines.map(line => ({
    time: line.time,
    price: line.price,
    avgPrice: line.avgPrice,
    volume: line.volume,
    turnover: line.turnover,
  }))
}

/**
 * 获取市场前缀
 * @param symbol 原始股票代码（如 600000、00700、AAPL）
 * @param market 市场类型（a/hk/us）
 */
export function getLongPortSymbol(symbol: string, market: string): string {
  // 如果已经包含市场后缀，直接返回
  if (symbol.includes('.')) {
    return symbol
  }

  switch (market) {
    case 'a':
      // A股：根据代码判断 .SH 或 .SZ
      if (symbol.startsWith('6') || symbol.startsWith('51')) {
        return `${symbol}.SH`
      } else {
        return `${symbol}.SZ`
      }
    case 'hk':
      // 港股：补零到5位 + .HK
      return `${symbol.padStart(5, '0')}.HK`
    case 'us':
      // 美股：直接加 .US
      return `${symbol}.US`
    default:
      return symbol
  }
}
