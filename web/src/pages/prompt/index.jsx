import { useState, useMemo } from 'react';
import { Empty } from 'antd';
import { useLocation } from 'react-router-dom';
import { promptData } from './config';
import { styles, darkStyles, themeColors, darkThemeColors } from './styles';
import {
  PromptPreviewModal,
  CategorySection,
  DarkModeToggle
} from './components';

// 主页面组件
const PromptPage = () => {
  const location = useLocation();
  const [previewVisible, setPreviewVisible] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('prompt-dark-mode');
    return saved ? JSON.parse(saved) : false;
  });

  // 根据当前路径获取分类ID
  const currentCategoryId = useMemo(() => {
    const path = location.pathname;
    if (path === '/') return null; // 首页显示所有分类
    return path.substring(1); // 移除开头的 '/'
  }, [location.pathname]);

  // 过滤要显示的分类
  const displayCategories = useMemo(() => {
    if (!currentCategoryId) {
      return promptData.categories; // 显示所有分类
    }
    const category = promptData.categories.find(cat => cat.id === currentCategoryId);
    return category ? [category] : [];
  }, [currentCategoryId]);

  const handlePreview = (prompt) => {
    setCurrentPrompt(prompt);
    setPreviewVisible(true);
  };



  const handleCopy = (prompt) => {
    // 可以在这里添加复制统计等功能
    console.log('复制了提示词:', prompt.title);
  };

  // 根据暗黑模式获取样式
  const currentStyles = isDarkMode ? darkStyles : styles;
  const currentThemeColors = isDarkMode ? darkThemeColors : themeColors;

  // 切换暗黑模式
  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('prompt-dark-mode', JSON.stringify(newMode));
  };

  return (
    <div style={currentStyles.container}>
      <div style={currentStyles.content}>
        {/* 暗黑模式切换按钮 */}
        <DarkModeToggle 
          isDarkMode={isDarkMode}
          onToggle={toggleDarkMode}
        />

        {displayCategories.length > 0 ? (
          displayCategories.map(category => (
            <CategorySection
              key={category.id}
              category={category}
              onPreview={handlePreview}
              onCopy={handleCopy}
              currentStyles={currentStyles}
              currentThemeColors={currentThemeColors}
            />
          ))
        ) : (
          <Empty 
            description="未找到相关分类" 
            style={currentStyles.emptyContainer}
          />
        )}

        <PromptPreviewModal
          visible={previewVisible}
          prompt={currentPrompt}
          onClose={() => setPreviewVisible(false)}
          currentStyles={currentStyles}
        />
      </div>
    </div>
  );
};

export default PromptPage; 
