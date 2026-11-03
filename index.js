import { SECTION_NAME, WRITING_POLICY, reviewText } from './policy.js';

export const inject = ['systemPrompt', 'tools'];

// 使用独立的提示词段落，不接管请求或流，不篡改历史回复和其他插件。
export function apply(ctx) {
  ctx.effect(() => ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: 10300,
    interpolate: false,
    text: WRITING_POLICY,
  }));

  // 检查工具只返回建议；真正的润色仍由模型依据上下文和用户要求完成。
  ctx.effect(() => ctx.tools.register({
    name: 'natural_writing_review',
    description: '只读检查中文正文中的常见模板套话，返回定位、上下文和编辑建议；不改写文件，不鉴定 AI 来源。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '待检查的中文正文，最多 60000 个 UTF-16 代码单元；Office 文件先提取正文。' },
        maxFindings: { type: 'integer', description: '返回建议的数量上限，1–30，默认 12。' },
        reviewQuotedText: { type: 'boolean', description: '是否检查引号内的文字，默认 false；检查强调用语、口号时可开启，不代表允许修改原文引用。' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          findings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                rule: { type: 'string' }, phrase: { type: 'string' },
                suggestion: { type: 'string' }, line: { type: 'integer' },
                column: { type: 'integer' }, start: { type: 'integer' },
                end: { type: 'integer' }, context: { type: 'string' },
              },
              required: ['rule', 'phrase', 'suggestion', 'line', 'column', 'start', 'end', 'context'],
              additionalProperties: false,
            },
          },
          total: { type: 'integer' }, truncated: { type: 'boolean' }, note: { type: 'string' },
        },
        required: ['findings', 'total', 'truncated', 'note'],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new TypeError('请提供正文参数。');
      // 运行时同样拒绝未知参数，避免直接调用时静默忽略用户的保护选项。
      if (Object.keys(args).some(key => !['text', 'maxFindings', 'reviewQuotedText'].includes(key))) {
        throw new TypeError('存在未知参数，仅支持 text、maxFindings、reviewQuotedText。');
      }
      return reviewText(args.text, args.maxFindings === undefined ? 12 : args.maxFindings,
        args.reviewQuotedText === undefined ? false : args.reviewQuotedText);
    },
  }));
}
