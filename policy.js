export const SECTION_NAME = 'local:natural-writing';

// 在生成阶段改进表达，而不是事后对正文做危险的全局替换。
export const WRITING_POLICY = `## 自然文风（文字与文档）
适用于回复、邮件、文案、报告及 Word/PPT/Excel 等文件中的新写或改写正文；不自动处理已有文件。用户明确指定的文体、结构、长度和逐字保留要求优先。
- 直接回应问题或进入正文。少用“当然可以”“以下是为您”“希望对您有所帮助”，不加无意义的开场和收尾。
- 用具体主体、动作和有依据的细节表达。删去空泛拔高、同义反复和营销堆词；“赋能”“多维度”“全方位”“综上所述”等不是禁词，只在确实有意义时使用。
- 按内容组织段落，避免每篇都套“首先—其次—最后”、三点清单或重复总结。需要步骤、对比、检查清单时仍使用列表和表格；不要为去 AI 味破坏可读性。
- 长短句自然搭配，衔接随语义变化。不刻意制造错别字、语病、口癖或随机措辞；不强行口语化、加入个人经历或虚构情绪。
- 工作汇报写清进展、问题和下一步；技术与专业文档保留术语、条件、边界和必要的正式表达；邮件、日常文案按受众调整语气。不要统一改成聊天风格。
- 改写保留原意、事实、数字、单位、日期、实体名、限定条件、否定、风险及不确定性。不新增未经提供的案例、数据、来源、亲历故事或结论。
- 文档正文在写入前检查文风，保留必要标题层级、表格数据、公式、链接和引用。默认不改代码、命令、配置、接口名、原文引述及用户要求逐字保留的文字。
- 软件开发文档优先准确、可执行、可验证，不追求个性、戏剧化短句或随意口语。必要编号、列表、表格、重复术语和规范结构不是 AI 味，不为文风删去。
- 需求文档明确主体、触发条件、输入、系统行为、输出、权限、边界、异常及验收标准；测试用例保留编号、需求关联、前置条件、测试数据、操作步骤和可观察的预期结果。按任务范围检查缺项，不机械套模板。
- 测试预期避免仅写“功能正常、正确处理、运行流畅”；有需求依据时写清可观察状态、响应、数据变化和时间阈值，无依据的细节或阈值列为待确认，不能猜测。
- 保留“必须、应、可以、不得”等约束强度，保持同一概念名称一致；接口名、字段名、路径、枚举值、状态码、版本号、优先级、比较符号及单位不擅自替换。严禁把未验证改为已支持、把预期结果改为实际结果、把建议改成确定需求。
- 报告区分已完成、进行中、待验证和计划，说明依据、阻塞及下一步；测试报告区分执行结果与未执行项，没有证据不宣称通过或覆盖完整。
- 原文缺失、矛盾、含糊时，单列待确认项并保留来源，不擅自补造业务规则、阈值、性能指标、测试数据或测试结果。润色不等于需求评审或完整测试设计；用户只要求润色时不扩展范围。
- 用户要求润色已有文件时，先读正文和相关 Office 技能，默认另存副本并遵守格式要求；不是直接对二进制文件替换词语。只润色被要求的范围。
- 长篇软件文档先依据上下文改写，再对照原文复核事实、条件、约束、术语和结构；默认交付最终稿，需确认的问题另列，不要求每次展示草稿和内部审稿过程。
- 交付前默读一次，去掉不提供信息的句子，检查改写是否改变事实或语气强度。文风检查只是编辑建议，不代表 AI 来源鉴定，不保证通过检测；保持必要的来源披露。
可用 natural_writing_review 检查一段中文正文的常见模板表达；它只返回局部建议，不会改写或保存文件。普通生成无需调用。`;

const PATTERNS = [
  { id: 'courtesy', pattern: /当然可以|以下是为(?:您|你)|希望(?:这些|以上)?(?:内容|建议)?对(?:您|你)有所帮助/gu, suggestion: '若不是对话礼貌所需，可省去这段开场或收尾，直接进入内容。' },
  { id: 'generic-summary', pattern: /综上所述|总而言之|值得注意的是|不难发现/gu, suggestion: '检查后文是否有新信息；可直接陈述结论，确有转折或提醒则保留。' },
  { id: 'abstract-promotion', pattern: /赋能|全方位|多维度|深度融合|开启新篇章|具有重要意义/gu, suggestion: '检查是否空泛；有依据时写清具体动作和作用，不补造事实。' },
];

// 屏蔽只替换字符、不删换行，确保所有定位仍指向原文的同一位置。
function mask(text) {
  return text.replace(/[^\r\n]/g, ' ');
}

// 围栏按行解析：结束标记不能带正文，必须同字符且不短于起始标记。
function maskBlocks(text) {
  let fence;
  return text.replace(/[^\r\n]+/g, line => {
    if (fence) {
      const close = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = undefined;
      return mask(line);
    }
    const open = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (open && (open[1][0] === '~' || !open[2].includes('`'))) {
      fence = open[1];
      return mask(line);
    }
    // 四空格或制表符缩进、显式块引用以及链接定义不属于默认检查正文。
    if (/^(?: {4}|\t| {0,3}>| {0,3}\[[^\]]+\]:)/.test(line)) return mask(line);
    return line;
  });
}

// 配对相同长度的反引号，支持多反引号和跨行代码；孤立标记不吞掉后文。
function maskInlineCode(text) {
  const runs = [...text.matchAll(/`+/g)];
  const next = new Map();
  const pairs = new Map();
  for (let i = runs.length - 1; i >= 0; i--) {
    const length = runs[i][0].length;
    if (next.has(length)) pairs.set(i, next.get(length));
    next.set(length, i);
  }
  const pieces = [];
  let start = 0;
  for (let i = 0; i < runs.length; i++) {
    // 仅正文中的起始标记受反斜杠转义影响；代码内部反斜杠不阻止闭合。
    let slashes = 0;
    for (let j = runs[i].index - 1; j >= 0 && text[j] === '\\'; j--) slashes++;
    if (slashes % 2 !== 0) continue;
    const endRun = pairs.get(i);
    if (endRun === undefined) continue;
    const from = runs[i].index;
    const to = runs[endRun].index + runs[endRun][0].length;
    pieces.push(text.slice(start, from), mask(text.slice(from, to)));
    start = to;
    i = endRun;
  }
  pieces.push(text.slice(start));
  return pieces.join('');
}

// 链接目标允许嵌套括号和转义；只屏蔽目标，保留可见标签供检查。
function maskLinkTargets(text) {
  // 先线性配对括号，坏链接不会阻止后面的正常链接，也避免重复扫描尾部。
  const stack = [];
  const closes = new Map();
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '(') stack.push(i);
    if (text[i] === ')' && stack.length) closes.set(stack.pop(), i);
  }
  const pieces = [];
  let start = 0;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] !== ']' || text[i + 1] !== '(') continue;
    const close = closes.get(i + 1);
    if (close === undefined) continue;
    const end = close + 1;
    pieces.push(text.slice(start, i + 1), mask(text.slice(i + 1, end)));
    start = end;
    i = end - 1;
  }
  pieces.push(text.slice(start));
  return pieces.join('')
    .replace(/(\[[^\]\r\n]*\])(\[[^\]\r\n]*\])/g, (_match, label, reference) => label + mask(reference))
    .replace(/<(?:https?:\/\/|mailto:)[^>\r\n]*>/gi, mask)
    // 中文句读作为裸链接边界，避免把紧跟 URL 的中文正文一起吞掉。
    .replace(/\bhttps?:\/\/[^\s<>"“”，。；：！？、（）【】]+/gi, mask);
}

// 保护常见公式。美元内联公式按行匹配，避免孤立金额符号吞掉整篇正文。
function maskMath(text) {
  const prose = text.replace(/(?<!\\)(?:\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g, mask);
  const dollars = [];
  for (let i = 0; i < prose.length; i++) {
    if (prose[i] === '\\') { i++; continue; }
    if (prose[i] === '$') dollars.push(i);
  }
  const pieces = [];
  let start = 0;
  for (let i = 0; i < dollars.length - 1; i++) {
    const from = dollars[i];
    const to = dollars[i + 1];
    const body = prose.slice(from + 1, to);
    if (!body || /[\r\n]/.test(body)) continue;
    const numeric = /^\d/.test(body);
    const math = /\\[a-zA-Z]+/.test(body) || /[=+*^_]/.test(body);
    // 拒绝金额候选时不消费下一个美元标记，后续真实公式仍可正常识别。
    if (numeric && (!math || /[，。；！？]/.test(body))) continue;
    pieces.push(prose.slice(start, from), mask(prose.slice(from, to + 1)));
    start = to + 1;
    i++;
  }
  pieces.push(prose.slice(start));
  return pieces.join('');
}

// 默认保留引述；检查引号内文案必须显式开启，仍不检查 Markdown 块引用。
function proseOnly(text, reviewQuotedText) {
  let prose = maskMath(maskLinkTargets(maskInlineCode(maskBlocks(text))));
  if (!reviewQuotedText) {
    prose = prose.replace(/“[^”]*”|‘[^’]*’|「[^」]*」|『[^』]*』|"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'/g, mask);
  }
  return prose;
}

// 输出范围使用 UTF-16 零起点、结束不含；行列从 1 开始，列按 Unicode 字符计数。
export function reviewText(text, maxFindings = 12, reviewQuotedText = false) {
  if (typeof text !== 'string' || !text.trim()) throw new TypeError('text 必须是非空正文。');
  if (text.length > 60000) throw new RangeError('正文不能超过 60000 个 UTF-16 代码单元，请分段检查。');
  if (!Number.isInteger(maxFindings) || maxFindings < 1 || maxFindings > 30) throw new RangeError('maxFindings 必须是 1 到 30 的整数。');
  if (typeof reviewQuotedText !== 'boolean') throw new TypeError('reviewQuotedText 必须是布尔值。');
  const matches = [];
  const prose = proseOnly(text, reviewQuotedText);
  for (const rule of PATTERNS) {
    for (const match of prose.matchAll(rule.pattern)) {
      matches.push({ index: match.index, rule: rule.id, phrase: match[0], suggestion: rule.suggestion });
    }
  }
  matches.sort((a, b) => a.index - b.index);
  return {
    findings: matches.slice(0, maxFindings).map(({ index, ...finding }) => {
      const preceding = text.slice(0, index);
      const lines = preceding.split(/\r\n|\r|\n/);
      return {
        ...finding,
        line: lines.length,
        column: [...lines.at(-1)].length + 1,
        start: index,
        end: index + finding.phrase.length,
        context: text.slice(Math.max(0, index - 20), Math.min(text.length, index + finding.phrase.length + 20)),
      };
    }),
    total: matches.length,
    truncated: matches.length > maxFindings,
    note: '仅检查常见中文模板表达，不评估 AI 概率。命中不代表必须删除；无命中不代表文风已自然。代码、公式及链接保护为常见语法子集，需结合上下文复核。开启引号内检查也不代表允许改写原文引用。未修改原文或文件。',
  };
}
