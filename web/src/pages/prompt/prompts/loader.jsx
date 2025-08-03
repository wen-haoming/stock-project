import { categoryConfigs, promptData } from '../config.jsx';

console.log('Loading prompt data...');

// 构建分类数据结构
function buildCategoryData() {
  const result = promptData.categories.map(category => ({
    ...category,
    ...categoryConfigs[category.id] // 合并配置
  }));
  
  console.log('Built category data:', result);
  return result;
}

// 导出动态加载的数据
export const promptCategories = buildCategoryData();

// 导出单个提示词获取函数
export function getPromptById(categoryId, promptId) {
  const category = promptCategories.find(cat => cat.id === categoryId);
  if (!category) return null;
  
  return category.prompts.find(prompt => prompt.id === promptId);
}

// 导出所有提示词列表
export function getAllPrompts() {
  return promptCategories.flatMap(category => 
    category.prompts.map(prompt => ({
      ...prompt,
      categoryId: category.id,
      categoryName: category.name
    }))
  );
}

// 导出按分类获取提示词函数
export function getPromptsByCategory(categoryId) {
  const category = promptCategories.find(cat => cat.id === categoryId);
  return category ? category.prompts : [];
} 
