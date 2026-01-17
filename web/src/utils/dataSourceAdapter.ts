/**
 * 数据源适配器
 * 自动在 LongPort API 和东方财富 API 之间切换
 */
import {
  checkLongPortStatus,
  fetchLPQuote,
  fetchLPKline,
  fetchLPIntraday,
  fetchLPDepth,
  getLongPortSymbol,
  convertLPKlineToCommon,
  convertLPIntradayToCommon,
  type LPQuoteData,
} from '@/api/longport'
import {
  fetchStockKline,
  fetchStockTrend,
  type KlineData,
  type TrendData,
} from '@/api/stock'

// 全局缓存 LongPort 是否可用
let longPortAvailable: boolean | null = null
let checkingPromise: Promise<boolean> | null = null

/**
 * 检查 LongPort API 是否可用（带缓存）
 */
export async function isLongPortAvailable(): Promise<boolean> {
  if (longPortAvailable !== null) {
    return longPortAvailable
  }

  if (checkingPromise) {
    return checkingPromise
  }

  checkingPromise = checkLongPortStatus().then(available => {
    longPortAvailable = available
    checkingPromise = null
    // 5分钟后过期，重新检查
    setTimeout(() => {
      longPortAvailable = null
    }, 5 * 60 * 1000)
    return available
  }).catch(() => {
    checkingPromise = null
    longPortAvailable = false
    return false
  })

  return checkingPromise
}

/**
 * 强制重新检查 LongPort 可用性
 */
export function resetLongPortStatus() {
  longPortAvailable = null
  checkingPromise = null
}

// ============= K线数据适配 =============

export interface UnifiedKlineData {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  turnover?: number
}

/**
 * 获取K线数据（自动选择数据源）
 * @param symbol 股票代码（无市场后缀，如 600000、00700、AAPL）
 * @param market 市场类型（a/hk/us）
 * @param period K线周期
 * @param count 数量
 */
export async function fetchKlineData(
  symbol: string,
  market: string,
  period: string = 'day',
  count: number = 100
): Promise<UnifiedKlineData[]> {
  const available = await isLongPortAvailable()

  if (available) {
    try {
      const lpSymbol = getLongPortSymbol(symbol, market)
      const klines = await fetchLPKline(lpSymbol, period, count)
      return convertLPKlineToCommon(klines)
    } catch (error) {
      console.warn('LongPort K线获取失败，回退到东方财富:', error)
      // 失败后回退到东方财富
    }
  }

  // 使用东方财富 API
  return fetchStockKline(symbol, market, period, count)
}

// ============= 分时数据适配 =============

export interface UnifiedTrendData {
  time: string
  price: number
  avgPrice?: number
  volume?: number
  turnover?: number
}

/**
 * 获取分时数据（自动选择数据源）
 * @param symbol 股票代码
 * @param market 市场类型
 */
export async function fetchTrendData(
  symbol: string,
  market: string
): Promise<UnifiedTrendData[]> {
  const available = await isLongPortAvailable()

  if (available) {
    try {
      const lpSymbol = getLongPortSymbol(symbol, market)
      const intraday = await fetchLPIntraday(lpSymbol)
      return convertLPIntradayToCommon(intraday)
    } catch (error) {
      console.warn('LongPort 分时获取失败，回退到东方财富:', error)
    }
  }

  // 使用东方财富 API
  return fetchStockTrend(symbol, market)
}

// ============= 实时行情适配 =============

export interface UnifiedQuoteData {
  symbol: string
  name?: string
  price: number
  open: number
  high: number
  low: number
  prevClose: number
  volume: number
  turnover?: number
  changePct: number
  changeVal: number
  timestamp: number
}

/**
 * 获取实时行情（自动选择数据源）
 * @param symbols 股票代码列表
 * @param market 市场类型
 */
export async function fetchQuoteData(
  symbols: string[],
  market: string
): Promise<UnifiedQuoteData[]> {
  const available = await isLongPortAvailable()

  if (available) {
    try {
      const lpSymbols = symbols.map(s => getLongPortSymbol(s, market))
      const quotes = await fetchLPQuote(lpSymbols)
      return quotes.map(q => ({
        symbol: q.symbol,
        price: q.lastDone,
        open: q.open,
        high: q.high,
        low: q.low,
        prevClose: q.prevClose,
        volume: q.volume,
        turnover: q.turnover,
        changePct: q.changePct,
        changeVal: q.changeVal,
        timestamp: q.timestamp * 1000,
      }))
    } catch (error) {
      console.warn('LongPort 行情获取失败，回退到东方财富:', error)
    }
  }

  // 使用东方财富 API（需要逐个获取）
  // 这里简化处理，实际需要调用东方财富的实时行情接口
  return []
}

// ============= 盘口数据适配 =============

export interface UnifiedDepthData {
  ask: Array<{ price: number; volume: number }>
  bid: Array<{ price: number; volume: number }>
}

/**
 * 获取盘口数据（自动选择数据源）
 * @param symbol 股票代码
 * @param market 市场类型
 */
export async function fetchDepthData(
  symbol: string,
  market: string
): Promise<UnifiedDepthData | null> {
  const available = await isLongPortAvailable()

  if (available) {
    try {
      const lpSymbol = getLongPortSymbol(symbol, market)
      const depth = await fetchLPDepth(lpSymbol)
      if (depth) {
        return {
          ask: depth.ask.map(a => ({ price: a.price, volume: a.volume })),
          bid: depth.bid.map(b => ({ price: b.price, volume: b.volume })),
        }
      }
    } catch (error) {
      console.warn('LongPort 盘口获取失败:', error)
    }
  }

  // 东方财富没有直接的盘口API，返回null
  return null
}

// ============= 数据源状态管理 =============

/**
 * 数据源类型
 */
export type DataSource = 'longport' | 'eastmoney'

/**
 * 获取当前数据源
 */
export async function getCurrentDataSource(): Promise<DataSource> {
  const available = await isLongPortAvailable()
  return available ? 'longport' : 'eastmoney'
}

/**
 * 数据源名称映射
 */
export const DATA_SOURCE_NAMES: Record<DataSource, string> = {
  longport: 'LongPort',
  eastmoney: '东方财富',
}
