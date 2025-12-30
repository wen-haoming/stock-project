import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react'
import { theme } from 'antd'

interface VTableTheme {
  bgColor: string
  headerBgColor: string
  textColor: string
  headerTextColor: string
  borderColor: string
  hoverBgColor: string
  selectBgColor: string
}

interface CustomTheme {
  bgColor: string
  bgColorSecondary: string
  textColor: string
  textColorSecondary: string
  borderColor: string
  headerBg: string
  vtable: VTableTheme
}

interface ThemeConfig {
  algorithm: typeof theme.defaultAlgorithm | typeof theme.darkAlgorithm
  token: {
    colorPrimary: string
    borderRadius: number
    colorBgContainer?: string
    colorBgElevated?: string
  }
  custom: CustomTheme
}

interface ThemeContextValue {
  isDark: boolean
  toggleTheme: () => void
  theme: ThemeConfig
  vtableTheme: VTableTheme
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

// 亮色主题
const lightTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 4,
  },
  custom: {
    bgColor: '#fff',
    bgColorSecondary: '#f5f5f5',
    textColor: '#333',
    textColorSecondary: '#666',
    borderColor: '#e8e8e8',
    headerBg: '#001529',
    vtable: {
      bgColor: '#fff',
      headerBgColor: '#f7f7f7',
      textColor: '#333',
      headerTextColor: '#666',
      borderColor: '#e8e8e8',
      hoverBgColor: '#f0f7ff',
      selectBgColor: '#e6f4ff',
    }
  }
}

// 暗色主题
const darkTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 4,
    colorBgContainer: '#191919',
    colorBgElevated: '#1f1f1f',
  },
  custom: {
    bgColor: '#191919',
    bgColorSecondary: '#1f1f1f',
    textColor: '#e0e0e0',
    textColorSecondary: '#808080',
    borderColor: '#2a2a2a',
    headerBg: '#141414',
    vtable: {
      bgColor: '#191919',
      headerBgColor: '#1f1f1f',
      textColor: '#e0e0e0',
      headerTextColor: '#808080',
      borderColor: '#2a2a2a',
      hoverBgColor: '#252525',
      selectBgColor: '#2d2d2d',
    }
  }
}

interface ThemeProviderProps {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'dark'
  })

  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
    document.body.style.backgroundColor = isDark ? '#141414' : '#f0f2f5'
  }, [isDark])

  const toggleTheme = () => setIsDark(prev => !prev)

  const currentTheme = isDark ? darkTheme : lightTheme

  const value = useMemo(() => ({
    isDark,
    toggleTheme,
    theme: currentTheme,
    vtableTheme: currentTheme.custom.vtable,
  }), [isDark, currentTheme])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

interface VTableThemeOptions {
  rowHeight?: number
  headerRowHeight?: number
  fontSize?: number
}

// 生成 VTable 主题配置
export function getVTableTheme(vtableTheme: VTableTheme, options: VTableThemeOptions = {}) {
  const { rowHeight = 32, headerRowHeight = 32, fontSize = 12 } = options
  return {
    defaultRowHeight: rowHeight,
    defaultHeaderRowHeight: headerRowHeight,
    underlayBackgroundColor: vtableTheme.bgColor,
    theme: {
      underlayBackgroundColor: vtableTheme.bgColor,
      defaultStyle: {
        fontSize,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        color: vtableTheme.textColor,
        bgColor: vtableTheme.bgColor,
        borderColor: 'transparent',
        borderLineWidth: 0,
      },
      headerStyle: {
        fontSize,
        fontWeight: 400,
        color: vtableTheme.headerTextColor,
        bgColor: vtableTheme.bgColor,
        borderColor: 'transparent',
        borderLineWidth: [0, 0, 1, 0],
        padding: [0, 6, 0, 6],
      },
      bodyStyle: {
        padding: [0, 6, 0, 6],
        bgColor: vtableTheme.bgColor,
        borderColor: vtableTheme.borderColor,
        borderLineWidth: [0, 0, 1, 0],
        hover: {
          cellBgColor: vtableTheme.hoverBgColor,
          inlineColumnBgColor: vtableTheme.hoverBgColor,
          inlineRowBgColor: vtableTheme.hoverBgColor,
        },
        select: {
          cellBgColor: vtableTheme.selectBgColor,
          inlineColumnBgColor: vtableTheme.selectBgColor,
          inlineRowBgColor: vtableTheme.selectBgColor,
        },
      },
      frameStyle: {
        borderColor: 'transparent',
        borderLineWidth: 0,
        cornerRadius: 0,
      },
    },
  }
}

export interface EChartsTheme {
  backgroundColor: string
  textStyle: { color: string }
  axisLine: { lineStyle: { color: string } }
  axisLabel: { color: string }
  splitLine: { lineStyle: { color: string } }
  tooltip: {
    backgroundColor: string
    borderColor: string
    textStyle: { color: string }
  }
  legend: { textStyle: { color: string } }
  dataZoom: {
    backgroundColor: string
    dataBackgroundColor: string
    fillerColor: string
    handleColor: string
    textStyle: { color: string }
  }
  brush: {
    brushStyle: {
      borderWidth: number
      color: string
      borderColor: string
    }
  }
}

// 生成 ECharts 主题配置
export function getEChartsTheme(isDark: boolean): EChartsTheme {
  return {
    backgroundColor: 'transparent',
    textStyle: { color: isDark ? '#e0e0e0' : '#333' },
    axisLine: { lineStyle: { color: isDark ? '#3a3a3a' : '#ccc' } },
    axisLabel: { color: isDark ? '#808080' : '#666' },
    splitLine: { lineStyle: { color: isDark ? '#2a2a2a' : '#eee' } },
    tooltip: {
      backgroundColor: isDark ? 'rgba(25,25,25,0.95)' : 'rgba(255,255,255,0.95)',
      borderColor: isDark ? '#3a3a3a' : '#ccc',
      textStyle: { color: isDark ? '#e0e0e0' : '#333' },
    },
    legend: { textStyle: { color: isDark ? '#e0e0e0' : '#333' } },
    dataZoom: {
      backgroundColor: isDark ? '#1f1f1f' : '#f5f5f5',
      dataBackgroundColor: isDark ? '#2a2a2a' : '#e0e0e0',
      fillerColor: isDark ? 'rgba(80,80,80,0.3)' : 'rgba(150,150,150,0.3)',
      handleColor: isDark ? '#555' : '#a0a0a0',
      textStyle: { color: isDark ? '#808080' : '#666' },
    },
    brush: {
      brushStyle: {
        borderWidth: 1,
        color: isDark ? 'rgba(100,149,237,0.3)' : 'rgba(100,149,237,0.2)',
        borderColor: isDark ? 'rgba(100,149,237,0.8)' : 'rgba(100,149,237,0.6)',
      },
    },
  }
}
