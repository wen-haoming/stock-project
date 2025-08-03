import { 
  CodeOutlined, 
  BugOutlined, 
  ToolOutlined, 
  EyeOutlined 
} from '@ant-design/icons';

// 分类配置
export const categoryConfigs = {
  frontend: {
    id: 'frontend',
    name: '前端开发',
    icon: <CodeOutlined />,
    color: '#1890ff'
  },
  backend: {
    id: 'backend',
    name: '后端开发',
    icon: <ToolOutlined />,
    color: '#52c41a'
  },
  'ui-design': {
    id: 'ui-design',
    name: 'UI 设计',
    icon: <EyeOutlined />,
    color: '#722ed1'
  },
  devops: {
    id: 'devops',
    name: 'DevOps',
    icon: <CodeOutlined />,
    color: '#13c2c2'
  }
};

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
          content: `import React, { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);

  const increment = () => setCount(count + 1);
  const decrement = () => setCount(count - 1);

  return (
    <div style={{ textAlign: 'center', padding: '20px' }}>
      <h2>计数器组件</h2>
      <div style={{ fontSize: '24px', margin: '20px 0' }}>
        当前计数: {count}
      </div>
      <div>
        <button 
          onClick={decrement}
          style={{ 
            margin: '0 10px', 
            padding: '10px 20px',
            fontSize: '16px'
          }}
        >
          减少
        </button>
        <button 
          onClick={increment}
          style={{ 
            margin: '0 10px', 
            padding: '10px 20px',
            fontSize: '16px'
          }}
        >
          增加
        </button>
      </div>
    </div>
  );
}

export default Counter;`,
          aiRecommend: ['ChatGPT', 'Claude', 'Gemini'],
          tags: ['React', '组件', '代码生成'],
          usage: '用于快速生成 React 组件代码'
        },
        {
          id: 'vue-component',
          title: 'Vue 组件生成',
          description: '生成 Vue 3 组件代码，支持 Composition API',
          content: `<template>
  <div class="todo-app">
    <h2>待办事项</h2>
    <div class="input-section">
      <input 
        v-model="newTodo" 
        @keyup.enter="addTodo"
        placeholder="输入待办事项..."
        class="todo-input"
      />
      <button @click="addTodo" class="add-btn">添加</button>
    </div>
    <ul class="todo-list">
      <li 
        v-for="todo in todos" 
        :key="todo.id"
        :class="{ completed: todo.completed }"
        class="todo-item"
      >
        <input 
          type="checkbox" 
          v-model="todo.completed"
          class="todo-checkbox"
        />
        <span class="todo-text">{{ todo.text }}</span>
        <button @click="removeTodo(todo.id)" class="delete-btn">删除</button>
      </li>
    </ul>
  </div>
</template>

<script>
import { ref } from 'vue'

export default {
  name: 'TodoApp',
  setup() {
    const todos = ref([])
    const newTodo = ref('')

    const addTodo = () => {
      if (newTodo.value.trim()) {
        todos.value.push({
          id: Date.now(),
          text: newTodo.value,
          completed: false
        })
        newTodo.value = ''
      }
    }

    const removeTodo = (id) => {
      todos.value = todos.value.filter(todo => todo.id !== id)
    }

    return {
      todos,
      newTodo,
      addTodo,
      removeTodo
    }
  }
}
</script>

<style scoped>
.todo-app {
  max-width: 500px;
  margin: 0 auto;
  padding: 20px;
}

.input-section {
  display: flex;
  margin-bottom: 20px;
}

.todo-input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-right: 10px;
}

.add-btn {
  padding: 10px 20px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.todo-list {
  list-style: none;
  padding: 0;
}

.todo-item {
  display: flex;
  align-items: center;
  padding: 10px;
  border-bottom: 1px solid #eee;
}

.todo-checkbox {
  margin-right: 10px;
}

.todo-text {
  flex: 1;
}

.completed .todo-text {
  text-decoration: line-through;
  color: #999;
}

.delete-btn {
  padding: 5px 10px;
  background: #ff4d4f;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
</style>`,
          aiRecommend: ['ChatGPT', 'Claude', 'Gemini'],
          tags: ['Vue', '组件', 'Composition API'],
          usage: '快速生成 Vue 3 组件代码'
        },
        {
          id: 'html-template',
          title: 'HTML 模板生成',
          description: '生成现代化的 HTML 页面模板',
          content: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>现代化网页模板</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        .header {
            text-align: center;
            color: white;
            margin-bottom: 40px;
        }

        .header h1 {
            font-size: 3rem;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }

        .header p {
            font-size: 1.2rem;
            opacity: 0.9;
        }

        .card {
            background: white;
            border-radius: 10px;
            padding: 30px;
            margin-bottom: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
        }

        .card:hover {
            transform: translateY(-5px);
        }

        .card h2 {
            color: #667eea;
            margin-bottom: 15px;
        }

        .button {
            display: inline-block;
            padding: 12px 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 25px;
            transition: all 0.3s ease;
            border: none;
            cursor: pointer;
            font-size: 16px;
        }

        .button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-top: 40px;
        }

        @media (max-width: 768px) {
            .header h1 {
                font-size: 2rem;
            }
            
            .container {
                padding: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1>欢迎使用</h1>
            <p>这是一个现代化的网页模板</p>
        </header>

        <div class="grid">
            <div class="card">
                <h2>功能特性</h2>
                <p>响应式设计，支持各种设备屏幕尺寸。现代化的渐变背景和卡片式布局。</p>
                <button class="button">了解更多</button>
            </div>

            <div class="card">
                <h2>技术栈</h2>
                <p>使用纯HTML、CSS和JavaScript构建，无需任何框架依赖，加载速度快。</p>
                <button class="button">查看源码</button>
            </div>

            <div class="card">
                <h2>设计理念</h2>
                <p>简洁、现代、用户友好的设计理念，注重用户体验和视觉效果。</p>
                <button class="button">设计指南</button>
            </div>
        </div>
    </div>

    <script>
        // 添加一些交互效果
        document.addEventListener('DOMContentLoaded', function() {
            const buttons = document.querySelectorAll('.button');
            
            buttons.forEach(button => {
                button.addEventListener('click', function() {
                    alert('按钮被点击了！');
                });
            });

            // 添加滚动动画
            const cards = document.querySelectorAll('.card');
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.style.opacity = '1';
                        entry.target.style.transform = 'translateY(0)';
                    }
                });
            });

            cards.forEach(card => {
                card.style.opacity = '0';
                card.style.transform = 'translateY(20px)';
                card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
                observer.observe(card);
            });
        });
    </script>
</body>
</html>`,
          aiRecommend: ['ChatGPT', 'Claude'],
          tags: ['HTML', 'CSS', '模板'],
          usage: '生成现代化的HTML页面模板'
        },
        {
          id: 'css-layout',
          title: 'CSS 布局方案',
          description: '提供现代化的 CSS 布局解决方案',
          content: `请帮我实现以下布局效果：
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
