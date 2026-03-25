/**
 * 播放器一帧画面签名：用于 RAF 循环里跳过无变化的重绘
 * @param {{
 *   currentPath: string,
 *   cursorIndex: number,
 *   done: boolean,
 *   phase: string,
 *   currentFileIndex: number,
 *   renameTyped: string,
 *   visibleSlice: string,
 * }} p 播放器状态快照
 * @returns {string} 用于比较是否需重绘的签名串
 */
export function computePaintSig(p) {
	return [
		p.currentPath,
		p.cursorIndex,
		p.done,
		p.phase,
		p.currentFileIndex,
		p.renameTyped,
		p.visibleSlice.length,
	].join('\0')
}
