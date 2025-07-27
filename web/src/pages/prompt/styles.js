// 样式常量配置
export const styles = {
  container: {
    padding: '24px',
    background: '#f0f2f5',
    minHeight: '100vh'
  },
  content: {
    maxWidth: '1400px',
    margin: '0 auto'
  },
  pageTitle: {
    marginBottom: '32px',
    textAlign: 'center'
  },
  categorySection: {
    marginBottom: '40px'
  },
  categoryTitle: {
    marginBottom: '20px'
  },
  card: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column'
  },
  cardBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column'
  },
  cardContent: {
    flex: 1
  },
  cardTitle: {
    marginBottom: 8
  },
  cardDescription: {
    fontSize: '14px',
    marginBottom: 12,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden'
  },
  cardTags: {
    marginBottom: 12
  },
  cardAiRecommend: {
    marginBottom: 12
  },
  cardUsage: {
    fontSize: '12px',
    marginBottom: 16,
    fontStyle: 'italic'
  },
  cardActions: {
    marginTop: 'auto'
  },
  previewModal: {
    width: 800
  },
  previewContent: {
    background: '#f5f5f5',
    padding: '16px',
    borderRadius: '6px',
    fontFamily: 'monospace',
    fontSize: '14px',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
    maxHeight: '400px',
    overflow: 'auto'
  },
  emptyContainer: {
    marginTop: '100px'
  }
};

// 响应式列配置
export const responsiveCols = {
  xs: 24,   // 手机端：1列
  sm: 12,   // 平板端：2列
  md: 8,    // 小桌面：3列
  lg: 6,    // 大桌面：4列
  xl: 4     // 超大屏：6列
};

// 主题色彩配置
export const themeColors = {
  frontend: '#1890ff',
  backend: '#52c41a',
  uiDesign: '#722ed1',
  programmingRules: '#fa8c16'
}; 
