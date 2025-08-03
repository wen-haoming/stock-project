# 提示词文件夹结构

这个文件夹包含了所有提示词的分类和内容，采用结构化的文件夹组织方式。

## 文件夹结构

```
prompts/
├── frontend/                    # 前端开发分类
│   ├── react-component/         # React组件提示词
│   │   ├── config.json         # 配置文件
│   │   ├── prompt.md           # 提示词内容
│   │   └── codes/              # 代码文件夹
│   │       └── App.js          # 示例代码
│   ├── vue-component/           # Vue组件提示词
│   │   ├── config.json
│   │   ├── prompt.md
│   │   └── codes/
│   │       └── App.vue
│   └── html-template/           # HTML模板提示词
│       ├── config.json
│       ├── prompt.md
│       └── codes/
│           └── index.html
├── backend/                     # 后端开发分类
│   ├── api-design/
│   ├── database-query/
│   └── microservice/
├── ui-design/                   # UI设计分类
│   ├── design-system/
│   ├── user-flow/
│   └── mobile-design/
└── devops/                      # DevOps分类
    ├── docker-config/
    ├── kubernetes-deployment/
    └── ci-cd-pipeline/
```

## 文件说明

### config.json
每个提示词文件夹都必须包含一个 `config.json` 文件，包含以下字段：

```json
{
  "id": "unique-id",
  "title": "提示词标题",
  "description": "提示词描述",
  "aiRecommend": ["ChatGPT", "Claude", "Gemini"],
  "tags": ["标签1", "标签2"],
  "usage": "使用场景说明",
  "category": "分类ID",
  "hasCode": true,
  "codeType": "react|vue|html",
  "createdAt": "2024-01-01",
  "updatedAt": "2024-01-01",
  "version": "1.0.0",
  "author": "作者",
  "difficulty": "beginner|intermediate|advanced",
  "estimatedTime": "预计使用时间"
}
```

### prompt.md
包含提示词的具体内容，使用Markdown格式。

### codes/
如果提示词包含代码示例，则在 `codes/` 文件夹中存放代码文件。

## 添加新的提示词

1. 在对应的分类文件夹下创建新的提示词文件夹
2. 创建 `config.json` 配置文件
3. 创建 `prompt.md` 提示词内容文件
4. 如果需要代码示例，创建 `codes/` 文件夹并添加代码文件

## 示例

### 添加新的React组件提示词

1. 创建文件夹：`frontend/new-react-component/`
2. 创建配置文件：`config.json`
3. 创建提示词：`prompt.md`
4. 创建代码示例：`codes/Component.js`

### 添加新的分类

1. 在 `prompts/` 下创建新的分类文件夹
2. 在 `loader.js` 中添加分类配置
3. 添加该分类下的提示词

## 注意事项

- 每个提示词必须有唯一的ID
- 配置文件必须包含所有必需字段
- 代码文件应该与提示词内容保持一致
- 文件夹名称应该使用kebab-case格式 