/**
 * TextBuffer：用于减少频繁 `insert/delete` 时的大字符串整段拷贝。
 *
 * 设计目标：
 * - 插入/删除只修改“落点附近”的 chunk，而不是每次 slice 全量字符串
 * - `toString()` 通过 chunk join，并在内容未变更时复用缓存
 *
 * 注意：
 * - 仍然需要在渲染/预测时把内容转成字符串；该类主要降低“编辑操作”的拷贝开销
 */
export class TextBuffer {
	/** @type {string[]} */
	#chunks = []
	#totalLength = 0
	#stringCache = ''
	#dirty = true

	/**
	 * 当 chunk 数量过多时执行一次合并，避免编辑操作导致碎片化
	 * 进而让 `charAt` / `slice` 退化为过高的遍历成本。
	 */
	#compactIfNeeded() {
		// 阈值越小越“平滑”，越大越“节省合并开销”
		const COMPACT_CHUNK_THRESHOLD = 64
		if (this.#chunks.length <= COMPACT_CHUNK_THRESHOLD) return
		// join 不改变字符语义；仅减少 chunk 数量与遍历次数
		this.#chunks = [this.#chunks.join('')]
		// 内容结构已变更，确保 stringCache 不会被误用
		this.#dirty = true
	}

	/**
	 * 构造函数
	 * @param {string} [initialText] 初始文本内容
	 */
	constructor(initialText = '') {
		if (initialText) this.#chunks = [initialText]
		this.#totalLength = initialText.length
	}

	/**
	 * 获取缓冲区总长度
	 * @returns {number} 缓冲区总长度
	 */
	get length() {
		return this.#totalLength
	}

	/**
	 * 获取缓冲区的完整字符串
	 * @returns {string} 缓冲区的完整字符串
	 */
	toString() {
		if (!this.#dirty) return this.#stringCache
		this.#stringCache = this.#chunks.join('')
		this.#dirty = false
		return this.#stringCache
	}

	/**
	 * 获取索引处字符
	 * @param {number} index 索引位置
	 * @returns {string} 索引处字符；越界则返回空字符串
	 */
	charAt(index) {
		if (index < 0 || index >= this.#totalLength) return ''
		let offset = index
		for (let i = 0; i < this.#chunks.length; i++) {
			const chunk = this.#chunks[i]
			if (offset < chunk.length) return chunk[offset] || ''
			offset -= chunk.length
		}
		return ''
	}

	/**
	 * 获取切片结果
	 * @param {number} start 起始索引（包含）
	 * @param {number} end 结束索引（不包含）
	 * @returns {string} 切片结果
	 */
	slice(start, end) {
		const s = Math.max(0, start)
		const e = Math.min(this.#totalLength, end)
		if (e <= s) return ''

		let offset = s
		const out = []
		let remain = e - s
		for (let i = 0; i < this.#chunks.length && remain > 0; i++) {
			const chunk = this.#chunks[i]
			if (offset >= chunk.length) {
				offset -= chunk.length
				continue
			}
			const take = Math.min(chunk.length - offset, remain)
			out.push(chunk.slice(offset, offset + take))
			remain -= take
			offset = 0
		}
		return out.join('')
	}

	/**
	 * 插入字符串到 index 处
	 * @param {number} index 插入位置索引
	 * @param {string} str 插入的字符串内容
	 * @returns {void}
	 */
	insertAt(index, str) {
		if (!str) return
		const i = Math.max(0, Math.min(index, this.#totalLength))

		// fast path：末尾追加
		if (i === this.#totalLength) {
			this.#chunks.push(str)
			this.#totalLength += str.length
			this.#dirty = true
			this.#compactIfNeeded()
			return
		}

		// locate chunk
		let offset = i
		for (let ci = 0; ci < this.#chunks.length; ci++) {
			const chunk = this.#chunks[ci]
			if (offset > chunk.length) {
				offset -= chunk.length
				continue
			}

			const left = chunk.slice(0, offset)
			const right = chunk.slice(offset)

			const next = []
			if (left) next.push(left)
			next.push(str)
			if (right) next.push(right)

			// replace chunk with split pieces
			this.#chunks.splice(ci, 1, ...next)
			this.#totalLength += str.length
			this.#dirty = true
			this.#compactIfNeeded()
			return
		}
		// 理论上不会走到这里
		this.#chunks.push(str)
		this.#totalLength += str.length
		this.#dirty = true
		this.#compactIfNeeded()
	}

	/**
	 * 删除 index 处的一个字符（相当于 forward delete）
	 * @param {number} index 要删除的字符索引
	 * @returns {void} 无返回值
	 */
	deleteAt(index) {
		if (index < 0 || index >= this.#totalLength) return

		let offset = index
		for (let ci = 0; ci < this.#chunks.length; ci++) {
			const chunk = this.#chunks[ci]
			if (offset >= chunk.length) {
				offset -= chunk.length
				continue
			}

			// offset 落在该 chunk 的具体位置
			const left = chunk.slice(0, offset)
			const right = chunk.slice(offset + 1)
			if (!left && !right)
				this.#chunks.splice(ci, 1)
			else if (!left)
				this.#chunks.splice(ci, 1, right)
			else if (!right)
				this.#chunks.splice(ci, 1, left)
			else
				this.#chunks.splice(ci, 1, left, right)


			this.#totalLength -= 1
			this.#dirty = true
			this.#compactIfNeeded()
			return
		}
	}
}

