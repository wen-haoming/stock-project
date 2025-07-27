# 调试功能测试说明

## ✅ 新增功能

### 1. 调试按钮
- 在每个提示词卡片上添加了"调试"按钮
- 按钮图标：🐛 (BugOutlined)
- 点击后打开全屏调试弹窗

### 2. 全屏调试弹窗
- 弹窗尺寸：95vw × 85vh
- 全屏显示，最大化工作区域
- 包含完整的调试功能

### 3. 左右分割布局
- **左侧 (40%)**：提示词编辑区
  - 可编辑的 TextArea
  - 实时编辑提示词内容
  - 支持清空和重置功能

- **右侧 (60%)**：真实 AI 平台预览区
  - 使用真实 iframe 加载 AI 平台
  - 支持切换 AI 平台
  - 实时预览真实效果

### 4. 真实 iframe 集成
- **豆包** (🤖)：https://www.doubao.com/
- **Kimi** (🔍)：https://kimi.moonshot.cn/
- 使用真实 iframe 加载外部网站
- 支持完整的网站功能

### 5. 加载状态管理
- **加载中**：显示加载动画和平台图标
- **加载完成**：显示真实的 AI 平台界面
- **加载失败**：显示错误信息和重试按钮
- **平滑过渡**：opacity 动画效果

### 6. 浏览器样式界面
- 模拟真实的浏览器外观
- 包含浏览器控制按钮（红、黄、绿）
- 地址栏显示当前平台 URL
- 真实 iframe 内容区域

### 7. 工具栏功能
- **复制提示词**：复制当前编辑的内容到剪贴板
- **清空**：清空编辑区域
- **重置**：恢复到原始提示词内容
- **关闭**：关闭调试弹窗
- **快速复制**：顶部工具栏一键复制功能

### 8. 🌙 暗黑模式支持
- **主题切换**：右上角固定位置的切换按钮
- **亮色模式**：默认的浅色主题
- **暗色模式**：深色背景和文字
- **持久化存储**：自动保存用户的主题偏好
- **平滑过渡**：主题切换时的动画效果

## 🎯 使用流程

1. **打开调试**：点击任意提示词卡片上的"调试"按钮
2. **选择平台**：在顶部工具栏选择 AI 平台（豆包/Kimi）
3. **等待加载**：等待 iframe 加载完成（显示加载动画）
4. **编辑内容**：在左侧编辑提示词内容
5. **复制使用**：点击"复制到剪贴板"按钮
6. **粘贴使用**：在右侧 AI 平台中粘贴使用
7. **关闭调试**：点击"关闭"按钮

## 🎨 界面特色

### 真实 iframe 集成
- 加载真实的 AI 平台网站
- 支持完整的网站功能
- 保持原有的用户体验

### 加载状态管理
- 优雅的加载动画
- 错误处理和重试机制
- 平滑的过渡效果

### 浏览器样式
- 真实的浏览器外观
- 控制按钮和地址栏
- 圆角边框和阴影效果

### 响应式设计
- 左右分割比例固定 (40% : 60%)
- 内容区域自适应高度
- 支持滚动和溢出处理

### 🌙 暗黑模式特色
- **智能主题切换**：一键切换亮色/暗色主题
- **视觉舒适度**：暗色模式减少眼部疲劳
- **个性化体验**：记住用户的主题偏好
- **统一设计**：所有组件都支持暗黑模式
- **平滑动画**：主题切换时的过渡效果

## 🔧 技术实现

### iframe 配置
```javascript
<iframe
  src={aiPlatforms[selectedAI]?.url}
  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
  referrerPolicy="no-referrer"
  onLoad={handleIframeLoad}
  onError={handleIframeError}
/>
```

### 安全配置
- `sandbox` 属性限制 iframe 权限
- `referrerPolicy="no-referrer"` 保护隐私
- 错误处理防止恶意内容

### 状态管理
- `selectedAI`：当前选择的 AI 平台
- `promptContent`：编辑中的提示词内容
- `iframeLoading`：iframe 加载状态
- `iframeError`：iframe 错误状态
- `isDarkMode`：暗黑模式状态

### 🌙 暗黑模式实现
```javascript
// 样式切换
const currentStyles = isDarkMode ? darkStyles : styles;
const currentThemeColors = isDarkMode ? darkThemeColors : themeColors;

// 本地存储
localStorage.setItem('prompt-dark-mode', JSON.stringify(isDarkMode));

// 主题切换按钮
<Switch
  checked={isDarkMode}
  onChange={toggleDarkMode}
  checkedChildren={<BulbFilled style={{ color: '#faad14' }} />}
  unCheckedChildren={<BulbOutlined />}
/>
```

## 🚀 功能特点

### 真实体验
- 加载真实的 AI 平台网站
- 保持原有的功能和界面
- 支持完整的用户交互

### 便捷操作
- 一键复制提示词内容
- 快速切换 AI 平台
- 实时编辑和预览

### 错误处理
- 网络错误自动检测
- 重试机制
- 友好的错误提示

### 🌙 个性化体验
- 智能主题切换
- 持久化设置保存
- 视觉舒适度优化
- 统一的暗黑模式设计

## ⚠️ 注意事项

1. **网络要求**：需要稳定的网络连接
2. **跨域限制**：某些网站可能有跨域限制
3. **加载时间**：首次加载可能需要较长时间
4. **功能限制**：iframe 内的某些功能可能受限
5. **主题偏好**：暗黑模式设置会保存在本地存储中

## 🔧 扩展可能

1. **更多 AI 平台**：可以添加 ChatGPT、Claude 等
2. **本地缓存**：缓存常用平台减少加载时间
3. **历史记录**：保存调试历史
4. **模板管理**：保存常用的提示词模板
5. **协作功能**：分享调试结果
6. **🌙 主题扩展**：添加更多主题选项（如自动跟随系统主题）

这个调试功能现在已经完全实现，提供了真实的 iframe 集成体验和完整的暗黑模式支持！ 
