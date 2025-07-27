# Prompt 组件结构说明

## 📁 组件目录结构

```
components/
├── index.js              # 组件统一导出文件
├── PromptCard.jsx        # 提示词卡片组件
├── PromptPreviewModal.jsx # 预览模态框组件
├── CategorySection.jsx   # 分类展示组件
├── DarkModeToggle.jsx    # 暗黑模式切换组件
└── README.md            # 组件说明文档
```

## 🧩 组件说明

### 1. PromptCard.jsx
**功能**：单个提示词卡片组件
- 显示提示词标题、描述、标签、推荐AI等信息
- 提供预览和复制功能
- 支持暗黑模式样式切换

**Props**：
- `prompt`: 提示词数据对象
- `onPreview`: 预览回调函数
- `onCopy`: 复制回调函数
- `currentStyles`: 当前主题样式对象

### 2. PromptPreviewModal.jsx
**功能**：提示词预览模态框组件
- 全屏显示提示词详细信息
- 包含描述、推荐AI、使用场景、完整内容
- 提供复制功能

**Props**：
- `visible`: 显示状态
- `prompt`: 提示词数据对象
- `onClose`: 关闭回调函数
- `currentStyles`: 当前主题样式对象

### 3. CategorySection.jsx
**功能**：分类展示组件
- 显示分类标题和图标
- 渲染该分类下的所有提示词卡片
- 支持响应式布局

**Props**：
- `category`: 分类数据对象
- `onPreview`: 预览回调函数
- `onCopy`: 复制回调函数
- `currentStyles`: 当前主题样式对象
- `currentThemeColors`: 当前主题色彩配置

### 4. DarkModeToggle.jsx
**功能**：暗黑模式切换组件
- 固定在右上角的主题切换按钮
- 支持亮色/暗色主题切换
- 带有工具提示和动画效果

**Props**：
- `isDarkMode`: 当前暗黑模式状态
- `onToggle`: 切换回调函数

## 🔧 使用方式

### 统一导入
```javascript
import {
  PromptCard,
  PromptPreviewModal,
  CategorySection,
  DarkModeToggle
} from './components';
```

### 单独导入
```javascript
import PromptCard from './components/PromptCard';
import PromptPreviewModal from './components/PromptPreviewModal';
import CategorySection from './components/CategorySection';
import DarkModeToggle from './components/DarkModeToggle';
```

## 🎨 样式支持

所有组件都支持暗黑模式：
- 通过 `currentStyles` 属性传递样式对象
- 自动适配亮色/暗色主题
- 平滑的过渡动画效果

## 📝 开发规范

1. **组件命名**：使用 PascalCase 命名
2. **文件命名**：与组件名保持一致
3. **Props 传递**：统一使用 `currentStyles` 传递样式
4. **导出方式**：使用默认导出
5. **类型检查**：建议添加 PropTypes 或 TypeScript 支持

## 🚀 扩展建议

1. **添加 PropTypes**：为组件添加属性类型检查
2. **单元测试**：为每个组件编写测试用例
3. **文档完善**：添加更详细的 API 文档
4. **性能优化**：使用 React.memo 优化渲染性能
5. **主题扩展**：支持更多主题选项 
