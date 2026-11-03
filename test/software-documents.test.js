import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { WRITING_POLICY, reviewText } from '../policy.js';

// 规则覆盖验证不冒充模型效果评测：检查关键约束确实进入生成提示词。
test('policy covers requirements, test cases, reports and technical identifiers', () => {
  for (const term of ['可执行、可验证', '验收标准', '需求关联', '前置条件', '测试数据', '可观察',
    '必须、应、可以、不得', '枚举值', '状态码', '比较符号', '待确认项', '未执行项', '预期结果改为实际结果']) {
    assert.ok(WRITING_POLICY.includes(term), term);
  }
});

test('does not flag required structure, constraints or consistent technical terminology', () => {
  const text = '# REQ-001 保存\n用户必须登录；未登录时不得保存。超时应返回 HTTP 408。\n| 编号 | 前置条件 | 步骤 | 预期结果 |\n| TC-001 | token 有效 | 点击保存 | 状态为 pending |\n报告：完成 3 项，2 项待验证；P0 问题未关闭。';
  assert.equal(reviewText(text).total, 0);
});

test('protects literal values using single quotes by default', () => {
  assert.equal(reviewText("字段值为 '赋能'，不得修改。‘全方位’是引用。").total, 0);
  assert.equal(reviewText("口号为 '赋能'。", 12, true).total, 1);
});

test('does not swallow prose following a bare URL', () => {
  const text = '资料 https://example.com。赋能业务。';
  assert.equal(reviewText(text).findings[0].phrase, '赋能');
});

test('reference identifiers are protected while labels remain visible', () => {
  assert.equal(reviewText('[资料][赋能]\n[赋能]: https://example.com').total, 0);
  assert.equal(reviewText('[全方位][ref]\n[ref]: https://example.com').total, 1);
});

test('a malformed link does not break later valid relative links', () => {
  const text = '[broken](未闭合\n[资料](path/赋能)\n全方位';
  assert.deepEqual(reviewText(text).findings.map(item => item.phrase), ['全方位']);
});

test('dollar amounts do not hide prose and escaped dollars stay inside formulas', () => {
  assert.equal(reviewText('预算 $12，赋能业务，结算 $20。').total, 1);
  assert.deepEqual(reviewText('预算 $12，赋能业务；公式 $\\text{全方位}$。').findings.map(item => item.phrase), ['赋能']);
  assert.equal(reviewText('预算 $12，赋能目标=产品效率，结算 $20。').total, 1);
  assert.deepEqual(reviewText('$2\\times\\text{赋能}$\n当然可以').findings.map(item => item.phrase), ['当然可以']);
  assert.deepEqual(reviewText('$\\text{价格 \\$12，赋能}$\n当然可以').findings.map(item => item.phrase), ['当然可以']);
});

test('escaped backticks are prose rather than code', () => {
  assert.equal(reviewText('\\`赋能\\`').total, 1);
  assert.equal(reviewText('`赋能`').total, 0);
  assert.deepEqual(reviewText('`赋能\\`\n当然可以').findings.map(item => item.phrase), ['当然可以']);
});

// 确定性混合样本验证原文范围，涵盖 emoji、屏蔽区和重复命中。
test('all reported ranges map to original text in mixed generated samples', () => {
  const segments = ['😀赋能', '`赋能`', '“赋能”', '[资料](p/赋能)', '全方位', '\r\n', '普通内容'];
  for (let seed = 0; seed < 100; seed++) {
    const text = Array.from({ length: 20 }, (_, i) => segments[(seed * 3 + i * 5) % segments.length]).join(' ');
    const result = reviewText(text, 30);
    for (const finding of result.findings) {
      assert.equal(text.slice(finding.start, finding.end), finding.phrase);
      assert.ok(finding.start >= 0 && finding.end <= text.length);
      assert.ok(finding.line >= 1 && finding.column >= 1);
    }
  }
});

test('handles maximum input and malformed delimiters within a generous time bound', () => {
  const text = ']('.repeat(29000) + '赋能';
  const start = performance.now();
  assert.equal(reviewText(text).total, 1);
  assert.ok(performance.now() - start < 3000, '畸形输入应在 3 秒内完成');
  assert.equal(reviewText('a'.repeat(59998) + '赋能').total, 1);
});
