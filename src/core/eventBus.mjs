/**
 * 轻量应用事件总线：解耦 UI 控制器与主线程渲染
 */
export const AppEvents = new EventTarget()

/**
 * 统一事件名（避免散落字符串）
 */
export const EVENTS = {
	PLAYBACK_NEEDS_RENDER: 'playback:needs-render',
	APP_SET_STATUS: 'app:set-status',
	APP_SET_ERROR: 'app:set-error',

	// Playback command bus（UI -> Controller）
	CMD_PLAYBACK_SET_MODE_AUTO: 'cmd:playback:set-mode-auto',
	CMD_PLAYBACK_SET_MODE_MANUAL: 'cmd:playback:set-mode-manual',
	CMD_PLAYBACK_SET_STEP: 'cmd:playback:set-step',
	CMD_PLAYBACK_SET_SPEED: 'cmd:playback:set-speed',
	CMD_PLAYBACK_TOGGLE_AUTO_PLAY: 'cmd:playback:toggle-auto-play',
	CMD_PLAYBACK_RESET: 'cmd:playback:reset',
	CMD_PLAYBACK_SKIP_FILE: 'cmd:playback:skip-file',
	CMD_PLAYBACK_SKIP_TO_END: 'cmd:playback:skip-to-end',
	CMD_PLAYBACK_STEP_MANUAL: 'cmd:playback:step-manual',
}

/**
 * 触发事件
 * @param {string} eventName 事件名
 * @param {Record<string, unknown>} [detail] 载荷
 * @returns {void}
 */
export function emitEvent(eventName, detail = {}) {
	AppEvents.dispatchEvent(new CustomEvent(eventName, { detail }))
}

/**
 * 监听事件
 * @param {string} eventName 事件名
 * @param {(detail: Record<string, unknown>) => void} callback 回调
 * @returns {void}
 */
export function onEvent(eventName, callback) {
	AppEvents.addEventListener(eventName, event => callback(event.detail))
}
