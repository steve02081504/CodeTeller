/**
 * 纯文本分析：缩进探测、成对符号启发式、行列索引（供播放器光标导航）
 */

const CORE_ALWAYS_PAIRS = {
	'(': ')',
	'[': ']',
	'{': '}',
}

const QUOTE_CHARS = ['"', '\'', '`']

/**
 * 探测缩进单位
 * @param {string} text 文件全文
 * @returns {string} 缩进单位：'\t' 或若干空格
 */
export function detectIndentUnit(text) {
	const lines = text.split('\n')
	let tabLines = 0
	let spaceLines = 0
	const spaceWidthCounts = new Map()
	for (const line of lines) {
		if (!line.trim()) continue
		const indentMatch = line.match(/^([ \t]+)/)
		if (!indentMatch) continue
		const prefix = indentMatch[1]
		if (prefix[0] === '\t') tabLines++
		else {
			spaceLines++
			const spaceCount = prefix.length
			if (spaceCount > 0) spaceWidthCounts.set(spaceCount, (spaceWidthCounts.get(spaceCount) || 0) + 1)
		}
	}
	if (tabLines >= spaceLines) return '\t'
	let bestWidth = 4
	let bestCount = -1
	for (const [spaceCount, occurrenceCount] of spaceWidthCounts.entries())
		if (spaceCount > 0 && occurrenceCount > bestCount) {
			bestWidth = spaceCount
			bestCount = occurrenceCount
		}

	return ' '.repeat(bestWidth)
}

/**
 * 判断反斜杠是否成对
 * @param {string} line 单行文本
 * @param {number} idx 字符索引
 * @returns {boolean} 该位置反斜杠是否成对（奇数个前导 `\` 则视为转义）
 */
function isEscaped(line, idx) {
	let slash = 0
	for (let i = idx - 1; i >= 0 && line[i] === '\\'; i--) slash++
	return slash % 2 === 1
}

/**
 * 计算引号匹配比例
 * @param {string} text 全文
 * @param {string} quoteChar 引号字符
 * @returns {number} 0–1，成对引号占比
 */
function quoteMatchRatioOnSingleLine(text, quoteChar) {
	let total = 0
	let matched = 0
	const lines = text.split('\n')
	for (const line of lines)
		for (let i = 0; i < line.length; i++) {
			if (line[i] !== quoteChar) continue
			if (isEscaped(line, i)) continue
			total++
			let isPaired = false
			for (let j = i + 1; j < line.length; j++)
				if (line[j] === quoteChar && !isEscaped(line, j)) {
					isPaired = true
					i = j
					break
				}

			if (isPaired) matched++
		}

	if (total === 0) return 0
	return matched / total
}

/**
 * 去除引号内容
 * @param {string} text 全文
 * @returns {string} 将引号内替换为空格，便于括号配对分析
 */
function stripQuotedContent(text) {
	const out = new Array(text.length)
	let activeQuote = ''
	for (let i = 0; i < text.length; i++) {
		const character = text[i]
		if (!activeQuote) {
			if (QUOTE_CHARS.includes(character)) {
				activeQuote = character
				out[i] = ' '
			} else out[i] = character
			continue
		}
		if (character === '\n') {
			activeQuote = ''
			out[i] = '\n'
			continue
		}
		if (character === activeQuote && !isEscaped(text, i)) {
			activeQuote = ''
			out[i] = ' '
			continue
		}
		out[i] = ' '
	}
	return out.join('')
}

/**
 * 计算开闭数量平衡度
 * @param {string} text 全文
 * @param {string} open 开括号
 * @param {string} close 闭括号
 * @returns {number} 开闭数量平衡度 0–1
 */
function bracketPairRatio(text, open, close) {
	let openCount = 0
	let closeCount = 0
	for (const ch of text)
		if (ch === open) openCount++
		else if (ch === close) closeCount++
	if (openCount === 0 || closeCount === 0) return 0
	return Math.min(openCount, closeCount) / Math.max(openCount, closeCount)
}

/**
 * 构建启发式成对符号映射
 * @param {string} text 全文
 * @returns {Record<string, string>} 启发式成对符号映射
 */
export function buildHeuristicPairs(text) {
	const pairs = { ...CORE_ALWAYS_PAIRS }
	for (const quoteChar of QUOTE_CHARS)
		if (quoteMatchRatioOnSingleLine(text, quoteChar) >= 0.9) pairs[quoteChar] = quoteChar

	const cleaned = stripQuotedContent(text)
	for (const [openBracket, closeBracket] of [['<', '>']])
		if (bracketPairRatio(cleaned, openBracket, closeBracket) >= 0.9) pairs[openBracket] = closeBracket

	return pairs
}

/**
 * 从字符索引转换为行列索引
 * @param {string} text 全文
 * @param {number} characterIndex 字符索引
 * @returns {{ row: number, col: number }} 从 0 起的行列
 */
export function rowColFromIndex(text, characterIndex) {
	let row = 0
	let col = 0
	for (let i = 0; i < characterIndex; i++)
		if (text[i] === '\n') {
			row++
			col = 0
		} else col++
	return { row, col }
}

/**
 * 从行列索引转换为字符索引
 * @param {string} text 全文
 * @param {number} targetRow 目标行
 * @param {number} targetCol 目标列
 * @returns {number} 字符索引，找不到为 -1
 */
export function indexFromRowCol(text, targetRow, targetCol) {
	let row = 0
	let col = 0
	for (let i = 0; i <= text.length; i++) {
		if (row === targetRow && col === targetCol) return i
		const character = text[i]
		if (character === '\n') {
			row++
			col = 0
		} else if (character != null) col++
	}
	return -1
}
