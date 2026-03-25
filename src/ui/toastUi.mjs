import { formatErrorForToast } from '../i18n/uiI18n.mjs'

import { showToast } from './toast.mjs'

/**
 * 替换 statusUi：状态/错误统一以 toast 展示。
 * @returns {{
 *   setStatus: (message: unknown, isError?: boolean) => void,
 *   setError: (error: unknown) => void
 * }} toast 状态/错误注入接口。
 */
export function createToastUi() {
	/**
	 * 设置状态消息并通过 toast 展示。
	 * @param {unknown} message 要显示的消息内容。
	 * @param {boolean} [isError=false] 是否作为错误展示。
	 * @returns {void}
	 */
	function setStatus(message, isError = false) {
		showToast({
			type: isError ? 'error' : 'info',
			message: String(message ?? ''),
		})
	}

	/**
	 * 设置错误消息并通过 toast 展示。
	 * @param {unknown} error 错误对象（可能包含 i18n 信息）。
	 * @returns {void}
	 */
	function setError(error) {
		showToast({
			type: 'error',
			message: formatErrorForToast(error),
			durationMs: 5500,
		})
	}

	return { setStatus, setError }
}

