import { getDirectoryAndFileName } from '../../utils/pathPrefix.mjs'
import { TextBuffer } from '../textBuffer.mjs'

import { PlayerPhase } from './phase.mjs'
import { SyntaxPredictor } from './syntaxPredictor.mjs'

/**
 * 段
 * @typedef {{ path: string, text: string, extension: string, shikiLang: string }} Segment
 */

/**
 * 自 `phase.mjs` 重新导出播放阶段枚举
 * @returns {typeof PlayerPhase} 与 `./phase.mjs` 中导出一致
 */
export { PlayerPhase }

/**
 * 类型写入器播放器类
 */
export class TypewriterPlayer {
	/** @type {Segment[]} */
	segments = []
	mode = 'auto'
	step = 'char'
	playing = true
	charsPerSecond = 22
	accumulatorMilliseconds = 0

	currentFileIndex = 0
	sourcePos = 0
	textBuffer = new TextBuffer('')
	cursor = 0
	phase = PlayerPhase.IDLE
	createdPaths = []
	renameTyped = ''
	#currentName = ''
	#currentDirectory = ''
	/** 播放结束后用户点选浏览的文件路径；未设置时显示最后一个文件 */
	#browsePath = null

	syntaxPredictor = new SyntaxPredictor()

	/**
	 * 加载段列表
	 * @param {Segment[]} segments 段列表
	 * @returns {void}
	 */
	load(segments) {
		this.segments = segments
		this.reset()
	}

	/**
	 * 释放当前加载的文本与播放状态（在切换数据源前调用，减轻大项目 GC 压力）
	 * @returns {void}
	 */
	dispose() {
		this.segments = []
		this.reset()
	}

	/**
	 * 流式加载开始：清空段列表与播放状态，等待首个文件片段
	 * @returns {void}
	 */
	beginStreamingPlayback() {
		this.segments = []
		this.accumulatorMilliseconds = 0
		this.currentFileIndex = 0
		this.sourcePos = 0
		this.textBuffer = new TextBuffer('')
		this.cursor = 0
		this.phase = PlayerPhase.IDLE
		this.createdPaths = []
		this.renameTyped = ''
		this.#currentName = ''
		this.#currentDirectory = ''
		this.syntaxPredictor.clear()
		this.#browsePath = null
	}

	/**
	 * 在流式场景下追加一个已准备好的 Segment（须与 `SegmentBuildSession` 输出一致）
	 * @param {Segment} segment 与 `SegmentBuildSession` 输出一致的文本段
	 * @returns {void}
	 */
	appendSegment(segment) {
		const wasWaiting = this.segments.length === 0
		this.segments.push(segment)
		if (wasWaiting && this.phase === PlayerPhase.END) {
			this.phase = PlayerPhase.IDLE
			this.currentFileIndex = 0
			this.sourcePos = 0
			this.textBuffer = new TextBuffer('')
			this.cursor = 0
			this.createdPaths = []
			this.renameTyped = ''
			this.#currentName = ''
			this.#currentDirectory = ''
			this.syntaxPredictor.clear()
			this.#browsePath = null
		}
	}

	/**
	 * 重置播放器状态
	 * @returns {void}
	 */
	reset() {
		this.accumulatorMilliseconds = 0
		this.currentFileIndex = 0
		this.sourcePos = 0
		this.textBuffer = new TextBuffer('')
		this.cursor = 0
		this.phase = this.segments.length ? PlayerPhase.IDLE : PlayerPhase.END
		this.createdPaths = []
		this.renameTyped = ''
		this.#currentName = ''
		this.#currentDirectory = ''
		this.syntaxPredictor.clear()
		this.#browsePath = null
	}

	/**
	 * 获取是否已播放结束
	 * @returns {boolean} 是否已播放结束
	 */
	get done() {
		return this.phase === PlayerPhase.END
	}

	/**
	 * 获取当前展示的文件路径
	 * @returns {string} 当前展示的文件路径
	 */
	get currentPath() {
		if (this.done) {
			if (!this.segments.length) return ''
			if (this.#browsePath != null) return this.#browsePath
			return this.segments[this.segments.length - 1].path
		}
		if (this.phase === PlayerPhase.RENAME) {
			const name = this.renameTyped || this.#currentName
			return this.#currentDirectory ? `${this.#currentDirectory}/${name}` : name
		}
		const segment = this.segments[this.currentFileIndex]
		return segment ? segment.path : ''
	}

	/**
	 * 获取当前 Shiki 语言 id
	 * @returns {string} Shiki 语言 id
	 */
	get currentShikiLang() {
		const segment = this.done ? this.#getSegmentForDisplay() : this.getCurrentSegment()
		return segment?.shikiLang ?? 'text'
	}

	/**
	 * 获取编辑器可见文本
	 * @returns {string} 编辑器可见文本
	 */
	get visibleSlice() {
		if (this.done) {
			const segment = this.#getSegmentForDisplay()
			if (segment) return segment.text
		}
		return this.textBuffer.toString()
	}

	/**
	 * 获取光标字符索引
	 * @returns {number} 光标字符索引
	 */
	get cursorIndex() {
		if (this.done) return this.visibleSlice.length
		return this.cursor
	}

	/**
	 * 获取当前段
	 * @returns {Segment | null} 当前段
	 */
	getCurrentSegment() {
		return this.segments[this.currentFileIndex] || null
	}

	/**
	 * 获取用于展示的段
	 * @returns {Segment | null} 用于展示的段
	 */
	#getSegmentForDisplay() {
		const path = this.currentPath
		if (!path) return null
		return this.segments.find(segment => segment.path === path) || null
	}

	/**
	 * 在播放结束后用于切换查看的文件内容
	 * @param {string} path 目标路径
	 * @returns {void}
	 */
	selectPath(path) {
		if (!this.done) return
		if (!this.segments.some(segment => segment.path === path)) return
		this.#browsePath = path
	}

	/**
	 * 插入字符
	 * @param {string} character 插入字符（可多长）
	 * @returns {void}
	 */
	insert(character) {
		this.textBuffer.insertAt(this.cursor, character)
		this.cursor += character.length
	}

	/**
	 * 删除光标处的字符
	 * @returns {void}
	 */
	deleteAtCursor() {
		if (this.cursor >= this.textBuffer.length) return
		this.textBuffer.deleteAt(this.cursor)
	}

	/**
	 * 完成当前文件
	 * @returns {void}
	 */
	#completeCurrentFile() {
		const doneSegment = this.getCurrentSegment()
		if (doneSegment) {
			this.textBuffer = new TextBuffer(doneSegment.text)
			this.cursor = doneSegment.text.length
		}
	}

	/**
	 * 移动到下一个文件或结束
	 * @returns {void}
	 */
	#moveToNextFileOrEnd() {
		this.currentFileIndex++
		if (this.currentFileIndex >= this.segments.length) this.phase = PlayerPhase.END
		else this.#enterFile()
	}

	/**
	 * 消费源字符
	 * @returns {boolean} 是否成功消费一符（含缩进占位）
	 */
	#consumeSourceChar() {
		const segment = this.getCurrentSegment()
		if (!segment) return false
		if (this.sourcePos >= segment.text.length) return false
		const character = segment.text[this.sourcePos]
		this.sourcePos++
		const prediction = this.syntaxPredictor
		if (prediction.pendingSourceSkip > 0) {
			if (character === ' ' || character === '\t') {
				prediction.pendingSourceSkip--
				return true
			}
			while (prediction.pendingSourceSkip > 0 && this.cursor > 0) {
				const previous = this.textBuffer.charAt(this.cursor - 1) || ''
				if (previous !== ' ' && previous !== '\t') break
				this.cursor--
				this.deleteAtCursor()
				prediction.pendingSourceSkip--
			}
			prediction.pendingSourceSkip = 0
		}
		if (prediction.pendingIndent) {
			if (character === ' ' || character === '\t') {
				const expected = prediction.pendingIndent[prediction.pendingIndentPosition] || ''
				if (expected === character) {
					const at = this.textBuffer.charAt(this.cursor) || ''
					if (at === character) this.cursor++
					else this.insert(character)
					prediction.pendingIndentPosition++
					if (prediction.pendingIndentPosition >= prediction.pendingIndent.length) {
						prediction.pendingIndent = ''
						prediction.pendingIndentPosition = 0
					}
					return true
				}
				prediction.clearPendingIndentRemainder(this)
				this.insert(character)
				return true
			}
			prediction.clearPendingIndentRemainder(this)
		}
		if (character === '\n') {
			prediction.handleNewline(this)
			return true
		}
		if (prediction.bracketPairs[character]) {
			prediction.handleOpeningBracket(this, character)
			return true
		}
		if (prediction.closerCharacters.has(character)) {
			prediction.handleClosingBracket(this, character)
			return true
		}
		this.insert(character)
		return true
	}

	/**
	 * 重新协调内容
	 * @returns {void}
	 */
	#reconcileContent() {
		if (this.syntaxPredictor.pendingIndentPosition > 0 || this.syntaxPredictor.pendingSourceSkip > 0)
			return
		const segment = this.getCurrentSegment()
		if (!segment) return
		const expectedLeft = segment.text.slice(0, this.sourcePos)
		const currentText = this.textBuffer.toString()
		const actualLeft = currentText.slice(0, this.cursor)

		if (expectedLeft !== actualLeft) {
			console.log(`\
生成错误：
\`\`\`
${actualLeft}
\`\`\`
正确内容：
\`\`\`
${expectedLeft}
\`\`\`
`)
			const rightPart = currentText.slice(this.cursor)
			this.textBuffer = new TextBuffer(expectedLeft + rightPart)
			this.cursor = expectedLeft.length
		}
	}

	/**
	 * 进入文件
	 * @returns {void}
	 */
	#enterFile() {
		const segment = this.getCurrentSegment()
		if (!segment) {
			this.phase = PlayerPhase.END
			return
		}
		const { directory, fileName } = getDirectoryAndFileName(segment.path)
		this.#currentDirectory = directory
		this.#currentName = fileName
		this.renameTyped = ''
		this.textBuffer = new TextBuffer('')
		this.cursor = 0
		this.sourcePos = 0
		this.syntaxPredictor.resetForFile(segment.text)
		this.phase = PlayerPhase.CREATE
	}

	/**
	 * 推进播放阶段
	 * @returns {void}
	 */
	#advancePhase() {
		if (this.phase === PlayerPhase.CREATE) {
			this.phase = PlayerPhase.RENAME
			return
		}
		if (this.phase === PlayerPhase.RENAME) {
			if (this.renameTyped.length < this.#currentName.length)
				this.renameTyped += this.#currentName[this.renameTyped.length]

			if (this.renameTyped.length >= this.#currentName.length) {
				const fullPath =
					this.#currentDirectory ? `${this.#currentDirectory}/${this.#currentName}` : this.#currentName
				if (!this.createdPaths.includes(fullPath)) this.createdPaths.push(fullPath)
				this.phase = PlayerPhase.CONTENT
			}
			return
		}
		if (this.phase === PlayerPhase.CONTENT) {
			const consumed = this.#consumeSourceChar()
			if (consumed) this.#reconcileContent()
			else {
				this.#completeCurrentFile()
				this.#moveToNextFileOrEnd()
			}
		}
	}

	/**
	 * 帧回调
	 * @param {number} deltaTimeMilliseconds 距上一帧毫秒
	 * @returns {void}
	 */
	tick(deltaTimeMilliseconds) {
		if (this.mode !== 'auto' || !this.playing || this.done) return
		if (this.segments.length === 0) return
		if (this.phase === PlayerPhase.IDLE) this.#enterFile()
		this.accumulatorMilliseconds += deltaTimeMilliseconds
		const stepMilliseconds = 1000 / this.charsPerSecond
		while (this.accumulatorMilliseconds >= stepMilliseconds && !this.done) {
			this.accumulatorMilliseconds -= stepMilliseconds
			this.#advancePhase()
		}
	}

	/**
	 * 手动步进
	 * @returns {void}
	 */
	stepManual() {
		if (this.done) return
		if (this.phase === PlayerPhase.IDLE) this.#enterFile()
		if (this.step === 'word' && this.phase === PlayerPhase.CONTENT) {
			let sawNonWhitespace = false
			for (let stepIndex = 0; stepIndex < 200 && !this.done; stepIndex++) {
				const segment = this.getCurrentSegment()
				const nextCharacter =
					segment && this.sourcePos < segment.text.length ? segment.text[this.sourcePos] : ''
				this.#advancePhase()
				if (!nextCharacter) break
				if (!/\s/u.test(nextCharacter)) sawNonWhitespace = true
				else if (sawNonWhitespace) break
			}
			return
		}
		this.#advancePhase()
	}

	/**
	 * 跳过当前文件
	 * @returns {void}
	 */
	skipFile() {
		if (this.done) return
		if (this.phase !== PlayerPhase.CONTENT) this.phase = PlayerPhase.CONTENT

		const segment = this.getCurrentSegment()
		if (segment) {
			this.textBuffer = new TextBuffer(segment.text)
			this.cursor = segment.text.length
		}
		this.#moveToNextFileOrEnd()
	}

	/**
	 * 跳过所有文件
	 * @returns {void}
	 */
	skipAll() {
		if (!this.segments.length) {
			this.phase = PlayerPhase.END
			return
		}
		const lastSegment = this.segments[this.segments.length - 1]
		this.createdPaths = this.segments.map(segment => segment.path)
		this.currentFileIndex = this.segments.length - 1
		this.phase = PlayerPhase.CONTENT
		this.textBuffer = new TextBuffer(lastSegment.text)
		this.cursor = lastSegment.text.length
		this.sourcePos = lastSegment.text.length
		this.phase = PlayerPhase.END
	}
}
