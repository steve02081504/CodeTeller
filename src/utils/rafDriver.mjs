/**
 * requestAnimationFrame 驱动器：统一 dt 上限，避免后台 Tab 唤醒时暴走
 * @param {{ maxDeltaMs?: number }} [options] 可选配置
 * @returns {{ startLoop: (fn: (deltaMs: number) => boolean) => void, stopLoop: () => void }} 启停循环方法
 */
export function createRafDriver(options = {}) {
	const maxDeltaMs = options.maxDeltaMs ?? 100
	let rafId = 0
	let lastTs = 0

	/**
	 * 启动循环
	 * @param {(deltaMs: number) => boolean} onFrame 返回 true 则继续下一帧
	 * @returns {void}
	 */
	function startLoop(onFrame) {
		cancelAnimationFrame(rafId)
		lastTs = 0
		/**
		 * 循环
		 * @param {number} timestamp requestAnimationFrame 时间戳
		 * @returns {void}
		 */
		function loop(timestamp) {
			if (!lastTs) lastTs = timestamp
			const deltaMs = Math.min(timestamp - lastTs, maxDeltaMs)
			lastTs = timestamp
			const keepGoing = onFrame(deltaMs)
			if (keepGoing) rafId = requestAnimationFrame(loop)
			else lastTs = 0
		}
		rafId = requestAnimationFrame(loop)
	}

	/**
	 * 停止循环
	 * @returns {void}
	 */
	function stopLoop() {
		cancelAnimationFrame(rafId)
		lastTs = 0
	}

	return { startLoop, stopLoop }
}
