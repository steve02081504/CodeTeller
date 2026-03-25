/**
 * 创建状态栏
 * @param {HTMLElement | null} statusElement 状态栏节点
 * @returns {{ setStatus: (message: string, isError?: boolean) => void, setError: (error: unknown) => void }} 状态与错误写入方法
 */
export function createStatusBar(statusElement) {
	/**
	 * 设置状态
	 * @param {string} message 文案
	 * @param {boolean} [isError] 是否错误样式
	 * @returns {void}
	 */
	function setStatus(message, isError = false) {
		if (!statusElement) return
		statusElement.textContent = message
		statusElement.classList.toggle('text-error', isError)
		statusElement.classList.toggle('text-success', !isError && !!message)
	}

	/**
	 * 设置错误
	 * @param {unknown} error 任意 Error 或可序列化对象
	 * @returns {void}
	 */
	function setError(error) {
		setStatus(String(error?.message || error), true)
	}

	return { setStatus, setError }
}
