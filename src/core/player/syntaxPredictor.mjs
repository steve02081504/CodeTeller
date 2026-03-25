/**
 * 括号匹配、缩进预测等「IDE 式」辅助，从播放器核心调度中剥离
 */
import { detectIndentUnit, buildHeuristicPairs, rowColFromIndex, indexFromRowCol } from './textAnalyzer.mjs'

/**
 * 判断下一行是否应额外缩进
 * @param {string} previousLine 当前行已输入部分
 * @returns {boolean} 下一行是否应额外缩进
 */
export function needExtraIndent(previousLine) {
	const trimmedStart = previousLine.trimStart()
	return /^(if|else|elif)\b/.test(trimmedStart) || /[\u005B({<]\s*$/.test(previousLine)
}

/**
 * 获取最后一个非空白字符
 * @param {string} input 字符串
 * @returns {string} 最后一个非空白字符，无则空串
 */
export function lastNonWhitespaceCharacter(input) {
	for (let index = input.length - 1; index >= 0; index--)
		if (!/\s/u.test(input[index])) return input[index]

	return ''
}

/**
 * 获取对应闭括号或空串
 * @param {string} openBracket 开括号字符
 * @returns {string} 对应闭括号或空串
 */
export function matchingClosingBracket(openBracket) {
	if (openBracket === '(') return ')'
	if (openBracket === '[') return ']'
	if (openBracket === '{') return '}'
	if (openBracket === '<') return '>'
	return ''
}

/**
 * 打字机播放上下文
 * @typedef {{
 *   cursor: number,
 *   sourcePos: number,
 *   visibleSlice: string,
 *   insert: (ch: string) => void,
 *   deleteAtCursor: () => void,
 *   getCurrentSegment: () => { text: string } | null,
 * }} TypewriterPlaybackContext
 */

/**
 * 根据当前文件与光标上下文预测缩进、括号配对等
 */
export class SyntaxPredictor {
	/** @type {string} */
	#indentUnit = '\t'
	/** @type {Record<string, string>} */
	#bracketPairs = {}
	/** @type {Set<string>} */
	#closerCharacters = new Set()
	/** @type {string} */
	pendingIndent = ''
	/** @type {number} */
	pendingIndentPosition = 0
	/** @type {number} */
	pendingSourceSkip = 0

	/**
	 * 重置预测状态
	 * @param {string} fileText 当前文件全文
	 * @returns {void}
	 */
	resetForFile(fileText) {
		this.#indentUnit = detectIndentUnit(fileText)
		this.#bracketPairs = buildHeuristicPairs(fileText)
		this.#closerCharacters = new Set(Object.values(this.#bracketPairs))
		this.pendingIndent = ''
		this.pendingIndentPosition = 0
		this.pendingSourceSkip = 0
	}

	/**
	 * 清空预测状态
	 * @returns {void}
	 */
	clear() {
		this.#indentUnit = '\t'
		this.#bracketPairs = {}
		this.#closerCharacters = new Set()
		this.pendingIndent = ''
		this.pendingIndentPosition = 0
		this.pendingSourceSkip = 0
	}

	/**
	 * 获取开括号到闭括号的启发式映射
	 * @returns {Record<string, string>} 开括号到闭括号的启发式映射
	 */
	get bracketPairs() {
		return this.#bracketPairs
	}

	/**
	 * 获取可能出现的闭括号字符集合
	 * @returns {Set<string>} 可能出现的闭括号字符集合
	 */
	get closerCharacters() {
		return this.#closerCharacters
	}

	/**
	 * 获取当前行在 `visibleSlice` 中的起始索引
	 * @param {TypewriterPlaybackContext} context 打字机播放上下文
	 * @returns {number} 当前行在 `visibleSlice` 中的起始索引
	 */
	#getCurrentLineStart(context) {
		const newlineIndex = context.visibleSlice.lastIndexOf('\n', context.cursor - 1)
		return newlineIndex < 0 ? 0 : newlineIndex + 1
	}

	/**
	 * 获取当前行结束（换行符前）的索引
	 * @param {TypewriterPlaybackContext} context 打字机播放上下文
	 * @returns {number} 当前行结束（换行符前）的索引
	 */
	#getCurrentLineEnd(context) {
		const newlineIndex = context.visibleSlice.indexOf('\n', context.cursor)
		return newlineIndex < 0 ? context.visibleSlice.length : newlineIndex
	}

	/**
	 * 在后续行中查找闭括号
	 * @param {TypewriterPlaybackContext} context 打字机播放上下文
	 * @param {string} closerCharacter 要查找的闭括号字符
	 * @param {number} startRow 起始行号
	 * @param {number} startColumn 起始列号
	 * @param {number} [maxRowOffset] 向下最多搜索行数
	 * @param {number} [maxColumnOffset] 每行左右偏移上限
	 * @returns {number} 找到则返回光标应置于其后的索引，否则 -1
	 */
	#findCloserInNextRows(
		context,
		closerCharacter,
		startRow,
		startColumn,
		maxRowOffset = 3,
		maxColumnOffset = 8,
	) {
		for (let rowDelta = 1; rowDelta <= maxRowOffset; rowDelta++) {
			const row = startRow + rowDelta
			for (let columnDelta = 0; columnDelta <= maxColumnOffset; columnDelta++)
				for (const sign of columnDelta === 0 ? [1] : [1, -1]) {
					const column = startColumn + columnDelta * sign
					if (column < 0) continue
					const characterIndex = indexFromRowCol(context.visibleSlice, row, column)
					if (
						characterIndex !== -1
						&& characterIndex < context.visibleSlice.length
						&& context.visibleSlice[characterIndex] === closerCharacter
					)
						return characterIndex + 1
				}
		}
		return -1
	}

	/**
	 * 将光标移到已有闭括号之后
	 * @param {TypewriterPlaybackContext} context 打字机播放上下文
	 * @param {string} closerCharacter 目标闭括号字符
	 * @returns {boolean} 是否已将光标移到已有闭括号之后
	 */
	#moveCursorToExistingCloser(context, closerCharacter) {
		const rowColumnPosition = rowColFromIndex(context.visibleSlice, context.cursor)
		const nextRowMatch = this.#findCloserInNextRows(
			context,
			closerCharacter,
			rowColumnPosition.row,
			rowColumnPosition.col,
		)
		if (nextRowMatch !== -1) {
			context.cursor = nextRowMatch
			return true
		}
		const searchEnd = Math.min(context.visibleSlice.length, context.cursor + 48)
		for (let index = context.cursor + 1; index < searchEnd; index++) {
			const character = context.visibleSlice[index]
			if (character === '\n') break
			if (character === closerCharacter) {
				context.cursor = index + 1
				return true
			}
			if (!/\s/u.test(character) && !this.#closerCharacters.has(character)) break
		}
		return false
	}

	/**
	 * 清除悬空缩进残留
	 * @param {TypewriterPlaybackContext} context 打字机播放上下文
	 * @returns {void}
	 */
	clearPendingIndentRemainder(context) {
		while (this.pendingIndentPosition < this.pendingIndent.length) {
			const at = context.visibleSlice[context.cursor] || ''
			if (at !== ' ' && at !== '\t') break
			context.deleteAtCursor()
			this.pendingIndentPosition++
		}
		this.pendingIndent = ''
		this.pendingIndentPosition = 0
	}

	/**
	 * 插入开括号并配对
	 * @param {TypewriterPlaybackContext} context 打字机播放上下文
	 * @param {string} openBracket 开括号字符
	 * @returns {void}
	 */
	insertOpeningBracketWithPair(context, openBracket) {
		const close = this.#bracketPairs[openBracket]
		if (!close) {
			context.insert(openBracket)
			return
		}
		// 避免整串 slice 拼接：用 insert 逐步插入，并把光标保持在“开括号与闭括号之间”
		const startCursor = context.cursor
		context.insert(openBracket)
		context.insert(close)
		// cursor 现在已在 close 之后，将其挪回 open 之后
		context.cursor = startCursor + openBracket.length
	}

	/**
	 * 处理开括号
	 * @param {TypewriterPlaybackContext} context 打字机播放上下文
	 * @param {string} character 用户输入的开括号字符
	 * @returns {void}
	 */
	handleOpeningBracket(context, character) {
		const close = this.#bracketPairs[character]
		if (!close) {
			context.insert(character)
			return
		}
		if (close === character) {
			const at = context.visibleSlice[context.cursor] || ''
			if (at === character) context.cursor++
			else if (this.#moveCursorToExistingCloser(context, character)) {
				/* 已跳至现有闭符 */
			} else this.insertOpeningBracketWithPair(context, character)
		} else this.insertOpeningBracketWithPair(context, character)
	}

	/**
	 * 处理闭括号
	 * @param {TypewriterPlaybackContext} context 打字机播放上下文
	 * @param {string} closerCharacter 用户输入的闭括号字符
	 * @returns {void}
	 */
	handleClosingBracket(context, closerCharacter) {
		const at = context.visibleSlice[context.cursor] || ''
		if (at === closerCharacter) {
			context.cursor++
			return
		}
		if (this.#moveCursorToExistingCloser(context, closerCharacter)) return
		if (this.#closerCharacters.has(at) && at !== closerCharacter) {
			if (context.cursor < context.visibleSlice.length) context.cursor++
			if (context.cursor > 0) {
				context.cursor--
				context.deleteAtCursor()
			}
		}
		context.insert(closerCharacter)
	}

	/**
	 * 处理换行符
	 * @param {TypewriterPlaybackContext} context 打字机播放上下文
	 * @returns {void}
	 */
	handleNewline(context) {
		if (context.visibleSlice[context.cursor] === '\n') {
			context.cursor++
			const existingIndent =
				(context.visibleSlice.slice(context.cursor).match(/^[ \t]*/) || [''])[0]
			const firstSignificant = context.visibleSlice[context.cursor + existingIndent.length] || ''
			if (firstSignificant && this.#closerCharacters.has(firstSignificant)) {
				const segment = context.getCurrentSegment()
				const sourceText = segment?.text ?? ''
				let peekPosition = context.sourcePos
				while (
					peekPosition < sourceText.length
					&& (sourceText[peekPosition] === ' ' || sourceText[peekPosition] === '\t')
				)
					peekPosition++
				const peekCharacter = sourceText[peekPosition] || ''
				if (!peekCharacter || this.#closerCharacters.has(peekCharacter)) {
					this.pendingIndent = existingIndent
					this.pendingIndentPosition = 0
				} else {
					const newlinePosition = context.cursor - 1
					const previousLineStart =
						context.visibleSlice.lastIndexOf('\n', newlinePosition - 1) + 1
					const previousLine = context.visibleSlice.slice(previousLineStart, newlinePosition)
					const targetIndent = (previousLine.match(/^[ \t]*/) || [''])[0]
					const insertAt = context.cursor
					// 用 insert 避免整段 slice 拼接
					context.insert(`${targetIndent}\n`)
					// 光标回到新插入内容的开头，后续 pendingIndent 会“消费”这段缩进
					context.cursor = insertAt
					this.pendingIndent = targetIndent
					this.pendingIndentPosition = 0
				}
			} else {
				this.pendingIndent = existingIndent
				this.pendingIndentPosition = 0
			}
			return
		}

		const lineStart = this.#getCurrentLineStart(context)
		const lineEnd = this.#getCurrentLineEnd(context)
		const beforeLine = context.visibleSlice.slice(lineStart, context.cursor)
		const afterLine = context.visibleSlice.slice(context.cursor, lineEnd)
		const baseIndent = (beforeLine.match(/^[ \t]*/) || [''])[0]
		let targetIndent = baseIndent
		if (needExtraIndent(beforeLine)) targetIndent += this.#indentUnit

		const lastSignificant = lastNonWhitespaceCharacter(beforeLine)
		const close = matchingClosingBracket(lastSignificant)
		const tailTrimmed = afterLine.trim()
		let shouldSplitPair =
			!!close
			&& !!tailTrimmed
			&& tailTrimmed[0] === close
			&& [...tailTrimmed].every(character => this.#closerCharacters.has(character))
		if (shouldSplitPair) {
			const segment = context.getCurrentSegment()
			if (segment) {
				let peek = context.sourcePos
				while (peek < segment.text.length && (segment.text[peek] === ' ' || segment.text[peek] === '\t'))
					peek++
				if (segment.text[peek] === close) shouldSplitPair = false
			}
		}
		if (shouldSplitPair) {
			const insert = `\n${targetIndent}\n${baseIndent}`
			const startCursor = context.cursor
			context.insert(insert)
			// 保持光标落在插入内容的第一个缩进行段之后（与原逻辑等价）
			context.cursor = startCursor + 1 + targetIndent.length
			this.pendingIndent = ''
			this.pendingIndentPosition = 0
			this.pendingSourceSkip = targetIndent.length
			return
		}

		context.insert('\n')
		const insertAt = context.cursor
		context.insert(targetIndent)
		// 保持 cursor 在缩进行段起始位置，后续 pendingIndent 会“消费”已插入的空白
		context.cursor = insertAt
		this.pendingIndent = targetIndent
		this.pendingIndentPosition = 0
	}
}
