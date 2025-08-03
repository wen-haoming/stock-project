import { useState, useMemo } from 'react';
import { Empty } from 'antd';
import { useLocation } from 'react-router-dom';
import { promptCategories } from './prompts/loader';
import { styles, darkStyles, themeColors, darkThemeColors } from './styles';
import {
  PromptPreviewModal,
  CodePreviewModal,
  CategorySection,
  DarkModeToggle
} from './components';

const PromptPage = () => {
  const location = useLocation();
  const [previewVisible, setPreviewVisible] = useState(false);
  const [codePreviewVisible, setCodePreviewVisible] = useState(false);
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
      return promptCategories; // 显示所有分类
    }
    const category = promptCategories.find(cat => cat.id === currentCategoryId);
    return category ? [category] : [];
  }, [currentCategoryId]);

  const handlePreview = (prompt) => {
    setCurrentPrompt(prompt);
    setPreviewVisible(true);
  };

  const handleCodePreview = (prompt) => {
    const promptWithCode = prompt.hasCode && prompt.codeContent 
      ? { ...prompt, content: prompt.codeContent }
      : prompt;
    setCurrentPrompt(promptWithCode);
    setCodePreviewVisible(true);
  };

  const handleCopy = (prompt) => {
    // 可以在这里添加复制统计等功能
    console.log('复制了提示词:', prompt.title);
  };

  const currentStyles = isDarkMode ? darkStyles : styles;
  const currentThemeColors = isDarkMode ? darkThemeColors : themeColors;
 
  return (
    <div style={currentStyles.container}>
      <div style={currentStyles.content}>
        {displayCategories.length > 0 ? (
          displayCategories.map(category => (
            <CategorySection
              key={category.id}
              category={category}
              onPreview={handlePreview}
              onCodePreview={handleCodePreview}
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

        <CodePreviewModal
          visible={codePreviewVisible}
          prompt={currentPrompt}
          onClose={() => setCodePreviewVisible(false)}
          currentStyles={{ ...currentStyles, isDarkMode }}
        />
      </div>
    </div>
  );
};

export default PromptPage;
