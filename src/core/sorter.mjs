import { minimatch } from 'https://esm.sh/minimatch'

/**
 * 将 `.codetellerorder` 的模式行归一化到本项目的匹配语义：
 * - 不以 `/` 开头等价于以 `** /` 开头
 * - 以 `/` 开头则正常匹配（由于 filePath 是相对路径，这里去掉首 `/` 锚定到作用域根）
 * - 以 `!` 开头表示取反语义（交由 minimatch 处理）
 * @param {string} rule 排序规则
 * @returns {string|null} 归一化后的排序规则
 */
function normalizeOrderRule(rule) {
	rule = rule.trim()
	const negated = rule.startsWith('!')
	if (negated) rule = rule.slice(1).trim()
	if (!rule) return null

	if (rule.startsWith('/')) rule = rule.slice(1)
	else if (!rule.startsWith('**/')) rule = `**/${rule}`
	rule = rule.replaceAll('**/**', '**')
	return negated ? `!${rule}` : rule
}

/**
 * 默认排序规则：源码 → 其余 → 文档 → 国际化目录 → 点目录
 * （与 README 中指引一致，使用 glob）
 */
export const DEFAULT_ORDER_RULES = [
	'src/**',
	'**',
	'docs/**',
	'locale/**',
	'locales/**',
	'.**',
].map(normalizeOrderRule)

/**
 * 从路径中提取目录基路径（POSIX 风格）。
 * @param {string} filePath 条目路径（POSIX 风格）。
 * @returns {string} 目录基路径；若无则返回空字符串。
 */
function getDirectoryBasePath(filePath) {
	return filePath.includes('/')
		? filePath.slice(0, filePath.lastIndexOf('/'))
		: ''
}

/**
 * 解析 `.codetellerorder` 内容为 glob 规则行
 * @param {string} content `.codetellerorder` 文件内容文本。
 * @returns {string[]} glob 规则行
 */
export function parseOrderRulesFromContent(content) {
	const text = typeof content === 'string' ? content : ''
	const lines = text
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean)
	return lines.length ? lines.map(normalizeOrderRule).filter(Boolean) : DEFAULT_ORDER_RULES
}

/**
 * 计算排序权重
 * @param {string} filePath POSIX 风格路径
 * @param {string[]} orderRules glob 规则行
 * @returns {number} 对所有匹配规则中，取“最特化（最长 pattern）”的规则索引；越小越靠前；未匹配则返回较大值
 */
export function calculateSortWeight(filePath, orderRules) {
	let bestMatched = -1
	let bestRuleLen = -1
	for (let ruleIndex = 0; ruleIndex < orderRules.length; ruleIndex++)
		try {
			const rule = orderRules[ruleIndex]
			if (minimatch(filePath, rule, { dot: true })) {
				// 规则越长通常越“具体”（例如 `src/**` 比 `**` 更具体）
				const len = rule.length
				if (len > bestRuleLen || (len === bestRuleLen && (bestMatched === -1 || ruleIndex < bestMatched))) {
					bestRuleLen = len
					bestMatched = ruleIndex
				}
			}
		} catch {
			/* 非法 glob 行跳过 */
		}

	return bestMatched === -1 ? orderRules.length : bestMatched
}

/**
 * 按排序规则排序路径记录
 * @param {{ path: string }[]} records 待排序的路径记录
 * @param {string[]} orderRules 排序规则（glob 行）
 * @returns {{ path: string }[]} 排序后的新数组
 */
export function sortPathRecordsByOrder(records, orderRules) {
	return [...records].sort((recordA, recordB) => {
		const weightA = calculateSortWeight(recordA.path, orderRules)
		const weightB = calculateSortWeight(recordB.path, orderRules)
		if (weightA !== weightB) return weightA - weightB
		return recordA.path.localeCompare(recordB.path)
	})
}

/**
 * 从已有文本条目中解析排序规则（`.codetellerorder`），如果解析失败则返回默认排序规则
 * @param {Array<{ path: string, content?: string }>} fileEntries 含可选 `.codetellerorder` 的条目
 * @returns {string[]} 解析得到的 glob 排序规则行
 */
export function resolveOrderRulesFromFileEntries(fileEntries) {
	const orderEntry = fileEntries.find(file => file.path.endsWith('.codetellerorder'))
	if (!orderEntry || typeof orderEntry.content !== 'string') return DEFAULT_ORDER_RULES
	return parseOrderRulesFromContent(orderEntry.content)
}

/**
 * 从已有文本条目中构建 `.codetellerorder` 的规则映射（按目录作用域）
 * @param {Array<{ path: string, content?: string }>} fileEntries 含 `.codetellerorder` 的条目
 * @returns {Map<string, string[]>} basePath -> glob 规则行（未前缀化）
 */
export function buildOrderRuleMapFromFileEntries(fileEntries) {
	const map = new Map()
	for (const entry of fileEntries) {
		if (!entry?.path?.endsWith('.codetellerorder')) continue
		const basePath = getDirectoryBasePath(entry.path)
		if (map.has(basePath)) continue
		map.set(basePath, parseOrderRulesFromContent(entry.content))
	}
	return map
}

/**
 * 获取某个文件在“作用域继承”下的有效排序规则（把 basePath 前缀化后返回）
 * @param {string} filePath 待匹配的文件路径（POSIX 相对路径）。
 * @param {Map<string, string[]>} orderRuleMap basePath -> glob 规则行（未前缀化）
 * @returns {string[]} 有效 glob 规则行（已前缀化）
 */
function resolveScopedOrderRulesForFilePath(filePath, orderRuleMap) {
	if (!orderRuleMap || orderRuleMap.size === 0) return DEFAULT_ORDER_RULES

	const applicableBases = []
	for (const basePath of orderRuleMap.keys())
		if (!basePath) applicableBases.push('')
		else if (filePath.startsWith(`${basePath}/`)) applicableBases.push(basePath)

	if (applicableBases.length === 0) return DEFAULT_ORDER_RULES

	// 越深层的规则越“近”，放在前面以提升 tie-break 优先级
	applicableBases.sort((a, b) => {
		const depthA = a ? a.split('/').filter(Boolean).length : 0
		const depthB = b ? b.split('/').filter(Boolean).length : 0
		if (depthA !== depthB) return depthB - depthA
		return a.localeCompare(b)
	})

	const effective = []
	for (const basePath of applicableBases) {
		const rules = orderRuleMap.get(basePath)
		if (!rules?.length) continue
		const prefixedRules = basePath
			? rules.map(r => r.startsWith('!') ? `!${basePath}/${r.slice(1)}` : `${basePath}/${r}`)
			: rules
		effective.push(...prefixedRules)
	}
	return effective.length > 0 ? effective : DEFAULT_ORDER_RULES
}

/**
 * 按“作用域继承”的 `.codetellerorder` 排序路径记录
 * @param {{ path: string }[]} records 待排序路径记录
 * @param {Map<string, string[]>} orderRuleMap basePath -> glob 规则行（未前缀化）
 * @returns {{ path: string }[]} 排序后的新数组
 */
export function sortPathRecordsByScopedOrder(records, orderRuleMap) {
	const enriched = records.map(record => {
		const effectiveRules = resolveScopedOrderRulesForFilePath(record.path, orderRuleMap)
		const weight = calculateSortWeight(record.path, effectiveRules)
		return { record, weight }
	})

	enriched.sort((a, b) => {
		if (a.weight !== b.weight) return a.weight - b.weight
		return a.record.path.localeCompare(b.record.path)
	})
	return enriched.map(x => x.record)
}

/**
 * 按排序规则排序文本文件条目
 * @param {Array<{ path: string, content: string }>} fileEntries 文本文件条目
 * @returns {Array<{ path: string, content: string }>} 按规则排序后的条目
 */
export function sortFilesByOrder(fileEntries) {
	const rules = resolveOrderRulesFromFileEntries(fileEntries)
	return sortPathRecordsByOrder(fileEntries, rules)
}

/**
 * 按“作用域继承”的 `.codetellerorder` 排序文本文件条目
 * @param {Array<{ path: string, content: string }>} fileEntries 文本文件条目
 * @returns {Array<{ path: string, content: string }>} 按规则排序后的条目
 */
export function sortFilesByScopedOrder(fileEntries) {
	const orderRuleMap = buildOrderRuleMapFromFileEntries(fileEntries)
	return sortPathRecordsByScopedOrder(fileEntries, orderRuleMap)
}
