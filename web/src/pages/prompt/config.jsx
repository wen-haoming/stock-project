import { 
  CodeOutlined, 
  BugOutlined, 
  ToolOutlined, 
  EyeOutlined 
} from '@ant-design/icons';

// 提示词数据配置
export const promptData = {
  categories: [
    {
      id: 'frontend',
      name: '前端开发',
      icon: <CodeOutlined />,
      color: '#1890ff',
      prompts: [
        {
          id: 'react-component',
          title: 'React 组件生成',
          description: '根据需求描述生成完整的 React 组件代码',
          content: `请帮我创建一个 React 组件，要求如下：
1. 组件名称：{componentName}
2. 功能描述：{description}
3. 需要包含的 props：{props}
4. 样式要求：{style}

请生成完整的组件代码，包括：
- 组件定义
- Props 类型定义
- 样式实现
- 使用示例`,
          aiRecommend: ['ChatGPT', 'Claude', 'Gemini'],
          tags: ['React', '组件', '代码生成'],
          usage: '用于快速生成 React 组件代码'
        },
        {
          id: 'css-layout',
          title: 'CSS 布局方案',
          description: '提供现代化的 CSS 布局解决方案',
          content: `我需要实现以下布局效果：
1. 布局类型：{layoutType}
2. 响应式要求：{responsive}
3. 浏览器兼容性：{compatibility}
4. 特殊需求：{specialRequirements}

请提供：
- 完整的 CSS 代码
- 布局原理说明
- 兼容性处理方案
- 最佳实践建议`,
          aiRecommend: ['ChatGPT', 'Claude'],
          tags: ['CSS', '布局', '响应式'],
          usage: '解决复杂的 CSS 布局问题'
        },
        {
          id: 'vue-component',
          title: 'Vue 组件生成',
          description: '生成 Vue 3 组件代码，支持 Composition API',
          content: `请帮我创建一个 Vue 3 组件，要求如下：
1. 组件名称：{componentName}
2. 功能描述：{description}
3. Props 定义：{props}
4. 事件处理：{events}
5. 样式要求：{style}

请使用 Vue 3 Composition API 生成：
- 组件结构
- Props 和 emits 定义
- 响应式数据
- 生命周期钩子
- 样式实现`,
          aiRecommend: ['ChatGPT', 'Claude', 'Gemini'],
          tags: ['Vue', '组件', 'Composition API'],
          usage: '快速生成 Vue 3 组件代码'
        }
      ]
    },
    {
      id: 'backend',
      name: '后端开发',
      icon: <ToolOutlined />,
      color: '#52c41a',
      prompts: [
        {
          id: 'api-design',
          title: 'API 接口设计',
          description: '设计 RESTful API 接口规范',
          content: `请帮我设计一个 API 接口，需求如下：
1. 业务功能：{businessFunction}
2. 数据模型：{dataModel}
3. 权限要求：{permission}
4. 性能要求：{performance}

请提供：
- 接口路径和方法
- 请求参数定义
- 响应数据结构
- 错误处理方案
- 接口文档示例`,
          aiRecommend: ['ChatGPT', 'Claude', 'Gemini'],
          tags: ['API', 'RESTful', '接口设计'],
          usage: '设计规范的 API 接口'
        },
        {
          id: 'database-query',
          title: '数据库查询优化',
          description: '优化复杂数据库查询语句',
          content: `我需要优化以下数据库查询：
1. 数据库类型：{databaseType}
2. 当前查询：{currentQuery}
3. 性能问题：{performanceIssues}
4. 数据量：{dataVolume}

请提供：
- 优化后的查询语句
- 索引建议
- 性能分析
- 最佳实践`,
          aiRecommend: ['ChatGPT', 'Claude'],
          tags: ['数据库', '查询优化', '性能'],
          usage: '优化数据库查询性能'
        },
        {
          id: 'microservice',
          title: '微服务架构设计',
          description: '设计微服务架构和拆分策略',
          content: `请帮我设计微服务架构：
1. 业务领域：{businessDomain}
2. 系统规模：{systemScale}
3. 技术栈：{techStack}
4. 性能要求：{performance}

请提供：
- 服务拆分策略
- 服务间通信方案
- 数据一致性处理
- 部署和运维方案
- 监控和日志策略`,
          aiRecommend: ['ChatGPT', 'Claude', 'Gemini'],
          tags: ['微服务', '架构设计', '分布式'],
          usage: '设计可扩展的微服务架构'
        }
      ]
    },
    {
      id: 'ui-design',
      name: 'UI 设计',
      icon: <EyeOutlined />,
      color: '#722ed1',
      prompts: [
        {
          id: 'design-system',
          title: '设计系统规范',
          description: '创建统一的设计系统规范',
          content: `请帮我设计一个设计系统，包含：
1. 品牌色彩：{brandColors}
2. 字体规范：{typography}
3. 组件库：{components}
4. 设计原则：{principles}

请提供：
- 色彩系统定义
- 字体层级规范
- 组件设计规范
- 设计原则说明
- 使用指南`,
          aiRecommend: ['ChatGPT', 'Claude', 'Midjourney'],
          tags: ['设计系统', 'UI规范', '组件库'],
          usage: '建立统一的设计系统'
        },
        {
          id: 'user-flow',
          title: '用户流程设计',
          description: '设计用户交互流程和体验',
          content: `请帮我设计用户流程：
1. 业务场景：{businessScenario}
2. 目标用户：{targetUsers}
3. 核心功能：{coreFeatures}
4. 成功指标：{successMetrics}

请提供：
- 用户旅程地图
- 交互流程图
- 关键节点设计
- 优化建议`,
          aiRecommend: ['ChatGPT', 'Claude'],
          tags: ['用户体验', '流程设计', '交互'],
          usage: '优化用户交互体验'
        },
        {
          id: 'mobile-design',
          title: '移动端设计规范',
          description: '制定移动端 UI 设计规范',
          content: `请帮我制定移动端设计规范：
1. 平台：{platform}
2. 目标用户：{targetUsers}
3. 功能复杂度：{complexity}
4. 品牌要求：{brand}

请提供：
- 屏幕适配方案
- 交互手势规范
- 组件设计标准
- 性能优化建议
- 无障碍设计考虑`,
          aiRecommend: ['ChatGPT', 'Claude', 'Figma'],
          tags: ['移动端', 'UI设计', '交互规范'],
          usage: '制定移动端设计标准'
        }
      ]
    },
    {
      id: 'programming-rules',
      name: '编程规范',
      icon: <BugOutlined />,
      color: '#fa8c16',
      prompts: [
        {
          id: 'code-review',
          title: '代码审查清单',
          description: '提供全面的代码审查检查项',
          content: `请帮我进行代码审查，检查以下方面：
1. 代码质量：{codeQuality}
2. 性能优化：{performance}
3. 安全性：{security}
4. 可维护性：{maintainability}

请检查：
- 代码规范和风格
- 逻辑正确性
- 性能瓶颈
- 安全隐患
- 文档完整性
- 测试覆盖率`,
          aiRecommend: ['ChatGPT', 'Claude', 'Copilot'],
          tags: ['代码审查', '质量检查', '最佳实践'],
          usage: '确保代码质量和规范性'
        },
        {
          id: 'refactoring',
          title: '代码重构建议',
          description: '提供代码重构和优化建议',
          content: `请帮我重构以下代码：
1. 当前代码：{currentCode}
2. 重构目标：{refactoringGoals}
3. 技术栈：{techStack}
4. 约束条件：{constraints}

请提供：
- 重构方案
- 代码示例
- 重构步骤
- 风险分析
- 测试建议`,
          aiRecommend: ['ChatGPT', 'Claude', 'Copilot'],
          tags: ['代码重构', '优化', '架构'],
          usage: '改进代码结构和质量'
        },
        {
          id: 'testing-strategy',
          title: '测试策略设计',
          description: '制定全面的测试策略和方案',
          content: `请帮我制定测试策略：
1. 项目类型：{projectType}
2. 技术栈：{techStack}
3. 质量要求：{quality}
4. 时间约束：{timeConstraint}

请提供：
- 测试类型选择
- 测试用例设计
- 自动化测试方案
- 测试环境配置
- 持续集成策略`,
          aiRecommend: ['ChatGPT', 'Claude', 'Gemini'],
          tags: ['测试策略', '自动化测试', '质量保证'],
          usage: '建立完善的测试体系'
        }
      ]
    }
  ]
};

// 获取所有提示词
export const getAllPrompts = () => {
  return promptData.categories.flatMap(category => 
    category.prompts.map(prompt => ({
      ...prompt,
      category: category.name,
      categoryId: category.id
    }))
  );
};

// 根据分类获取提示词
export const getPromptsByCategory = (categoryId) => {
  const category = promptData.categories.find(cat => cat.id === categoryId);
  return category ? category.prompts : [];
};

// 搜索提示词
export const searchPrompts = (keyword) => {
  const allPrompts = getAllPrompts();
  const lowerKeyword = keyword.toLowerCase();
  
  return allPrompts.filter(prompt => 
    prompt.title.toLowerCase().includes(lowerKeyword) ||
    prompt.description.toLowerCase().includes(lowerKeyword) ||
    prompt.tags.some(tag => tag.toLowerCase().includes(lowerKeyword)) ||
    prompt.usage.toLowerCase().includes(lowerKeyword)
  );
}; 
