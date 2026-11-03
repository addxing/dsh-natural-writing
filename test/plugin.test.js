import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, inject } from '../index.js';
import { SECTION_NAME, WRITING_POLICY, reviewText } from '../policy.js';

// 覆盖建议边界、定位、代码保护及输出上限，不把套话匹配当成来源检测。
test('review returns localized suggestions without changing text', () => {
  const input = '当然可以。\n综上所述，这项工作具有重要意义。';
  const result = reviewText(input);
  assert.equal(result.total, 3);
  assert.equal(result.findings[1].line, 2);
  assert.equal(result.findings[1].phrase, '综上所述');
  assert.equal(input, '当然可以。\n综上所述，这项工作具有重要意义。');
  assert.match(result.note, /不评估 AI 概率/);
});

test('protects fenced code, inline code and common quotations', () => {
  const text = '```js\nconst x = "赋能";\n```\n`全方位`\n> 综上所述\n“多维度”\n「深度融合」\n当然可以';
  const result = reviewText(text);
  assert.equal(result.total, 1);
  assert.equal(result.findings[0].line, 8);
});

test('handles tilde fences, indentation and unterminated fences', () => {
  assert.equal(reviewText('  ~~~~text\n赋能\n  ~~~~\n综上所述').total, 1);
  assert.equal(reviewText('```js\n赋能').total, 0);
});

test('does not label neutral professional prose or connectors', () => {
  assert.equal(reviewText('首先核对金额 12.5 元，其次确认日期 2026-11-03；风险尚未排除。').total, 0);
});

test('bounds results and rejects invalid input', () => {
  const result = reviewText('赋能 '.repeat(40), 2);
  assert.equal(result.findings.length, 2);
  assert.equal(result.total, 40);
  assert.equal(result.truncated, true);
  for (const input of ['', '  ', null, {}, 'a'.repeat(60001)]) {
    assert.throws(() => reviewText(input));
  }
  for (const limit of [0, 31, 1.5, '2']) assert.throws(() => reviewText('正文', limit));
});

// 用受控服务验证注册和销毁，不触碰真实用户配置或文件。
test('owns registrations and exposes a working read-only tool', async () => {
  const sections = [];
  const tools = [];
  const disposers = [];
  let disposed = 0;
  apply({
    effect(callback) { disposers.push(callback()); },
    systemPrompt: { section(section) { sections.push(section); return () => { disposed++; }; } },
    tools: { register(tool) { tools.push(tool); return () => { disposed++; }; } },
  });
  assert.deepEqual(inject, ['systemPrompt', 'tools']);
  assert.equal(sections[0].name, SECTION_NAME);
  assert.equal(sections[0].text, WRITING_POLICY);
  assert.equal(sections[0].interpolate, false);
  assert.equal(sections[0].complete, undefined);
  const tool = tools[0];
  assert.equal(tool.name, 'natural_writing_review');
  const result = await tool.execute({ text: '全方位赋能' });
  assert.equal(result.total, 2);
  assert.equal(tool.output.render({}, result)[0].type, 'text');
  assert.deepEqual(JSON.parse(tool.output.render({}, result)[0].text), result);
  await assert.rejects(() => tool.execute(null));
  await assert.rejects(() => tool.execute({ text: '正文', protected: true }));
  await assert.rejects(() => tool.execute({ text: '正文', maxFindings: null }));
  await assert.rejects(() => tool.execute({ text: '正文', reviewQuotedText: null }));
  assert.equal((await tool.execute({ text: '“赋能”', reviewQuotedText: true })).total, 1);
  assert.equal((await tool.execute({ text: '“赋能”' })).total, 0);
  assert.ok(tool.parameters.properties.reviewQuotedText);
  for (const key of tool.output.schema.properties.findings.items.required) {
    assert.ok(Object.hasOwn(result.findings[0], key), key);
  }
  disposers.forEach(dispose => dispose());
  assert.equal(disposed, 2);
});

// 针对审查中复现的问题逐项回归，避免仅验证理想格式。
test('rejects false closing fences and keeps following prose visible', () => {
  const text = '```text\n普通内容\n```not-a-close\n赋能\n```\n当然可以';
  const result = reviewText(text);
  assert.deepEqual(result.findings.map(item => item.phrase), ['当然可以']);
  assert.equal(result.findings[0].line, 6);
});

test('supports longer closing fences, mismatched fences and CRLF', () => {
  assert.equal(reviewText('```text\r\n赋能\r\n````\r\n全方位').total, 1);
  assert.equal(reviewText('~~~~text\n~~~\n赋能\n~~~~\n综上所述').total, 1);
  assert.equal(reviewText('```text\n~~~\n赋能\n```\n综上所述').total, 1);
  assert.equal(reviewText('```').total, 0);
});

test('reviews quoted slogans only on explicit request', () => {
  const text = '本产品主打“全方位赋能”，致力于“开启新篇章”。';
  assert.equal(reviewText(text).total, 0);
  assert.equal(reviewText(text, 12, true).total, 3);
  assert.equal(reviewText('> 全方位赋能', 12, true).total, 0);
  assert.throws(() => reviewText(text, 12, 'true'));
});

test('protects indented code and multiple-backtick inline code', () => {
  assert.equal(reviewText('    const title = "全方位赋能";\n\t赋能\n当然可以', 12, true).total, 1);
  assert.equal(reviewText('``代码 `赋能` ``\n当然可以').total, 1);
  assert.equal(reviewText('`代码\n全方位赋能`\n当然可以').total, 1);
  assert.equal(reviewText('单独的 ` 标记，赋能').total, 1);
});

test('protects link destinations and definitions but reviews visible labels', () => {
  const text = '[全方位](https://example.com/(赋能))\n[资料](https://example.com/赋能)\n[ref]: https://example.com/赋能\n<https://example.com/赋能>\nhttps://example.com/赋能';
  const result = reviewText(text);
  assert.deepEqual(result.findings.map(item => item.phrase), ['全方位']);
  assert.equal(reviewText('[资料](https://example.com/\\(赋能\\))\n当然可以').total, 1);
});

test('protects formulas and does not mask escaped currency across lines', () => {
  const text = '$\\text{赋能}$\n$$\n全方位\n$$\n\\[赋能\\]\n\\(全方位\\)\n当然可以';
  assert.deepEqual(reviewText(text).findings.map(item => item.phrase), ['当然可以']);
  assert.equal(reviewText('价格 \\$12.5 元，赋能').total, 1);
  assert.equal(reviewText('价格 $12.5\n赋能').total, 1);
  assert.equal(reviewText('\\(赋能\\)\\(全方位\\)\n当然可以').total, 1);
  assert.equal(reviewText('$$赋能$$$$全方位$$\n当然可以').total, 1);
});

test('disambiguates repeated phrases with exact ranges and bounded context', () => {
  const text = '赋能业务，赋能服务。';
  const result = reviewText(text);
  assert.deepEqual(result.findings.map(item => item.column), [1, 6]);
  assert.deepEqual(result.findings.map(item => item.start), [0, 5]);
  for (const finding of result.findings) {
    assert.equal(text.slice(finding.start, finding.end), finding.phrase);
    assert.ok(finding.context.includes(finding.phrase));
    assert.ok(finding.context.length <= 40 + finding.phrase.length);
  }
});

test('keeps locations correct after masks, emoji and different newlines', () => {
  for (const newline of ['\n', '\r\n', '\r']) {
    const text = '“赋能”' + newline + '😀全方位';
    const finding = reviewText(text).findings[0];
    assert.equal(finding.line, 2);
    assert.equal(finding.column, 2);
    assert.equal(text.slice(finding.start, finding.end), '全方位');
  }
});

test('read-only review preserves facts and acknowledges semantic limitations', () => {
  const text = '2026-11-03 金额 12.5 元，不保证退款；风险尚未排除。赋能业务。';
  const original = text;
  const result = reviewText(text);
  assert.equal(text, original);
  assert.equal(result.total, 1);
  assert.match(result.note, /无命中不代表文风已自然/);
});

test('policy covers document safety and user style priority', () => {
  for (const term of ['Word/PPT/Excel', '数字', '否定', '不确定性', '引用', '代码', '另存副本', '用户明确', '不保证通过检测']) {
    assert.ok(WRITING_POLICY.includes(term), term);
  }
});
