// 示例：如何添加新的提示词和分类
import { CloudOutlined } from '@ant-design/icons';
import { promptData, getAllPrompts, getPromptsByCategory } from './config';

// 1. 添加新的提示词到现有分类
const newFrontendPrompt = {
  id: 'typescript-utility',
  title: 'TypeScript 工具类型',
  description: '创建 TypeScript 工具类型和泛型',
  content: `请帮我创建 TypeScript 工具类型：
1. 功能需求：{functionality}
2. 输入类型：{inputType}
3. 输出类型：{outputType}
4. 约束条件：{constraints}

请提供：
- 工具类型定义
- 使用示例
- 类型推导说明
- 最佳实践建议`,
  aiRecommend: ['ChatGPT', 'Claude', 'Copilot'],
  tags: ['TypeScript', '工具类型', '泛型'],
  usage: '创建可复用的 TypeScript 工具类型'
};

// 2. 添加新的分类
const newCategory = {
  id: 'devops',
  name: 'DevOps',
  icon: <CloudOutlined />, // 需要导入对应的图标
  color: '#13c2c2',
  prompts: [
    {
      id: 'docker-config',
      title: 'Docker 配置优化',
      description: '优化 Docker 镜像和容器配置',
      content: `请帮我优化 Docker 配置：
1. 应用类型：{appType}
2. 性能要求：{performance}
3. 安全要求：{security}
4. 部署环境：{environment}

请提供：
- Dockerfile 优化
- 多阶段构建
- 安全最佳实践
- 性能优化建议`,
      aiRecommend: ['ChatGPT', 'Claude'],
      tags: ['Docker', '容器化', '优化'],
      usage: '优化 Docker 容器配置和性能'
    }
  ]
};

// 3. 在 config.js 中的使用方式
/*
// 在 config.js 中添加新分类
export const promptData = {
  categories: [
    // ... 现有分类
    newCategory, // 添加新分类
  ]
};

// 在现有分类中添加新提示词
{
  id: 'frontend',
  name: '前端开发',
  icon: <CodeOutlined />,
  color: '#1890ff',
  prompts: [
    // ... 现有提示词
    newFrontendPrompt, // 添加新提示词
  ]
}
*/

// 4. 搜索功能示例
const searchExample = (keyword) => {
  const allPrompts = getAllPrompts();
  return allPrompts.filter(prompt => 
    prompt.title.toLowerCase().includes(keyword.toLowerCase()) ||
    prompt.tags.some(tag => tag.toLowerCase().includes(keyword.toLowerCase()))
  );
};

// 5. 按分类筛选示例
const filterByCategory = (categoryId) => {
  return getPromptsByCategory(categoryId);
};

// 6. 统计功能示例
const getStats = () => {
  const allPrompts = getAllPrompts();
  return {
    totalPrompts: allPrompts.length,
    totalCategories: promptData.categories.length,
    promptsByCategory: promptData.categories.map(cat => ({
      category: cat.name,
      count: cat.prompts.length
    }))
  };
};

export {
  newFrontendPrompt,
  newCategory,
  searchExample,
  filterByCategory,
  getStats
}; 
