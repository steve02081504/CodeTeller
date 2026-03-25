/**
 * 全局任务状态通知工具：通过事件总线发布状态与错误，避免 setStatus/setError/runWithStatus 参数透传
 */
import { translate } from '../i18n/uiI18n.mjs'

import { emitEvent, EVENTS } from './eventBus.mjs'

/**
 * 发布状态文案到 UI
 * @param {string} statusKey i18n key
 * @param {Record<string, unknown>} [params] 插值参数
 * @param {boolean} [isError] 是否为错误状态
 * @returns {void}
 */
export function emitStatus(statusKey, params = {}, isError = false) {
	emitEvent(EVENTS.APP_SET_STATUS, { message: translate(statusKey, params), isError })
}

/**
 * 发布错误对象到 UI
 * @param {unknown} error 错误对象
 * @returns {void}
 */
export function emitError(error) {
	emitEvent(EVENTS.APP_SET_ERROR, { error })
}

/**
 * 运行异步任务并更新状态栏；出错时通过事件总线通知，返回 null
 * @param {string} statusKey i18n key
 * @param {() => Promise<unknown>} taskFn 异步任务
 * @param {Record<string, unknown>} [params] 状态文案插值参数
 * @returns {Promise<unknown|null>} 成功为任务返回值，出错为 null
 */
export async function runWithStatus(statusKey, taskFn, params = {}) {
	try {
		emitStatus(statusKey, params)
		return await taskFn()
	} catch (error) {
		emitError(error)
		return null
	}
}
